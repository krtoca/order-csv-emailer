import type { LoaderFunctionArgs } from "react-router";
import PDFDocument from "pdfkit";
import path from "node:path";
import { authenticate, unauthenticated } from "../shopify.server";
import prisma from "../db.server";

type MoneyBag = { amount?: string; currencyCode?: string } | null;

type PrintTemplate = {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  logoUrl: string;
  invoiceTitle: string;
  packingTitle: string;
  footerText: string;
  showSku: boolean;
  showBarcode: boolean;
  showVendor: boolean;
  showCustomerEmail: boolean;
  showCustomerPhone: boolean;
  showPrices: boolean;
  paperSize: string;
};

const DEFAULT_TEMPLATE: PrintTemplate = {
  companyName: "One Order Printer",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  logoUrl: "",
  invoiceTitle: "Invoice",
  packingTitle: "Packing List",
  footerText: "Thank you for your order.",
  showSku: true,
  showBarcode: true,
  showVendor: false,
  showCustomerEmail: true,
  showCustomerPhone: true,
  showPrices: true,
  paperSize: "LETTER",
};


async function getLogoImageData(logoUrl: string) {
  if (!logoUrl) return null;
  try {
    if (logoUrl.startsWith("/")) {
      const { readFile } = await import("node:fs/promises");
      const localPath = path.join(process.cwd(), "public", logoUrl.replace(/^\/+/, ""));
      return await readFile(localPath);
    }

    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function addLogoImage(doc: any, logoImage: Buffer | null, x = 50, y = 42) {
  if (!logoImage) return false;
  try {
    doc.image(logoImage, x, y, { fit: [110, 45], align: "left", valign: "top" });
    return true;
  } catch {
    return false;
  }
}

async function loadTemplate(shop: string): Promise<PrintTemplate> {
  const template = await prisma.printTemplate.findUnique({ where: { shop } });
  return { ...DEFAULT_TEMPLATE, ...(template || {}), showVendor: false } as PrintTemplate;
}


function safe(value: unknown) {
  return String(value ?? "");
}

function money(value: MoneyBag) {
  if (!value?.amount) return "";
  return `${Number(value.amount).toFixed(2)} ${value.currencyCode || ""}`.trim();
}

function date(value: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString();
}

function extractShopFromToken(token: any) {
  const dest = token?.dest || token?.aud || token?.iss || "";
  try {
    const url = new URL(dest.startsWith("http") ? dest : `https://${dest}`);
    return url.hostname;
  } catch {
    return String(dest).replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

function customerTokenMatchesOrder(sessionToken: any, orderCustomerId?: string) {
  if (!orderCustomerId) return false;
  const tokenValues = [sessionToken?.sub, sessionToken?.customerId, sessionToken?.customer_id, sessionToken?.dest].filter(Boolean).map(String);
  const orderNumeric = orderCustomerId.split("/").pop();
  return tokenValues.some((value) => value === orderCustomerId || value.includes(orderCustomerId) || (orderNumeric && value.includes(orderNumeric)));
}

async function loadOrderForCustomer(request: Request, orderId: string, sessionToken: any) {
  const shop = extractShopFromToken(sessionToken);
  if (!shop || !shop.includes("myshopify.com")) throw new Error("Unable to identify shop from customer session.");

  const { admin } = await unauthenticated.admin(shop);
  const response = await admin.graphql(
    `#graphql
      query CustomerOrderPdf($id: ID!) {
        order(id: $id) {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          customer { id displayName email phone }
          shippingAddress { name company address1 address2 city province provinceCode zip country phone }
          billingAddress { name company address1 address2 city province provinceCode zip country phone }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          totalShippingPriceSet { shopMoney { amount currencyCode } }
          totalTaxSet { shopMoney { amount currencyCode } }
          totalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 250) {
            nodes {
              title
              variantTitle
              sku
              quantity
              originalTotalSet { shopMoney { amount currencyCode } }
              variant { barcode product { vendor } }
            }
          }
        }
      }
    `,
    { variables: { id: orderId } },
  );

  const json = await response.json();
  const order = json?.data?.order;
  if (!order) throw new Error("Order not found.");
  if (!customerTokenMatchesOrder(sessionToken, order.customer?.id)) {
    throw new Error("This order does not belong to the logged-in customer.");
  }
  return { shop, order };
}

function addressLines(address: any) {
  if (!address) return ["No address"];
  return [
    [address.name, address.company].filter(Boolean).join(" / "),
    address.address1,
    address.address2,
    [address.city, address.provinceCode || address.province, address.zip].filter(Boolean).join(", "),
    address.country,
    address.phone ? `Phone: ${address.phone}` : "",
  ].filter(Boolean).map(String);
}

function collectPdf(doc: any) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function addHeader(doc: any, title: string, order: any, template: PrintTemplate, logoImage: Buffer | null) {
  const hasLogo = addLogoImage(doc, logoImage, 50, 42);
  const textX = hasLogo ? 170 : 50;
  const textWidth = hasLogo ? 145 : 260;
  doc.fontSize(18).font("Helvetica-Bold").fillColor("#111111").text(template.companyName || "One Order Printer", textX, 45, { width: textWidth });
  const info = [template.companyAddress, template.companyPhone ? `Phone: ${template.companyPhone}` : "", template.companyEmail].filter(Boolean).join("\n");
  if (info) doc.fontSize(8).font("Helvetica").text(info, textX, 68, { width: textWidth });
  doc.fontSize(18).font("Helvetica-Bold").text(title, 370, 45, { width: 180, align: "right" });
  doc.fontSize(9).font("Helvetica").text(`Order: ${order.name || ""}`, 370, 70, { width: 180, align: "right" });
  doc.text(`Date: ${date(order.createdAt)}`, 370, 84, { width: 180, align: "right" });
  doc.moveTo(50, 105).lineTo(562, 105).lineWidth(1.5).stroke();
}

function addBox(doc: any, title: string, lines: string[], x: number, y: number) {
  doc.roundedRect(x, y, 245, 88, 4).lineWidth(0.5).strokeColor("#cccccc").stroke();
  doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text(title.toUpperCase(), x + 8, y + 8, { width: 229 });
  doc.font("Helvetica").fontSize(9).fillColor("#111111");
  let cursor = y + 24;
  for (const line of lines) {
    doc.text(line, x + 8, cursor, { width: 229 });
    cursor += 12;
  }
}

function addItems(doc: any, order: any, y: number, includePrices: boolean, template: PrintTemplate) {
  includePrices = includePrices && template.showPrices;
  const rows = order?.lineItems?.nodes || [];
  const headers = ["#", "Item", ...(template.showSku ? ["SKU"] : []), "Qty", ...(includePrices ? ["Amount"] : [])];
  const xs = headers.length === 5 ? [50, 75, 355, 455, 505] : headers.length === 4 ? [50, 75, 385, 505] : [50, 75, 505];

  const drawHeader = () => {
    doc.rect(50, y, 512, 20).fillAndStroke("#f0f0f0", "#cccccc");
    doc.fillColor("#111111").fontSize(8).font("Helvetica-Bold");
    headers.forEach((header, index) => {
      const next = xs[index + 1] || 562;
      doc.text(header, xs[index] + 4, y + 6, { width: next - xs[index] - 8, align: header === "Qty" || header === "Amount" ? "right" : "left" });
    });
    y += 20;
  };

  drawHeader();
  rows.forEach((item: any, index: number) => {
    if (y + 42 > 720) {
      doc.addPage();
      y = 50;
      drawHeader();
    }
    doc.rect(50, y, 512, 42).strokeColor("#dddddd").stroke();
    const variantTitle = item.variantTitle && item.variantTitle !== "Default Title" ? item.variantTitle : "";
    doc.fillColor("#111111").fontSize(8).font("Helvetica");
    doc.text(String(index + 1), xs[0] + 4, y + 6, { width: xs[1] - xs[0] - 8 });
    doc.font("Helvetica-Bold").text(safe(item.title), xs[1] + 4, y + 6, { width: xs[2] - xs[1] - 8, height: 12 });
    if (variantTitle) doc.font("Helvetica").fillColor("#555555").text(variantTitle, xs[1] + 4, y + 20, { width: xs[2] - xs[1] - 8 });
    doc.fillColor("#111111").font("Helvetica");
    let cellIndex = 2;
    if (template.showSku) {
      doc.text(safe(item.sku), xs[cellIndex] + 4, y + 6, { width: xs[cellIndex + 1] - xs[cellIndex] - 8 });
      cellIndex += 1;
    }
    doc.text(safe(item.quantity), xs[cellIndex] + 4, y + 6, { width: (xs[cellIndex + 1] || 562) - xs[cellIndex] - 8, align: "right" });
    if (includePrices) doc.text(money(item.originalTotalSet?.shopMoney), xs[cellIndex + 1] + 4, y + 6, { width: 562 - xs[cellIndex + 1] - 8, align: "right" });
    y += 42;
  });
  return y + 14;
}

function addTotals(doc: any, order: any, y: number) {
  if (y + 80 > 720) {
    doc.addPage();
    y = 50;
  }
  const rows = [
    ["Subtotal", money(order.subtotalPriceSet?.shopMoney)],
    ["Shipping", money(order.totalShippingPriceSet?.shopMoney)],
    ["Tax", money(order.totalTaxSet?.shopMoney)],
    ["Total", money(order.totalPriceSet?.shopMoney)],
  ];
  rows.forEach(([label, value], index) => {
    doc.fontSize(9).font(index === rows.length - 1 ? "Helvetica-Bold" : "Helvetica");
    doc.text(label, 365, y, { width: 90 });
    doc.text(value, 455, y, { width: 107, align: "right" });
    y += 16;
  });
}

async function makeCustomerPdf(order: any, type: string, template: PrintTemplate) {
  const logoImage = await getLogoImageData(template.logoUrl);
  const doc = new PDFDocument({ size: template.paperSize === "A4" ? "A4" : "LETTER", margin: 50, autoFirstPage: false });
  const done = collectPdf(doc);
  const isPacking = type === "packing";

  doc.addPage();
  addHeader(doc, isPacking ? template.packingTitle : template.invoiceTitle, order, template, logoImage);
  addBox(doc, isPacking ? "Ship To" : "Bill To", addressLines(isPacking ? order.shippingAddress : (order.billingAddress || order.shippingAddress)), 50, 125);
  addBox(doc, isPacking ? "Customer" : "Ship To", isPacking ? [order.customer?.displayName || "", template.showCustomerEmail ? order.customer?.email || "" : "", template.showCustomerPhone ? order.customer?.phone || "" : ""].filter(Boolean) : addressLines(order.shippingAddress), 317, 125);
  const y = addItems(doc, order, 235, !isPacking, template);
  if (!isPacking && template.showPrices) addTotals(doc, order, y);
  doc.fontSize(9).font("Helvetica").fillColor("#666666").text(template.footerText || "", 50, y + 80, { width: 512 });
  doc.end();
  return done;
}

function safeFilePart(value: unknown) {
  return String(value || "order").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "order";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { sessionToken, cors } = await authenticate.public.customerAccount(request, {
      corsHeaders: ["Content-Type", "Content-Disposition", "Cache-Control"],
    });

    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId") || "";
    const type = "invoice"; // Customer Account only supports Invoice PDFs. Packing Lists are admin-only.
    if (!orderId.startsWith("gid://shopify/Order/")) {
      return cors(new Response("Missing orderId.", { status: 400 }));
    }

    const { shop, order } = await loadOrderForCustomer(request, orderId, sessionToken);
    const template = await loadTemplate(shop);
    const pdf = await makeCustomerPdf(order, type, template);
    const filename = `${safeFilePart(order.name)}-${type}.pdf`;
    return cors(new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    }));
  } catch (error: any) {
    const message = error?.message || "Unable to generate PDF.";
    try {
      const { cors } = await authenticate.public.customerAccount(request, {
        corsHeaders: ["Content-Type"],
      });
      return cors(new Response(message, { status: 403, headers: { "Content-Type": "text/plain" } }));
    } catch {
      return new Response(message, { status: 403, headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" } });
    }
  }
};
