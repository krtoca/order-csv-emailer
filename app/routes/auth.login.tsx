import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { login } from "../shopify.server";

function ensureShopOnLoginUrl(request: Request) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop")?.trim();

  if (shop) return null;

  const fallbackShop =
    process.env.PRINT_SHOP_DOMAIN?.trim() ||
    process.env.SHOPIFY_SHOP_DOMAIN?.trim() ||
    "";

  if (!fallbackShop) return null;

  url.searchParams.set("shop", fallbackShop);
  return redirect(url.pathname + url.search);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const fallbackRedirect = ensureShopOnLoginUrl(request);
  if (fallbackRedirect) return fallbackRedirect;
  return login(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const fallbackRedirect = ensureShopOnLoginUrl(request);
  if (fallbackRedirect) return fallbackRedirect;
  return login(request);
};

export default function AuthLogin() {
  return null;
}
