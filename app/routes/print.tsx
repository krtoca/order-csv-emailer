import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import PDFDocument from "pdfkit";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { authenticate, unauthenticated } from "../shopify.server";
import prisma from "../db.server";

type MoneyBag = { shopMoney?: { amount?: string; currencyCode?: string } } | null;

type PrintTypes = {
  invoice: boolean;
  packingSlip: boolean;
};

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
  showVendor: true,
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
  return { ...DEFAULT_TEMPLATE, ...(template || {}) } as PrintTemplate;
}


function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(value: MoneyBag) {
  const amount = value?.shopMoney?.amount;
  const currency = value?.shopMoney?.currencyCode || "";
  if (!amount) return "";
  return `${Number(amount).toFixed(2)} ${currency}`.trim();
}

function safeDate(value: string) {
  if (!value) return "";
  return new Date(value).toLocaleString();
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
  ].filter(Boolean);
}

function addressHtml(address: any) {
  return addressLines(address).map((line) => `<div>${escapeHtml(line)}</div>`).join("");
}

function selectedPrintTypes(raw: string | null): PrintTypes {
  const parts = String(raw || "Invoice,Packing Slip")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return {
    invoice: parts.length === 0 || parts.includes("invoice"),
    packingSlip: parts.length === 0 || parts.includes("packing slip") || parts.includes("packing-slip") || parts.includes("packing"),
  };
}


function printTypeLabel(printTypes: PrintTypes) {
  const labels = [];
  if (printTypes.invoice) labels.push("Invoice");
  if (printTypes.packingSlip) labels.push("Packing Slip");
  return labels.join(" + ") || "Order PDF";
}

function safeFilePart(value: unknown) {
  return String(value || "order")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80) || "order";
}

async function savePdfToAccount(args: {
  shop: string;
  orderId: string;
  orderName: string;
  documentType: string;
  pdf: Buffer;
}) {
  const folder = path.join(process.cwd(), "public", "generated-pdfs", args.shop);
  await mkdir(folder, { recursive: true });
  const fileName = `${safeFilePart(args.orderName)}-${Date.now()}.pdf`;
  const filePath = path.join(folder, fileName);
  await writeFile(filePath, args.pdf);

  return prisma.savedPdf.create({
    data: {
      shop: args.shop,
      orderId: args.orderId,
      orderName: args.orderName,
      documentType: args.documentType,
      fileName,
      filePath,
      sizeBytes: args.pdf.length,
    },
  });
}

function css() {
  return `
    @page { size: var(--paper-size, Letter); margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 12px; margin: 0; }
    .toolbar { position: sticky; top: 0; background: white; border-bottom: 1px solid #d1d5db; padding: 10px 12px; margin-bottom: 14px; display: flex; gap: 8px; align-items: center; }
    .toolbar a, .toolbar button { border: 1px solid #111827; background: #111827; color: white; border-radius: 6px; padding: 8px 12px; text-decoration: none; font-size: 13px; cursor: pointer; }
    .toolbar a.secondary { background: white; color: #111827; }
    .document { page-break-after: always; padding: 0; }
    .document:last-child { page-break-after: auto; }
    .top { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 18px; }
    .brand { font-size: 22px; font-weight: 700; letter-spacing: .2px; }
    .company-block { line-height: 1.35; color: #374151; margin-top: 4px; white-space: pre-line; }
    .logo { max-width: 160px; max-height: 70px; object-fit: contain; display: block; margin-bottom: 6px; }
    .doc-title { font-size: 18px; font-weight: 700; text-align: right; }
    .meta { margin-top: 4px; color: #374151; line-height: 1.45; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 18px; }
    .box { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px; min-height: 82px; }
    .box-title { font-weight: 700; margin-bottom: 6px; font-size: 12px; text-transform: uppercase; color: #374151; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { text-align: left; background: #f3f4f6; color: #111827; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; border: 1px solid #d1d5db; padding: 7px; }
    td { border: 1px solid #d1d5db; padding: 7px; vertical-align: top; }
    .right { text-align: right; }
    .center { text-align: center; }
    .muted { color: #6b7280; }
    .sku { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; }
    .totals { width: 300px; margin-left: auto; margin-top: 16px; }
    .totals td { border-left: 0; border-right: 0; }
    .totals .grand td { font-weight: 700; font-size: 13px; border-top: 2px solid #111827; }
    .footer { margin-top: 24px; border-top: 1px solid #d1d5db; padding-top: 10px; color: #6b7280; font-size: 11px; }
    @media print { .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  `;
}

