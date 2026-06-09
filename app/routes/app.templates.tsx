import {useState} from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";
import { AppProvider, Page, Card, Text, BlockStack, InlineStack, TextField, Checkbox, Select, Button, Banner, Link } from "@shopify/polaris";
import { authenticate, unauthenticated } from "../shopify.server";
import prisma from "../db.server";

const MAX_LOGO_SIZE_BYTES = 1_000_000;
const ALLOWED_LOGO_TYPES = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
]);

const DEFAULT_TEMPLATE = {
  companyName: "One Order Printer",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  logoUrl: "",
  logoFileId: "",
  logoFileName: "",
  logoContentType: "",
  invoiceTitle: "Invoice",
  packingTitle: "Packing List",
  footerText: "Thank you for your order.",
  showSku: true,
  showBarcode: true,
  showVendor: true,
  showCustomerEmail: true,
  showCustomerPhone: true,
  showPrices: true,
  paperSize: "LETTER",
};

function boolValue(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function sanitizeFileName(name: string) {
  return (name || "logo.png").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 90);
}

async function graphqlJson(admin: any, query: string, variables: Record<string, unknown>) {
  const response = await admin.graphql(query, { variables });
  const json = await response.json();
  if (json?.errors?.length) {
    throw new Error(json.errors.map((error: any) => error.message).join("; "));
  }
  return json;
}

async function getShopifyFileUrl(admin: any, fileId: string) {
  if (!fileId) return "";

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const json = await graphqlJson(
      admin,
      `#graphql
        query OneOrderPrinterLogo($id: ID!) {
          node(id: $id) {
            ... on MediaImage {
              id
              fileStatus
              image { url }
              preview { image { url } }
            }
          }
        }
      `,
      { id: fileId },
    );
    const node = json?.data?.node;
    const url = node?.image?.url || node?.preview?.image?.url || "";
    if (url) return url;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  return "";
}

