import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { AppProvider, Page, Card, Text, BlockStack, List, Banner, IndexTable, Link, Badge, Button, InlineStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const REQUIRED_ADMIN_SCOPES = ["read_orders", "read_products", "write_files"];
const OPTIONAL_ADMIN_SCOPES = ["read_all_orders", "read_files"];

function parseScopes(scope?: string | null) {
  return new Set((scope || "").split(",").map((value) => value.trim()).filter(Boolean));
}

function missingAdminScopes(scope?: string | null) {
  const current = parseScopes(scope);
  return REQUIRED_ADMIN_SCOPES.filter((required) => !current.has(required));
}

function missingOptionalScopes(scope?: string | null) {
  const current = parseScopes(scope);
  return OPTIONAL_ADMIN_SCOPES.filter((required) => !current.has(required));
}

function topLevelReauthorizeUrl(shop: string) {
  return `/app/reauthorize?shop=${encodeURIComponent(shop)}&top=1`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const missing = missingAdminScopes(session.scope);
  const optionalMissing = missingOptionalScopes(session.scope);

  const savedPdfs = await prisma.savedPdf.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      orderName: true,
      documentType: true,
      fileName: true,
      sizeBytes: true,
      createdAt: true,
    },
  });

  return {
    shop: session.shop,
    sessionScope: session.scope || "",
    missing,
    optionalMissing,
    savedPdfs,
    appUrl: process.env.SHOPIFY_APP_URL || "",
    envScopes: process.env.SCOPES || "",
  };
};

export default function Index() {
  const { shop, savedPdfs, sessionScope, missing, optionalMissing, appUrl, envScopes } = useLoaderData<typeof loader>();
  const hasMissingScopes = missing.length > 0;

  return (
    <AppProvider i18n={{}}>
      <Page title="One Order Printer">
        <BlockStack gap="400">
          {hasMissingScopes ? (
            <Banner tone="critical" title="App permissions need to be updated">
              <BlockStack gap="200">
                <Text as="p">This app is installed, but the current Shopify session is missing required order permissions.</Text>
                <Text as="p">Missing required: {missing.join(", ")}</Text>
                {optionalMissing.length ? <Text as="p" tone="subdued">Optional missing: {optionalMissing.join(", ")}</Text> : null}
                <Text as="p">Current session scope: {sessionScope || "(empty)"}</Text>
                <Text as="p">Render SCOPES: {envScopes || "(empty)"}</Text>
                <InlineStack gap="300">
                  <Button url={topLevelReauthorizeUrl(shop)} target="_top" tone="critical" variant="primary">
                    Delete sessions and re-authorize
                  </Button>
                  <Button url="/app/diagnostics" target="_top">Open diagnostics</Button>
                </InlineStack>
              </BlockStack>
            </Banner>
          ) : (
            <Banner tone="success" title="App installed">
              Open a Shopify order and use Print → One Order Printer to print, download, or save an invoice / packing list PDF.
            </Banner>
          )}

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Connected shop</Text>
              <Text as="p">{shop}</Text>
              <Text as="p" tone="subdued">App URL: {appUrl}</Text>
              <List>
                <List.Item>Order detail print action extension</List.Item>
                <List.Item>Invoice and packing list templates</List.Item>
                <List.Item>PDF open, direct download, and save-to-account</List.Item>
                <List.Item>Customizable invoice and packing list templates</List.Item>
              </List>
              <InlineStack gap="300">
                <Button url="/app/templates" variant="primary">Customize print templates</Button>
                <Button url="/app/diagnostics" target="_top">Open diagnostics</Button>
                <Button url={topLevelReauthorizeUrl(shop)} target="_top" tone="critical">Re-authorize app permissions</Button>
              </InlineStack>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Saved PDF downloads</Text>
              {savedPdfs.length === 0 ? (
                <Text as="p" tone="subdued">No PDFs saved yet. Open an order, use Print → One Order Printer, then click Save to Account.</Text>
              ) : (
                <IndexTable
                  resourceName={{ singular: "PDF", plural: "PDFs" }}
                  itemCount={savedPdfs.length}
                  selectable={false}
                  headings={[
                    { title: "Order" },
                    { title: "Type" },
                    { title: "Created" },
                    { title: "Size" },
                    { title: "Download" },
                  ]}
                >
                  {savedPdfs.map((pdf, index) => (
                    <IndexTable.Row id={pdf.id} key={pdf.id} position={index}>
                      <IndexTable.Cell><Text as="span" fontWeight="semibold">{pdf.orderName}</Text></IndexTable.Cell>
                      <IndexTable.Cell><Badge>{pdf.documentType}</Badge></IndexTable.Cell>
                      <IndexTable.Cell>{new Date(pdf.createdAt).toLocaleString()}</IndexTable.Cell>
                      <IndexTable.Cell>{formatBytes(pdf.sizeBytes)}</IndexTable.Cell>
                      <IndexTable.Cell><Link url={`/saved-pdfs/${pdf.id}`}>Download PDF</Link></IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
