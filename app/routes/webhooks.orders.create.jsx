import { authenticate } from "../shopify.server";
import { buildOrderLineItemsCsv } from "../lib/order-line-csv.server";
import { sendOrderCsvEmail } from "../lib/email.server";
import {
  DEFAULT_CSV_COLUMNS,
  getOrderCsvEmailSetting,
} from "../lib/order-csv-settings.server";

const processedOrders = new Set();
const processingOrders = new Set();

function hasTag(tags, targetTag) {
  if (!targetTag) return false;
  if (!tags) return false;

  const normalizedTarget = String(targetTag).trim().toLowerCase();
  if (!normalizedTarget) return false;

  if (Array.isArray(tags)) {
    return tags.some(
      (tag) => String(tag).trim().toLowerCase() === normalizedTarget
    );
  }

  return String(tags)
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalizedTarget);
}

function getPayloadCustomerTags(order) {
  return (
    order?.customer?.tags ||
    order?.customer_tags ||
    order?.customerTags ||
    ""
  );
}

function getCustomerGid(order) {
  if (order?.customer?.admin_graphql_api_id) {
    return order.customer.admin_graphql_api_id;
  }

  if (order?.customer?.id) {
    return `gid://shopify/Customer/${order.customer.id}`;
  }

  return "";
}

async function fetchCustomerTagsFromShopify({ admin, order }) {
  const payloadTags = getPayloadCustomerTags(order);

  if (payloadTags) {
    return payloadTags;
  }

  if (!admin) {
    console.warn("[Order CSV Email] Admin API not available in webhook.");
    return "";
  }

  const customerGid = getCustomerGid(order);

  if (!customerGid) {
    console.warn("[Order CSV Email] No customer ID found for tag lookup.");
    return "";
  }

  try {
    const response = await admin.graphql(
      `#graphql
        query CustomerTags($id: ID!) {
          customer(id: $id) {
            id
            email
            tags
          }
        }
      `,
      {
        variables: {
          id: customerGid,
        },
      }
    );

    const result = await response.json();

    if (result?.errors) {
      console.warn("[Order CSV Email] Customer tag lookup GraphQL errors:", {
        customerGid,
        errors: result.errors,
      });
      return "";
    }

    const tags = result?.data?.customer?.tags || "";

    return Array.isArray(tags) ? tags.join(",") : tags;
  } catch (error) {
    console.warn("[Order CSV Email] Customer tag lookup failed:", {
      customerGid,
      error: error?.message || error,
    });

    return "";
  }
}

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload, admin } =
      await authenticate.webhook(request);

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

    if (processingOrders.has(duplicateKey)) {
      console.log("[Order CSV Email] Already processing skipped:", {
        shop,
        orderId,
        orderName,
      });

      return new Response("Already processing", { status: 200 });
    }

    processingOrders.add(duplicateKey);

    try {
      const setting = await getOrderCsvEmailSetting(shop);

      console.log("[Order CSV Email] Loaded setting:", {
        shop,
        enabled: setting.enabled,
        excludeCustomerTag: setting.onlySendForCustomerTag,
        csvColumns: setting.csvColumns,
      });

      if (!setting.enabled) {
        console.log("[Order CSV Email] Skipped. Setting disabled:", {
          shop,
          orderId,
          orderName,
        });

        return new Response("OK", { status: 200 });
      }

      const excludedCustomerTag = String(
        setting.onlySendForCustomerTag || ""
      ).trim();

      const customerTags = await fetchCustomerTagsFromShopify({
        admin,
        order,
      });

      console.log("[Order CSV Email] Customer tag check:", {
        shop,
        orderId,
        orderName,
        excludedCustomerTag,
        customerId: order?.customer?.id,
        customerEmail: order?.customer?.email,
        customerTags,
      });

      if (
        excludedCustomerTag &&
        hasTag(customerTags, excludedCustomerTag)
      ) {
        console.log(
          "[Order CSV Email] Skipped. Customer has excluded tag:",
          {
            shop,
            orderId,
            orderName,
            excludedCustomerTag,
            customerTags,
          }
        );

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

      console.log("[Order CSV Email] Sending email:", {
        shop,
        orderId,
        orderName,
        to: customerEmail,
        bcc: setting.bccEmail,
        fromEmail: setting.fromEmail,
      });

      await sendOrderCsvEmail({
        to: customerEmail,
        bcc: setting.bccEmail,
        fromEmail: setting.fromEmail,
        orderName: order.name || order.order_number || order.id,
        csvContent,
        emailSubject: setting.emailSubject,
        emailBody: setting.emailBody,
      });

      console.log("[Order CSV Email] Email send function finished:", {
        shop,
        orderId,
        orderName,
        to: customerEmail,
      });

      processedOrders.add(duplicateKey);

      setTimeout(() => {
        processedOrders.delete(duplicateKey);
      }, 1000 * 60 * 60);

      console.log("[Order CSV Email] Completed:", {
        shop,
        orderId,
        orderName,
        to: customerEmail,
      });

      return new Response("OK", { status: 200 });
    } finally {
      processingOrders.delete(duplicateKey);
    }
  } catch (error) {
    console.error("[Webhook] orders/create error:", error);
    return new Response("Webhook error", { status: 500 });
  }
};