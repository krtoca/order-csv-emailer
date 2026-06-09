import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { AppProvider, Page, Card, Text, BlockStack, Banner, DataTable, Button, InlineStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const REQUIRED_ADMIN_SCOPES = ["read_orders", "read_products", "write_files"];
const OPTIONAL_ADMIN_SCOPES = ["read_all_orders", "read_files"];

function parseScopes(scope?: string | null) {
  return new Set((scope || "").split(",").map((value) => value.trim()).filter(Boolean));
}

function missingScopes(scope?: string | null, required = REQUIRED_ADMIN_SCOPES) {
  const current = parseScopes(scope);
  return required.filter((requiredScope) => !current.has(requiredScope));
}

function mask(value?: string | null) {
  if (!value) return "not set";
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

async function fallbackShopFromDb() {
  const envShop = process.env.PRINT_SHOP_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN || "";
  if (envShop) return envShop;
  const sessions = await prisma.session.findMany({ select: { shop: true }, distinct: ["shop"], take: 2 });
  return sessions.length === 1 ? sessions[0].shop : "";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let shop = "";
  let currentSessionScope = "";
  let authError = "";

  try {
    const { session } = await authenticate.admin(request);
    shop = session.shop;
    currentSessionScope = session.scope || "";
  } catch (error: any) {
    authError = error?.message || String(error || "Authentication failed");
    shop = new URL(request.url).searchParams.get("shop") || await fallbackShopFromDb();
  }

  const sessions = shop
    ? await prisma.session.findMany({
        where: { shop },
        orderBy: { id: "asc" },
        select: {
          id: true,
          shop: true,
          isOnline: true,
          scope: true,
          expires: true,
          accessToken: true,
        },
      })
    : [];

  const offline = sessions.find((item) => !item.isOnline);
  const offlineMissing = missingScopes(offline?.scope);
  const onlineMissing = missingScopes(currentSessionScope);

  return {
    shop: shop || "unknown",
    authError,
    currentSessionScope,
    currentSessionMissing: onlineMissing,
    offlineScope: offline?.scope || "",
    offlineMissing,
    optionalMissing: missingScopes(offline?.scope, OPTIONAL_ADMIN_SCOPES),
    sessions: sessions.map((item) => ({
      id: item.id,
      shop: item.shop,
      isOnline: item.isOnline,
      scope: item.scope || "",
      hasAccessToken: Boolean(item.accessToken),
      expires: item.expires ? item.expires.toISOString() : "never",
    })),
    env: {
      SHOPIFY_API_KEY: mask(process.env.SHOPIFY_API_KEY),
      SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL || "not set",
      SCOPES: process.env.SCOPES || "not set",
      PRINT_SHOP_DOMAIN: process.env.PRINT_SHOP_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN || "not set",
      NODE_ENV: process.env.NODE_ENV || "not set",
    },
  };
};

export default function Diagnostics() {
  const data = useLoaderData<typeof loader>();
  const hasScopeProblem = data.offlineMissing.length > 0 || data.currentSessionMissing.length > 0;

  return (
    <AppProvider i18n={{}}>
      <Page title="One Order Printer diagnostics" backAction={{content: "Home", url: "/app"}}>
        <BlockStack gap="400">
          {data.authError ? (
            <Banner tone="warning" title="Diagnostics opened without an active embedded admin session">
              Showing saved session and environment values using the stored shop fallback. Auth message: {data.authError}
            </Banner>
          ) : null}

          {hasScopeProblem ? (
            <Banner tone="critical" title="Order permission is not active on the saved Shopify token">
              The app runtime may show the correct SCOPES, but the Shopify offline token saved in the Session table must also include read_orders.
              Use Re-authorize. If Shopify does not show the permission approval screen, uninstall and reinstall the app, then return here.
            </Banner>
          ) : (
            <Banner tone="success" title="Order permissions look correct">
              The saved offline token includes the required order print scopes.
            </Banner>
          )}

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Summary</Text>
              <DataTable
                columnContentTypes={["text", "text"]}
                headings={["Field", "Value"]}
                rows={[
                  ["Shop", data.shop],
                  ["Current session scope", data.currentSessionScope || "empty / not authenticated"],
                  ["Current missing required", data.currentSessionMissing.join(", ") || "none"],
                  ["Offline session scope", data.offlineScope || "empty / not found"],
                  ["Offline missing required", data.offlineMissing.join(", ") || "none"],
                  ["Offline missing optional", data.optionalMissing.join(", ") || "none"],
                ]}
              />
              <InlineStack gap="300">
                <Button url={`/app/reauthorize?shop=${encodeURIComponent(data.shop)}&top=1`} target="_top" tone="critical" variant="primary">
                  Delete sessions and re-authorize
                </Button>
                <Button url="/app" target="_top">Back to app home</Button>
              </InlineStack>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Render environment</Text>
              <DataTable
                columnContentTypes={["text", "text"]}
                headings={["Key", "Value"]}
                rows={Object.entries(data.env)}
              />
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Saved Shopify sessions</Text>
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text"]}
                headings={["ID", "Online", "Has token", "Expires", "Scope"]}
                rows={data.sessions.map((session) => [session.id, session.isOnline ? "yes" : "no", session.hasAccessToken ? "yes" : "no", session.expires, session.scope || "empty"])}
              />
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