async function uploadLogoToShopifyFiles(admin: any, shop: string, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) return null;

  const ext = ALLOWED_LOGO_TYPES.get(file.type);
  if (!ext) {
    throw new Error("Logo must be PNG or JPG. WEBP is not accepted because PDF rendering is more reliable with PNG/JPG.");
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    throw new Error("Logo file must be 1MB or smaller.");
  }

  const filename = `one-order-printer-${shop.replace(/[^a-zA-Z0-9._-]/g, "-")}-${Date.now()}-${sanitizeFileName(file.name || `logo${ext}`)}`;

  const staged = await graphqlJson(
    admin,
    `#graphql
      mutation OneOrderPrinterStagedUpload($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { field message }
        }
      }
    `,
    {
      input: [
        {
          resource: "IMAGE",
          filename,
          mimeType: file.type,
          httpMethod: "POST",
        },
      ],
    },
  );

  const stagedErrors = staged?.data?.stagedUploadsCreate?.userErrors || [];
  if (stagedErrors.length) {
    throw new Error(stagedErrors.map((error: any) => error.message).join("; "));
  }

  const target = staged?.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url || !target?.resourceUrl) throw new Error("Shopify did not return an upload target for the logo.");

  const uploadForm = new FormData();
  for (const parameter of target.parameters || []) {
    uploadForm.append(parameter.name, parameter.value);
  }
  uploadForm.append("file", new Blob([await file.arrayBuffer()], { type: file.type }), filename);

  const uploadResponse = await fetch(target.url, { method: "POST", body: uploadForm });
  if (!uploadResponse.ok) {
    throw new Error(`Logo upload to Shopify Files failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
  }

  const created = await graphqlJson(
    admin,
    `#graphql
      mutation OneOrderPrinterFileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            ... on MediaImage {
              image { url }
              preview { image { url } }
            }
          }
          userErrors { field message }
        }
      }
    `,
    {
      files: [
        {
          contentType: "IMAGE",
          originalSource: target.resourceUrl,
          alt: "Order printer logo",
        },
      ],
    },
  );

  const createErrors = created?.data?.fileCreate?.userErrors || [];
  if (createErrors.length) {
    throw new Error(createErrors.map((error: any) => error.message).join("; "));
  }

  const shopifyFile = created?.data?.fileCreate?.files?.[0];
  if (!shopifyFile?.id) throw new Error("Shopify Files did not return a logo file ID.");

  const logoUrl = shopifyFile?.image?.url || shopifyFile?.preview?.image?.url || (await getShopifyFileUrl(admin, shopifyFile.id));

  return {
    logoFileId: shopifyFile.id as string,
    logoUrl: logoUrl || "",
    logoFileName: filename,
    logoContentType: file.type,
  };
}

async function resolveFallbackShop(request: Request, formData?: FormData) {
  const url = new URL(request.url);
  const fromForm = String(formData?.get("shop") || "").trim();
  const fromQuery = String(url.searchParams.get("shop") || "").trim();
  const fromEnv = String(process.env.PRINT_SHOP_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN || "").trim();

  if (fromForm) return fromForm;
  if (fromQuery) return fromQuery;
  if (fromEnv) return fromEnv;

  const sessions = await prisma.session.findMany({
    where: { isOnline: false },
    select: { shop: true },
    orderBy: { id: "asc" },
    take: 2,
  });

  if (sessions.length >= 1) return sessions[0].shop;
  return "";
}

async function getAdminContext(request: Request, formData?: FormData) {
  try {
    const auth = await authenticate.admin(request);
    return { shop: auth.session.shop, admin: auth.admin, authWarning: "" };
  } catch (error: any) {
    const shop = await resolveFallbackShop(request, formData);
    if (!shop) {
      return { shop: "", admin: null, authWarning: "Unable to identify the shop. Add PRINT_SHOP_DOMAIN in Render Environment or open the app from Shopify Admin again." };
    }

    try {
      const unauth = await unauthenticated.admin(shop);
      return { shop, admin: unauth.admin, authWarning: "Using offline session fallback because embedded admin authentication was not available for this route." };
    } catch (fallbackError: any) {
      return {
        shop,
        admin: null,
        authWarning: `Using template fallback for ${shop}. Shopify Admin API is not available until the app is re-authorized. ${String(fallbackError?.message || "")}`,
      };
    }
  }
}

async function getOrCreateTemplate(shop: string) {
  if (!shop) {
    return { id: "preview", shop: "", createdAt: new Date(), updatedAt: new Date(), ...DEFAULT_TEMPLATE } as any;
  }
  return prisma.printTemplate.upsert({
    where: { shop },
    update: {},
    create: { shop, ...DEFAULT_TEMPLATE },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, authWarning } = await getAdminContext(request);
  const template = await getOrCreateTemplate(shop);
  return { template, shop, authWarning };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const { shop, admin } = await getAdminContext(request, formData);

  if (!shop) {
    return new Response("Unable to identify shop. Add PRINT_SHOP_DOMAIN in Render Environment and open the app from Shopify Admin again.", { status: 400 });
  }

  const current = await prisma.printTemplate.findUnique({ where: { shop } });

  try {
    let logoUrl = current?.logoUrl || "";
    let logoFileId = current?.logoFileId || "";
    let logoFileName = current?.logoFileName || "";
    let logoContentType = current?.logoContentType || "";
    const removeLogo = formData.get("removeLogo") === "on";
    let uploadedLogo = null;
    const logoFile = formData.get("logoFile");
    if (logoFile instanceof File && logoFile.size > 0) {
      if (!admin) {
        throw new Error("Logo upload requires Shopify Admin API access. Re-authorize the app first, then upload the logo again.");
      }
      uploadedLogo = await uploadLogoToShopifyFiles(admin, shop, logoFile);
    }

    if (removeLogo) {
      logoUrl = "";
      logoFileId = "";
      logoFileName = "";
      logoContentType = "";
    }

    if (uploadedLogo) {
      logoUrl = uploadedLogo.logoUrl;
      logoFileId = uploadedLogo.logoFileId;
      logoFileName = uploadedLogo.logoFileName;
      logoContentType = uploadedLogo.logoContentType;
    }

    const data = {
      companyName: String(formData.get("companyName") || "One Order Printer"),
      companyAddress: String(formData.get("companyAddress") || ""),
      companyPhone: String(formData.get("companyPhone") || ""),
      companyEmail: String(formData.get("companyEmail") || ""),
      logoUrl,
      logoFileId,
      logoFileName,
      logoContentType,
      invoiceTitle: String(formData.get("invoiceTitle") || "Invoice"),
      packingTitle: String(formData.get("packingTitle") || "Packing List"),
      footerText: String(formData.get("footerText") || "Thank you for your order."),
      showSku: boolValue(formData, "showSku"),
      showBarcode: boolValue(formData, "showBarcode"),
      showVendor: boolValue(formData, "showVendor"),
      showCustomerEmail: boolValue(formData, "showCustomerEmail"),
      showCustomerPhone: boolValue(formData, "showCustomerPhone"),
      showPrices: boolValue(formData, "showPrices"),
      paperSize: String(formData.get("paperSize") || "LETTER"),
    };

    await prisma.printTemplate.upsert({
      where: { shop },
      create: { shop, ...data },
      update: data,
    });

    return new Response(null, { status: 303, headers: { Location: `/app/templates?saved=1&shop=${encodeURIComponent(shop)}` } });
  } catch (error: any) {
    return new Response(String(error?.message || "Logo upload failed."), { status: 400 });
  }
};

export default function Templates() {
  const { template, shop, authWarning } = useLoaderData<typeof loader>();
  const [companyName, setCompanyName] = useState(template.companyName ?? "");
  const [companyAddress, setCompanyAddress] = useState(template.companyAddress ?? "");
  const [companyPhone, setCompanyPhone] = useState(template.companyPhone ?? "");
  const [companyEmail, setCompanyEmail] = useState(template.companyEmail ?? "");
  const [invoiceTitle, setInvoiceTitle] = useState(template.invoiceTitle ?? "Invoice");
  const [packingTitle, setPackingTitle] = useState(template.packingTitle ?? "Packing List");
  const [footerText, setFooterText] = useState(template.footerText ?? "");
  const [paperSize, setPaperSize] = useState(template.paperSize ?? "LETTER");
  const [showSku, setShowSku] = useState(Boolean(template.showSku));
  const [showBarcode, setShowBarcode] = useState(Boolean(template.showBarcode));
  const [showVendor, setShowVendor] = useState(Boolean(template.showVendor));
  const [showCustomerEmail, setShowCustomerEmail] = useState(Boolean(template.showCustomerEmail));
  const [showCustomerPhone, setShowCustomerPhone] = useState(Boolean(template.showCustomerPhone));
  const [showPrices, setShowPrices] = useState(Boolean(template.showPrices));

  return (
    <AppProvider i18n={{}}>
      <Page title="Print Templates" subtitle={shop ? `Shop: ${shop}` : "Shop not detected"} backAction={{ content: "Home", url: "/app" }}>
        <Form method="post" encType="multipart/form-data">
          <input type="hidden" name="shop" value={shop || ""} />
          <BlockStack gap="400">
            {authWarning ? (
              <Banner tone="warning" title="Template page is using fallback mode">
                {authWarning}
              </Banner>
            ) : null}
            <Banner tone="info" title="Customize your invoice and packing list">
              Logo files are uploaded to Shopify Files. Your app stores only the Shopify file ID and CDN URL. Customers only see invoices; packing lists remain admin-only.
            </Banner>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Company / Branding</Text>
                <TextField label="Company name" name="companyName" value={companyName} onChange={setCompanyName} autoComplete="off" />
                {template.logoUrl ? (
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">Current logo</Text>
                    <img src={template.logoUrl} alt="Current logo" style={{ maxWidth: 180, maxHeight: 80, objectFit: "contain", border: "1px solid #ddd", padding: 8, borderRadius: 6 }} />
                    <Text as="p" variant="bodySm" tone="subdued">
                      Stored in Shopify Files{template.logoFileId ? " · " : ""}{template.logoFileId ? <Link url={`shopify://admin/content/files`}>Open Files</Link> : null}
                    </Text>
                    <Checkbox label="Remove logo from print templates" name="removeLogo" />
                  </BlockStack>
                ) : null}
                <label htmlFor="logoFile" style={{ fontWeight: 600 }}>Upload logo file</label>
                <input id="logoFile" type="file" name="logoFile" accept="image/png,image/jpeg" aria-label="Upload logo file" />
                <Text as="p" variant="bodySm" tone="subdued">Upload PNG or JPG. Maximum 1MB. The file is saved to Shopify Files and used on Admin invoices, packing lists, and customer invoice PDFs.</Text>
                <TextField label="Company address" name="companyAddress" value={companyAddress} onChange={setCompanyAddress} multiline={3} autoComplete="off" />
                <InlineStack gap="300" align="start">
                  <TextField label="Company phone" name="companyPhone" value={companyPhone} onChange={setCompanyPhone} autoComplete="off" />
                  <TextField label="Company email" name="companyEmail" value={companyEmail} onChange={setCompanyEmail} autoComplete="off" />
                </InlineStack>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Document text</Text>
                <InlineStack gap="300" align="start">
                  <TextField label="Invoice title" name="invoiceTitle" value={invoiceTitle} onChange={setInvoiceTitle} autoComplete="off" />
                  <TextField label="Packing list title" name="packingTitle" value={packingTitle} onChange={setPackingTitle} autoComplete="off" />
                </InlineStack>
                <TextField label="Footer text" name="footerText" value={footerText} onChange={setFooterText} multiline={3} autoComplete="off" />
                <Select label="Paper size" name="paperSize" value={paperSize} onChange={setPaperSize} options={[{ label: "Letter", value: "LETTER" }, { label: "A4", value: "A4" }]} />
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Fields to show</Text>
                <Checkbox label="Show SKU" name="showSku" checked={showSku} onChange={setShowSku} />
                <Checkbox label="Show barcode" name="showBarcode" checked={showBarcode} onChange={setShowBarcode} />
                <Checkbox label="Show vendor" name="showVendor" checked={showVendor} onChange={setShowVendor} />
                <Checkbox label="Show customer email" name="showCustomerEmail" checked={showCustomerEmail} onChange={setShowCustomerEmail} />
                <Checkbox label="Show customer phone" name="showCustomerPhone" checked={showCustomerPhone} onChange={setShowCustomerPhone} />
                <Checkbox label="Show prices on invoice" name="showPrices" checked={showPrices} onChange={setShowPrices} />
              </BlockStack>
            </Card>
            <InlineStack gap="300">
              <Button submit variant="primary">Save template</Button>
              <Button url="/app">Cancel</Button>
            </InlineStack>
          </BlockStack>
        </Form>
      </Page>
    </AppProvider>
  );
}
