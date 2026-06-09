import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const query = url.searchParams.toString();

  // Preserve Shopify embedded auth parameters (shop, host, hmac, id_token, etc.).
  // Dropping these parameters can send the app to /auth/login without a shop value,
  // which leaves the embedded app iframe blank.
  return redirect(query ? `/app?${query}` : "/app");
};

export default function IndexRedirect() {
  return null;
}
