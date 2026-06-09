import { buildOrderLineItemsCsv } from "./order-line-csv.server";
import { sendOrderCsvEmail } from "./email.server";
import {
  DEFAULT_CSV_COLUMNS,
  getOrderCsvEmailSetting,
} from "./order-csv-settings.server";

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

function chunkArray(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function getVariantGid(item) {
  const variantAdminGid =
    item?.variant?.admin_graphql_api_id || item?.variant_admin_graphql_api_id;

  if (variantAdminGid) {
    return String(variantAdminGid);
  }

  const variantId = item?.variant_id || item?.variant?.id;

  if (!variantId) {
    return "";
  }

  const stringVariantId = String(variantId);

  if (stringVariantId.startsWith("gid://shopify/ProductVariant/")) {
    return stringVariantId;
  }

  return `gid://shopify/ProductVariant/${stringVariantId}`;
}

async function fetchVariantBarcodeMap({ admin, order }) {
  if (!admin) {
    console.warn("[Order CSV Email] Admin API not available for barcode lookup.");
    return {};
  }

  const variantIds = [
    ...new Set(
      (order?.line_items || [])
        .map((item) => getVariantGid(item))
        .filter(Boolean)
    ),
  ];

  if (!variantIds.length) {
    console.log("[Order CSV Email] No variant IDs found for barcode lookup.");
    return {};
  }

  const variantMap = {};

  for (const ids of chunkArray(variantIds, 100)) {
    try {
      const response = await admin.graphql(
        `#graphql
          query OrderCsvVariantBarcodes($ids: [ID!]!) {
            nodes(ids: $ids) {
              ... on ProductVariant {
                id
                barcode
                sku
              }
            }
          }
        `,
        {
          variables: {
            ids,
          },
        }
      );

      const result = await response.json();

      if (result?.errors) {
        console.warn("[Order CSV Email] Variant barcode lookup GraphQL errors:", {
          errors: result.errors,
        });
        continue;
      }

      for (const node of result?.data?.nodes || []) {
        if (!node?.id) continue;

        variantMap[node.id] = {
          barcode: node.barcode || "",
          sku: node.sku || "",
        };
      }
    } catch (error) {
      console.warn("[Order CSV Email] Variant barcode lookup failed:", {
        error: error?.message || error,
      });
    }
  }

  return variantMap;
}

async function enrichOrderLineItemsWithBarcodes({ admin, order }) {
  const variantMap = await fetchVariantBarcodeMap({ admin, order });

  if (!Object.keys(variantMap).length) {
    return order;
  }

  return {
    ...order,
    line_items: (order?.line_items || []).map((item) => {
      const variantGid = getVariantGid(item);
      const variant = variantMap[variantGid];

      return {
        ...item,
        barcode:
          item?.barcode ||
          item?.variant_barcode ||
          item?.variant?.barcode ||
          variant?.barcode ||
          "",
        variant_barcode:
          item?.variant_barcode ||
          item?.barcode ||
          item?.variant?.barcode ||
          variant?.barcode ||
          "",
        sku: item?.sku || variant?.sku || "",
      };
    }),
  };
}

export async function processOrderCsvEmailWebhook({ topic, shop, order, admin }) {
  const orderId = String(order?.id || "");
  const orderName = order?.name || "";

  console.log("[Order CSV Email] Webhook received:", {
    topic,
    shop,
    orderId,
    orderName,
  });

  if (!orderId) {
    console.warn("[Order CSV Email] Missing orderId");
    return new Response("OK", { status: 200 });
  }

  const duplicateKey = `${shop}-${orderId}-${topic || "orders/fulfilled"}`;

  if (processedOrders.has(duplicateKey)) {
    console.log("[Order CSV Email] Duplicate skipped:", {
      shop,
      orderId,
      orderName,
      topic,
    });

    return new Response("Duplicate skipped", { status: 200 });
  }

  if (processingOrders.has(duplicateKey)) {
    console.log("[Order CSV Email] Already processing skipped:", {
      shop,
      orderId,
      orderName,
      topic,
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

    if (excludedCustomerTag && hasTag(customerTags, excludedCustomerTag)) {
      console.log("[Order CSV Email] Skipped. Customer has excluded tag:", {
        shop,
        orderId,
        orderName,
        excludedCustomerTag,
        customerTags,
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

    const orderWithBarcodes = await enrichOrderLineItemsWithBarcodes({
      admin,
      order,
    });

    const csvContent = buildOrderLineItemsCsv(
      orderWithBarcodes,
      selectedColumnKeys
    );

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
}