function itemRows(order: any, includePrices: boolean, template: PrintTemplate) {
  const rows = order?.lineItems?.nodes || [];
  return rows.map((item: any, index: number) => {
    const vendor = item?.variant?.product?.vendor || "";
    const barcode = item?.variant?.barcode || "";
    const variantTitle = item?.variantTitle && item.variantTitle !== "Default Title" ? item.variantTitle : "";
    return `<tr>
      <td class="center">${index + 1}</td>
      <td>
        <div><strong>${escapeHtml(item.title)}</strong></div>
        ${variantTitle ? `<div class="muted">${escapeHtml(variantTitle)}</div>` : ""}
        ${template.showVendor && vendor ? `<div class="muted">Vendor: ${escapeHtml(vendor)}</div>` : ""}
      </td>
      ${template.showSku ? `<td class="sku">${escapeHtml(item.sku || "")}</td>` : ""}
      ${template.showBarcode ? `<td class="sku">${escapeHtml(barcode)}</td>` : ""}
      <td class="center">${escapeHtml(item.quantity)}</td>
      ${includePrices && template.showPrices ? `<td class="right">${escapeHtml(money(item.originalTotalSet))}</td>` : ""}
    </tr>`;
  }).join("");
}

function itemHeaders(includePrices: boolean, template: PrintTemplate) {
  return `<tr><th style="width:40px">#</th><th>Item</th>${template.showSku ? `<th style="width:120px">SKU</th>` : ""}${template.showBarcode ? `<th style="width:120px">Barcode</th>` : ""}<th style="width:55px">Qty</th>${includePrices && template.showPrices ? `<th style="width:100px" class="right">Amount</th>` : ""}</tr>`;
}

function companyHtml(template: PrintTemplate) {
  const lines = [template.companyAddress, template.companyPhone ? `Phone: ${template.companyPhone}` : "", template.companyEmail].filter(Boolean).map(escapeHtml).join("\n");
  return `${template.logoUrl ? `<img class="logo" src="${escapeHtml(template.logoUrl)}" />` : ""}<div class="brand">${escapeHtml(template.companyName)}</div>${lines ? `<div class="company-block">${lines}</div>` : ""}`;
}

function invoiceHtml(order: any, template: PrintTemplate) {
  return `<section class="document">
    <div class="top">
      <div>
        ${companyHtml(template)}
      </div>
      <div>
        <div class="doc-title">${escapeHtml(template.invoiceTitle)}</div>
        <div class="meta">
          <div><strong>Order:</strong> ${escapeHtml(order.name)}</div>
          <div><strong>Date:</strong> ${escapeHtml(safeDate(order.createdAt))}</div>
          <div><strong>Payment:</strong> ${escapeHtml(order.displayFinancialStatus || "")}</div>
          <div><strong>Fulfillment:</strong> ${escapeHtml(order.displayFulfillmentStatus || "")}</div>
        </div>
      </div>
    </div>
    <div class="grid">
      <div class="box"><div class="box-title">Bill To</div>${addressHtml(order.billingAddress || order.shippingAddress)}</div>
      <div class="box"><div class="box-title">Ship To</div>${addressHtml(order.shippingAddress)}</div>
    </div>
    <table>
      <thead>${itemHeaders(true, template)}</thead>
      <tbody>${itemRows(order, true, template)}</tbody>
    </table>
${template.showPrices ? `<table class="totals">
      <tr><td>Subtotal</td><td class="right">${escapeHtml(money(order.subtotalPriceSet))}</td></tr>
      <tr><td>Shipping</td><td class="right">${escapeHtml(money(order.totalShippingPriceSet))}</td></tr>
      <tr><td>Tax</td><td class="right">${escapeHtml(money(order.totalTaxSet))}</td></tr>
      <tr class="grand"><td>Total</td><td class="right">${escapeHtml(money(order.totalPriceSet))}</td></tr>
    </table>` : ""}
    <div class="footer">${escapeHtml(template.footerText)}</div>
  </section>`;
}

