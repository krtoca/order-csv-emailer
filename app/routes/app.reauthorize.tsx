import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function getFallbackShop() {
  return (process.env.PRINT_SHOP_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN || "").trim();
}

async function clearSessions(request: Request) {
  const url = new URL(request.url);
  let shop = url.searchParams.get("shop") || "";

  try {
    const { session } = await authenticate.admin(request);
    if (session?.shop) shop = session.shop;
  } catch (_error) {
    // This route is intentionally used when the current session is stale.
  }

  if (!shop) shop = getFallbackShop();

  if (shop) {
    await prisma.session.deleteMany({ where: { shop } });
  } else {
    const sessions = await prisma.session.findMany({ select: { shop: true }, distinct: ["shop"], take: 2 });
    if (sessions.length === 1) {
      shop = sessions[0].shop;
      await prisma.session.deleteMany({ where: { shop } });
    }
  }

  return shop;
}

function topLevelLoginHtml(shop: string, appUrl: string) {
  const loginPath = shop ? `/auth/login?shop=${encodeURIComponent(shop)}` : "/auth/login";
  const loginUrl = `${appUrl.replace(/\/$/, "")}${loginPath}`;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Re-authorize One Order Printer</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:40px;background:#f6f6f7;color:#202223}
      .card{max-width:720px;background:#fff;border:1px solid #ddd;border-radius:12px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
      a.button{display:inline-block;background:#202223;color:#fff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:600}
      code{background:#f1f2f3;padding:2px 4px;border-radius:4px}
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Re-authorize One Order Printer</h1>
      <p>Old Shopify sessions were deleted. Continue to Shopify's permission screen to approve the updated order access scopes.</p>
      <p><strong>Shop:</strong> <code>${escapeHtml(shop || "unknown")}</code></p>
      <p><a class="button" href="${escapeHtml(loginUrl)}" target="_top" rel="noreferrer">Continue to Shopify permission screen</a></p>
      <p style="color:#6d7175;font-size:13px">If nothing happens, copy this URL into the browser address bar:<br>${escapeHtml(loginUrl)}</p>
      <script>try{window.top.location.href=${JSON.stringify(loginUrl)}}catch(e){}</script>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function clearAndRedirect(request: Request) {
  const shop = await clearSessions(request);
  const appUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
  const wantsTop = new URL(request.url).searchParams.get("top") === "1";

  if (wantsTop) {
    return new Response(topLevelLoginHtml(shop, appUrl), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const loginPath = shop ? `/auth/login?shop=${encodeURIComponent(shop)}` : "/auth/login";
  return redirect(loginPath);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return clearAndRedirect(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return clearAndRedirect(request);
};

export default function Reauthorize() {
  return null;
}
