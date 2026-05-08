import { authenticate } from "../shopify.server";
import { buildOrderLineItemsCsv } from "../lib/order-line-csv.server";
import { sendOrderCsvEmail } from "../lib/email.server";
import {
  DEFAULT_CSV_COLUMNS,
  getOrderCsvEmailSetting,
} from "../lib/order-csv-settings.server";

// duplicate protection
const processedOrders = new Set();

function hasTag(tags, targetTag) {
  if (!targetTag) return true;
  if (!tags) return false;

  const normalizedTarget = String(targetTag).trim().toLowerCase();

  if (Array.isArray(tags)) {
    return tags.some(
      (tag) => String(tag).trim().toLowerCase() === normalizedTarget
    );
  }

  return String(tags)
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .includes(normalizedTarget);
}

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    const order = payload;
    const orderId = String(order?.id || "");
    const orderName = order?.name || "";

    console.log("[Webhook] orders/create received:", {
      topic,
      shop,
      orderId,
      orderName,
    });

    if (!orderId) {
      console.warn("[Order CSV Email] Missing orderId");
      return new Response("OK", { status: 200 });
    }

    const duplicateKey = `${shop}-${orderId}`;

    if (processedOrders.has(duplicateKey)) {
      console.log("[Order CSV Email] Duplicate skipped:", {
        shop,
        orderId,
        orderName,
      });

      return new Response("Duplicate skipped", { status: 200 });
    }

    processedOrders.add(duplicateKey);

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

    if (setting.orderTag && !hasTag(order.tags, setting.orderTag)) {
      console.log("[Order CSV Email] Skipped. Order tag not matched:", {
        shop,
        orderId,
        orderName,
        requiredTag: setting.orderTag,
        orderTags: order.tags,
      });

      return new Response("OK", { status: 200 });
    }

    if (
      setting.customerTag &&
      !hasTag(order.customer?.tags, setting.customerTag)
    ) {
      console.log("[Order CSV Email] Skipped. Customer tag not matched:", {
        shop,
        orderId,
        orderName,
        requiredTag: setting.customerTag,
        customerTags: order.customer?.tags,
      });

      return new Response("OK", { status: 200 });
    }

    const customerEmail =
      order.email || order.customer?.email || order.contact_email || "";

    if (!customerEmail) {
      console.warn("[Order CSV Email] Skipped. No customer email:", {
        shop,
        orderId,
        orderName,
      });

      return new Response("OK", { status: 200 });
    }

    const selectedColumnKeys = String(
      setting.csvColumns || DEFAULT_CSV_COLUMNS
    )
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