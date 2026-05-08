import prisma from "../db.server";

export const DEFAULT_CSV_COLUMNS =
  "orderName,customerEmail,sku,barcode,productTitle,variantTitle,quantity,price,vendor";

const DEFAULT_EMAIL_SUBJECT = "Order {{orderName}} line items CSV";

const DEFAULT_EMAIL_BODY =
  "Thank you for your order. Your order line items CSV file is attached.";

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
      fromEmail: null,
      bccEmail: null,
      emailSubject: DEFAULT_EMAIL_SUBJECT,
      emailBody: DEFAULT_EMAIL_BODY,
      csvColumns: DEFAULT_CSV_COLUMNS,
      onlySendForOrderTag: null,
      onlySendForCustomerTag: null,
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
      enabled: Boolean(data.enabled),
      fromEmail: data.fromEmail || null,
      bccEmail: data.bccEmail || null,
      emailSubject: data.emailSubject || DEFAULT_EMAIL_SUBJECT,
      emailBody: data.emailBody || DEFAULT_EMAIL_BODY,
      csvColumns: data.csvColumns || DEFAULT_CSV_COLUMNS,
      onlySendForOrderTag: data.onlySendForOrderTag || null,
      onlySendForCustomerTag: data.onlySendForCustomerTag || null,
    },
    create: {
      shop,
      enabled: Boolean(data.enabled),
      fromEmail: data.fromEmail || null,
      bccEmail: data.bccEmail || null,
      emailSubject: data.emailSubject || DEFAULT_EMAIL_SUBJECT,
      emailBody: data.emailBody || DEFAULT_EMAIL_BODY,
      csvColumns: data.csvColumns || DEFAULT_CSV_COLUMNS,
      onlySendForOrderTag: data.onlySendForOrderTag || null,
      onlySendForCustomerTag: data.onlySendForCustomerTag || null,
    },
  });
}