function packingSlipHtml(order: any, template: PrintTemplate) {
  return `<section class="document">
    <div class="top">
      <div>
        ${companyHtml(template)}
        <div class="meta">No prices shown</div>
      </div>
      <div>
        <div class="doc-title">${escapeHtml(template.packingTitle)}</div>
        <div class="meta">
          <div><strong>Order:</strong> ${escapeHtml(order.name)}</div>
          <div><strong>Date:</strong> ${escapeHtml(safeDate(order.createdAt))}</div>
          <div><strong>Fulfillment:</strong> ${escapeHtml(order.displayFulfillmentStatus || "")}</div>
        </div>
      </div>
    </div>
    <div class="grid">
      <div class="box"><div class="box-title">Ship To</div>${addressHtml(order.shippingAddress)}</div>
      <div class="box"><div class="box-title">Customer</div>
        <div>${escapeHtml(order.customer?.displayName || "Guest customer")}</div>
        ${template.showCustomerEmail ? `<div>${escapeHtml(order.customer?.email || "")}</div>` : ""}
        ${template.showCustomerPhone ? `<div>${escapeHtml(order.customer?.phone || "")}</div>` : ""}
      </div>
    </div>
    <table>
      <thead>${itemHeaders(false, template)}</thead>
      <tbody>${itemRows(order, false, template)}</tbody>
    </table>
    <div class="footer">Checked by: ____________________ &nbsp;&nbsp; Packed by: ____________________<br/>${escapeHtml(template.footerText)}</div>
  </section>`;
}

