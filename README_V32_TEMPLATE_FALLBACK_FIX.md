# V32 Template fallback fix

Fixes the Template button blank screen by allowing `/app/templates` to render even when embedded admin authentication redirects or stale sessions are present.

Changes:

- `app/routes/app.templates.tsx`
  - Uses normal `authenticate.admin(request)` when available.
  - Falls back to `PRINT_SHOP_DOMAIN`, `SHOPIFY_SHOP_DOMAIN`, query/form shop, or the stored offline session shop.
  - Shows a warning banner instead of a blank screen when fallback mode is used.
  - Keeps template editing available even before reauthorization is fully resolved.
  - Logo upload still requires Shopify Admin API access; if unavailable, text/settings can still be saved and logo upload asks for reauthorization.

Recommended Render env:

```env
PRINT_SHOP_DOMAIN=marketplace-r9pv9qd6.myshopify.com
```
