import prisma from "../db.server";

export const DEFAULT_CSV_COLUMNS =
  "orderName,customerEmail,sku,barcode,productTitle,variantTitle,quantity,price,vendor";

export async function getOrderCsvEmailSetting(shop) {
  if (!shop) {
    throw new Error("Shop is required");
  }

  return prisma.orderCsvEmailSetting.upsert({
    where: { shop },
    update: {},
    create: {
      shop,
      enabled: true,
      emailSubject: "Order {{orderName}} line items CSV",
      emailBody:
        "Thank you for your order. Your order line items CSV file is attached.",
      csvColumns: DEFAULT_CSV_COLUMNS,
    },
  });
}

export async function updateOrderCsvEmailSetting(shop, data) {
  if (!shop) {
    throw new Error("Shop is required");
  }

  return prisma.orderCsvEmailSetting.upsert({
    where: { shop },
    update: {
      enabled: data.enabled,
      fromEmail: data.fromEmail || null,
      bccEmail: data.bccEmail || null,
      emailSubject:
        data.emailSubject || "Order {{orderName}} line items CSV",
      emailBody:
        data.emailBody ||
        "Thank you for your order. Your order line items CSV file is attached.",
      csvColumns: data.csvColumns || DEFAULT_CSV_COLUMNS,
    },
    create: {
      shop,
      enabled: data.enabled,
      fromEmail: data.fromEmail || null,
      bccEmail: data.bccEmail || null,
      emailSubject:
        data.emailSubject || "Order {{orderName}} line items CSV",
      emailBody:
        data.emailBody ||
        "Thank you for your order. Your order line items CSV file is attached.",
      csvColumns: data.csvColumns || DEFAULT_CSV_COLUMNS,
    },
  });
}