function pageHtml(content: string, _pdfUrl?: string, _downloadPdfUrl?: string, template: PrintTemplate = DEFAULT_TEMPLATE) {
  // Shopify Admin Print Action renders this HTML inside a sandboxed print preview.
  // That preview does not allow script execution, so the printable document must be
  // fully static HTML/CSS only. Do not include inline event handlers, App Bridge,
  // Polaris scripts, or window.print() calls here.
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Print Order</title>
<style>:root { --paper-size: ${template.paperSize === "A4" ? "A4" : "Letter"}; }${css()}</style>
</head>
<body>${content}</body>
</html>`;
}

function collectPdf(doc: any) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer | Uint8Array | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function pdfText(doc: any, text: unknown, options?: any) {
  doc.text(String(text ?? ""), options);
}

function addHeader(doc: any, title: string, order: any, template: PrintTemplate, logoImage: Buffer | null, subtitle?: string) {
  const hasLogo = addLogoImage(doc, logoImage, 50, 42);
  const textX = hasLogo ? 170 : 50;
  const textWidth = hasLogo ? 145 : 260;
  doc.fontSize(18).font("Helvetica-Bold").fillColor("#111111").text(template.companyName || "One Order Printer", textX, 45, { width: textWidth });
  const info = [template.companyAddress, template.companyPhone ? `Phone: ${template.companyPhone}` : "", template.companyEmail].filter(Boolean).join("\n");
  if (info) doc.fontSize(8).font("Helvetica").fillColor("#555555").text(info, textX, 68, { width: textWidth });
  else if (subtitle) doc.fontSize(9).font("Helvetica").fillColor("#555555").text(subtitle, textX, 68, { width: textWidth });
  doc.fillColor("#111111").fontSize(18).font("Helvetica-Bold").text(title, 370, 45, { width: 180, align: "right" });
  doc.fontSize(9).font("Helvetica").text(`Order: ${order.name || ""}`, 370, 70, { width: 180, align: "right" });
  doc.text(`Date: ${safeDate(order.createdAt)}`, 370, 84, { width: 180, align: "right" });
  doc.moveTo(50, 105).lineTo(562, 105).lineWidth(1.5).strokeColor("#111111").stroke();
  doc.strokeColor("#000000").fillColor("#111111");
}

function addAddressBox(doc: any, title: string, lines: string[], x: number, y: number, w: number, h: number) {
  doc.roundedRect(x, y, w, h, 4).lineWidth(0.5).strokeColor("#cccccc").stroke();
  doc.fillColor("#333333").fontSize(8).font("Helvetica-Bold").text(title.toUpperCase(), x + 8, y + 8, { width: w - 16 });
  doc.font("Helvetica").fontSize(9).fillColor("#111111");
  let cursorY = y + 24;
  for (const line of lines) {
    doc.text(line, x + 8, cursorY, { width: w - 16 });
    cursorY += 12;
    if (cursorY > y + h - 12) break;
  }
}

function ensureSpace(doc: any, y: number, needed = 35) {
  if (y + needed > 720) {
    doc.addPage();
    return 50;
  }
  return y;
}

function addItemsTable(doc: any, order: any, yStart: number, includePrices: boolean, template: PrintTemplate) {
  includePrices = includePrices && template.showPrices;
  const activeHeaders = ["#", "Item", ...(template.showSku ? ["SKU"] : []), ...(template.showBarcode ? ["Barcode"] : []), "Qty", ...(includePrices ? ["Amount"] : [])];
  const cols = activeHeaders.length >= 6 ? [50, 75, 305, 380, 455, 500] : activeHeaders.length === 5 ? [50, 75, 340, 420, 500] : [50, 75, 405, 500];
  const headers = activeHeaders;
  let y = yStart;

  function drawHeader() {
    doc.rect(50, y, 512, 20).fillAndStroke("#f0f0f0", "#cccccc");
    doc.fillColor("#111111").fontSize(8).font("Helvetica-Bold");
    headers.forEach((header, index) => {
      const x = cols[index];
      const nextX = cols[index + 1] || 562;
      doc.text(header, x + 4, y + 6, { width: nextX - x - 8, align: header === "Qty" || header === "Amount" ? "right" : "left" });
    });
    y += 20;
  }

  drawHeader();
  const rows = order?.lineItems?.nodes || [];
  rows.forEach((item: any, index: number) => {
    y = ensureSpace(doc, y, 45);
    if (y === 50) drawHeader();
    const vendor = item?.variant?.product?.vendor || "";
    const barcode = item?.variant?.barcode || "";
    const variantTitle = item?.variantTitle && item.variantTitle !== "Default Title" ? item.variantTitle : "";
    const rowH = 42;
    doc.rect(50, y, 512, rowH).strokeColor("#dddddd").stroke();
    doc.fillColor("#111111").fontSize(8).font("Helvetica");
    doc.text(String(index + 1), cols[0] + 4, y + 6, { width: cols[1] - cols[0] - 8 });
    doc.font("Helvetica-Bold").text(String(item.title || ""), cols[1] + 4, y + 6, { width: cols[2] - cols[1] - 8, height: 12 });
    doc.font("Helvetica").fillColor("#555555");
    const details = [variantTitle, template.showVendor && vendor ? `Vendor: ${vendor}` : ""].filter(Boolean).join(" | ");
    if (details) doc.text(details, cols[1] + 4, y + 20, { width: cols[2] - cols[1] - 8, height: 12 });
    doc.fillColor("#111111").font("Helvetica").fontSize(8);
    let cellIndex = 2;
    if (template.showSku) {
      doc.text(String(item.sku || ""), cols[cellIndex] + 4, y + 6, { width: cols[cellIndex + 1] - cols[cellIndex] - 8 });
      cellIndex += 1;
    }
    if (template.showBarcode) {
      doc.text(String(barcode || ""), cols[cellIndex] + 4, y + 6, { width: cols[cellIndex + 1] - cols[cellIndex] - 8 });
      cellIndex += 1;
    }
    doc.text(String(item.quantity || ""), cols[cellIndex] + 4, y + 6, { width: (cols[cellIndex + 1] || 562) - cols[cellIndex] - 8, align: "right" });
    if (includePrices) doc.text(money(item.originalTotalSet), cols[cellIndex + 1] + 4, y + 6, { width: 562 - cols[cellIndex + 1] - 8, align: "right" });
    y += rowH;
  });
  return y + 12;
}

function addTotals(doc: any, order: any, yStart: number) {
  let y = ensureSpace(doc, yStart, 80);
  const x = 365;
  const w = 197;
  const rows = [
    ["Subtotal", money(order.subtotalPriceSet)],
    ["Shipping", money(order.totalShippingPriceSet)],
    ["Tax", money(order.totalTaxSet)],
    ["Total", money(order.totalPriceSet)],
  ];
  rows.forEach(([label, value], index) => {
    doc.fontSize(9).font(index === rows.length - 1 ? "Helvetica-Bold" : "Helvetica");
    if (index === rows.length - 1) doc.moveTo(x, y - 2).lineTo(x + w, y - 2).lineWidth(1).strokeColor("#111111").stroke();
    doc.fillColor("#111111").text(label, x, y, { width: 90 });
    doc.text(value, x + 90, y, { width: w - 90, align: "right" });
    y += 16;
  });
  return y;
}

async function makePdf(order: any, printTypes: PrintTypes, template: PrintTemplate) {
  const logoImage = await getLogoImageData(template.logoUrl);
  const doc = new PDFDocument({ size: template.paperSize === "A4" ? "A4" : "LETTER", margin: 50, bufferPages: true, autoFirstPage: false });
  const done = collectPdf(doc);

  if (printTypes.invoice) {
    doc.addPage();
    addHeader(doc, template.invoiceTitle || "Invoice", order, template, logoImage, "Generated from Shopify Admin Print Action");
    addAddressBox(doc, "Bill To", addressLines(order.billingAddress || order.shippingAddress), 50, 125, 245, 86);
    addAddressBox(doc, "Ship To", addressLines(order.shippingAddress), 317, 125, 245, 86);
    let y = addItemsTable(doc, order, 235, true, template);
    if (template.showPrices) y = addTotals(doc, order, y);
    y = ensureSpace(doc, y + 12, 30);
    doc.fontSize(9).font("Helvetica").fillColor("#666666").text(template.footerText || "Thank you for your order.", 50, y, { width: 512 });
  }

  if (printTypes.packingSlip) {
    doc.addPage();
    addHeader(doc, template.packingTitle || "Packing List", order, template, logoImage, "No prices shown");
    addAddressBox(doc, "Ship To", addressLines(order.shippingAddress), 50, 125, 245, 86);
    addAddressBox(doc, "Customer", [order.customer?.displayName || "Guest customer", template.showCustomerEmail ? order.customer?.email || "" : "", template.showCustomerPhone ? order.customer?.phone || "" : ""].filter(Boolean), 317, 125, 245, 86);
    let y = addItemsTable(doc, order, 235, false, template);
    y = ensureSpace(doc, y + 12, 30);
    doc.fontSize(9).font("Helvetica").fillColor("#666666").text(`Checked by: ____________________    Packed by: ____________________\n${template.footerText || ""}`, 50, y, { width: 512 });
  }

  if (!printTypes.invoice && !printTypes.packingSlip) {
    doc.addPage();
    pdfText(doc, "Select at least one document.");
  }

  doc.end();
  return done;
}

async function loadOrder(admin: any, orderId: string) {
  const response = await admin.graphql(
    `#graphql
      query OneOrderPrinterOrder($id: ID!) {
        order(id: $id) {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          customer { displayName }
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
              variant {
                barcode
                product { vendor }
              }
            }
          }
        }
      }
    `,
    { variables: { id: orderId } },
  );

  let json: any;
  try {
    json = await response.json();
  } catch (error: any) {
    throw new Error(`Shopify order query did not return JSON. Status: ${response.status || "unknown"}. ${error?.message || ""}`);
  }

  const errors = json?.errors || json?.data?.order?.userErrors;
  const order = json?.data?.order;

  if (errors?.length) {
    const message = errors
      .map((error: any) => error?.message || JSON.stringify(error))
      .filter(Boolean)
      .join("; ");
    throw new Error(message || `Shopify returned order query errors: ${JSON.stringify(errors).slice(0, 500)}`);
  }

  if (!order) {
    throw new Error(`Order not found or not accessible. Shopify response: ${JSON.stringify(json).slice(0, 700)}`);
  }

  return order;
}

function corsHeaders(extra: HeadersInit = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Requested-With, Accept, Origin, Shopify-Extension-Context",
    "Access-Control-Max-Age": "86400",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Cross-Origin-Embedder-Policy": "unsafe-none",
    ...extra,
  };
}

function printResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: corsHeaders({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    }),
  });
}

function pdfResponse(pdf: Buffer, disposition: string) {
  return new Response(new Uint8Array(pdf), {
    headers: corsHeaders({
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
    }),
  });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: corsHeaders({ "Content-Type": "text/plain; charset=utf-8" }),
    });
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: corsHeaders({ "Content-Type": "text/plain; charset=utf-8" }),
  });
};


async function getOfflineShopFallback() {
  const envShop = (process.env.SHOPIFY_SHOP_DOMAIN || process.env.PRINT_SHOP_DOMAIN || "").trim();
  if (envShop.endsWith(".myshopify.com")) {
    return envShop;
  }

  const sessions = await prisma.session.findMany({
    where: {
      isOnline: false,
      accessToken: { not: "" },
    },
    select: { shop: true, id: true, scope: true },
    take: 5,
  });

  const uniqueShops = Array.from(new Set(sessions.map((session) => session.shop).filter(Boolean)));
  if (uniqueShops.length === 1) {
    return uniqueShops[0];
  }

  return "";
}

async function getStoredSessionScope(shop: string) {
  if (!shop) return "";
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    select: { scope: true },
  });
  return session?.scope || "";
}

function missingRequiredPrintScopes(scope?: string | null) {
  const current = new Set((scope || "").split(",").map((value) => value.trim()).filter(Boolean));
  return ["read_orders"].filter((required) => !current.has(required));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId") || "";
  const printTypes = selectedPrintTypes(url.searchParams.get("printType"));
  const format = (url.searchParams.get("format") || "html").toLowerCase();
  const download = url.searchParams.get("download") === "1";
  const save = url.searchParams.get("save") === "1";

  if (request.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: corsHeaders({ "Content-Type": "text/plain; charset=utf-8" }),
    });
  }

  let session: any;
  let admin: any;
  let cors: any;
  let template: PrintTemplate = DEFAULT_TEMPLATE;
  const requestedShop = (url.searchParams.get("shop") || "").trim();

  try {
    const auth = await authenticate.admin(request);
    session = auth.session;
    admin = auth.admin;
    cors = auth.cors;
    template = await loadTemplate(session.shop);
  } catch (error: any) {
    // Admin Print Action preview is fetched by Shopify from admin.shopify.com and
    // may not include embedded app cookies. In that case, use the stored
    // offline Admin session. Prefer the shop query parameter, then env, then
    // the single offline session saved in the app database.
    const fallbackShop = requestedShop.endsWith(".myshopify.com")
      ? requestedShop
      : await getOfflineShopFallback();

    if (fallbackShop.endsWith(".myshopify.com")) {
      try {
        const unauth = await unauthenticated.admin(fallbackShop);
        admin = unauth.admin;
        session = { shop: fallbackShop };
        template = await loadTemplate(fallbackShop);
      } catch (fallbackError: any) {
        const message = fallbackError?.message || String(fallbackError || "Offline authentication failed");
        return printResponse(pageHtml(`<div class="box"><strong>Unable to authenticate print preview.</strong><br/>Open the app once from Shopify Admin, approve the requested order scopes, then reopen this order print action.<br/><br/><small>${escapeHtml(message)}</small><br/><br/><small>Requested shop: ${escapeHtml(requestedShop || "empty")}</small><br/><small>Fallback shop: ${escapeHtml(fallbackShop || "empty")}</small></div>`, undefined, undefined, DEFAULT_TEMPLATE), 200);
      }
    } else {
      const message = error?.message || String(error || "Authentication failed");
      return printResponse(pageHtml(`<div class="box"><strong>Unable to authenticate print preview.</strong><br/>Open the app once from Shopify Admin, then reopen this order print action.<br/><br/><small>${escapeHtml(message)}</small><br/><br/><small>Requested shop: ${escapeHtml(requestedShop || "empty")}</small><br/><small>No offline shop session found. Reopen the app from Shopify Admin once, or set PRINT_SHOP_DOMAIN in Render.</small></div>`, undefined, undefined, DEFAULT_TEMPLATE), 200);
    }
  }

  if (!orderId.startsWith("gid://shopify/Order/")) {
    const html = pageHtml(`<div class="box"><strong>Missing orderId.</strong><br/>Open this from Shopify Admin -> Order -> Print.<br/><br/><small>Received: ${escapeHtml(orderId || "empty")}</small></div>`, undefined, undefined, template);
    return cors ? cors(printResponse(html)) : printResponse(html);
  }

  try {
    const order = await loadOrder(admin, orderId);

    if (format === "pdf") {
      const pdf = await makePdf(order, printTypes, template);

      if (save) {
        const saved = await savePdfToAccount({
          shop: session.shop,
          orderId,
          orderName: order.name || "order",
          documentType: printTypeLabel(printTypes),
          pdf,
        });
        const html = pageHtml(`<div class="box"><strong>PDF saved.</strong><br/>${escapeHtml(order.name)} has been saved to your account downloads.<br/><br/><a href="/saved-pdfs/${saved.id}" target="_blank" rel="noreferrer">Download saved PDF</a> &nbsp; <a href="/app">Go to account downloads</a></div>`, undefined, undefined, template);
        return cors ? cors(printResponse(html)) : printResponse(html);
      }

      const disposition = download ? `attachment; filename="${safeFilePart(order.name)}.pdf"` : "inline";
      const response = pdfResponse(pdf, disposition);
      return cors ? cors(response) : response;
    }

    const pdfParams = new URLSearchParams(url.searchParams);
    pdfParams.set("format", "pdf");
    pdfParams.delete("download");
    const downloadParams = new URLSearchParams(pdfParams);
    downloadParams.set("download", "1");

    const docs = [
      printTypes.invoice ? invoiceHtml(order, template) : "",
      printTypes.packingSlip ? packingSlipHtml(order, template) : "",
    ].join("");

    const html = pageHtml(docs || `<div class="box">Select at least one document.</div>`, `/print?${pdfParams.toString()}`, `/print?${downloadParams.toString()}`, template);
    const response = printResponse(html);
    return cors ? cors(response) : response;
  } catch (error: any) {
    const message = error?.message || "Unable to load order.";
    const printShop = session?.shop || requestedShop || await getOfflineShopFallback();
    const storedScope = await getStoredSessionScope(printShop);
    const missingPrintScopes = missingRequiredPrintScopes(storedScope);
    const isScopeError = /read_orders|Access denied for order field/i.test(message);
    const scopeHelp = isScopeError
      ? `<br/><br/><strong>Action required:</strong> The stored Shopify offline token still does not include <code>read_orders</code>. Open the app diagnostics page, click Re-authorize, and approve the permission screen. If Shopify does not show the permission approval screen, uninstall/reinstall the app and confirm that the Shopify Partner app access scopes include <code>read_orders</code>.`
      : "";
    const html = pageHtml(`<div class="box"><strong>Unable to load order.</strong><br/>${escapeHtml(message)}${scopeHelp}<br/><br/><small>Order ID: ${escapeHtml(orderId)}</small><br/><small>Shop: ${escapeHtml(printShop || "unknown")}</small><br/><small>Stored offline session scope: ${escapeHtml(storedScope || "empty / not found")}</small><br/><small>Missing required print scopes: ${escapeHtml(missingPrintScopes.length ? missingPrintScopes.join(", ") : "none")}</small></div>`, undefined, undefined, template);
    const response = printResponse(html, 200);
    return cors ? cors(response) : response;
  }
};
