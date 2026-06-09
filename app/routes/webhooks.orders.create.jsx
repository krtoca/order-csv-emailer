import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log("[Webhook] orders/create received but CSV email is disabled for this event:", {
      topic,
      shop,
      orderId: payload?.id,
      orderName: payload?.name,
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[Webhook] orders/create noop error:", error);
    return new Response("Webhook error", { status: 500 });
  }
};
