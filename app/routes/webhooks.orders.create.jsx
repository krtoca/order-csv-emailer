import { authenticate } from "../shopify.server";
import { buildOrderLineItemsCsv } from "../lib/order-line-csv.server";
import { sendOrderCsvEmail } from "../lib/email.server";
import { getOrderCsvEmailSetting } from "../lib/order-csv-settings.server";

// duplicate protection
const processedOrders = new Set();

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log("[Webhook] orders/create received:", {
      topic,
      shop,
      orderId: payload?.id,
      orderName: payload?.name,
    });

    const order = payload;

    const orderId = String(order?.id || "");
    const orderName = order?.name || "";

    if (!orderId) {
      console.warn("[Order CSV Email] Missing orderId");

      return new Response("OK", { status: 200 });
    }

    // duplicate key
    const duplicateKey = `${shop}-${orderId}`;

    // skip duplicate
    if (processedOrders.has(duplicateKey)) {
      console.log("[Order CSV Email] Duplicate skipped:", {
        shop,
        orderId,
        orderName,
      });

      return new Response("Duplicate skipped", { status: 200 });
    }

    // save processed
    processedOrders.add(duplicateKey);

    // cleanup after 1 hour
    setTimeout(() => {
      processedOrders.delete(duplicateKey);
    }, 1000 * 60 * 60);

    const setting = await getOrderCsvEmailSetting(shop);

    if (!setting.enabled) {
      console.log("[Order CSV Email] Skipped. Setting disabled:", {
        shop,
        orderId,
        orderName,
      });

      return new Response("OK", { status: 200 });
    }

    const customerEmail =
      order.email ||
      order.customer?.email ||
      order.contact_email ||
      "";

    if (!customerEmail) {
      console.warn("[Order CSV Email] Skipped. No customer email:", {
        shop,
        orderId,
        orderName,
      });

      return new Response("OK", { status: 200 });
    }

    const selectedColumnKeys = String(setting.csvColumns || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const csvContent = buildOrderLineItemsCsv(order, selectedColumnKeys);

    await sendOrderCsvEmail({
      to: customerEmail,
      bcc: setting.bccEmail,
      fromEmail: setting.fromEmail,
      orderName: order.name || order.order_number || order.id,
      csvContent,
      emailSubject: setting.emailSubject,
      emailBody: setting.emailBody,
    });

    console.log("[Order CSV Email] Completed:", {
      shop,
      orderId,
      orderName,
      to: customerEmail,
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[Webhook] orders/create error:", error);

    return new Response("Webhook error", { status: 500 });
  }
};