import { authenticate } from "../shopify.server";
import { processOrderCsvEmailWebhook } from "../lib/order-csv-email-webhook.server";

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload, admin } = await authenticate.webhook(request);

    return await processOrderCsvEmailWebhook({
      topic,
      shop,
      order: payload,
      admin,
    });
  } catch (error) {
    console.error("[Webhook] orders/fulfilled error:", error);
    return new Response("Webhook error", { status: 500 });
  }
};
