# V30 blank app auth fix

This version fixes a blank embedded app home screen caused by losing Shopify embedded auth query parameters.

Changes:
- `app/routes/_index.tsx` now preserves query parameters when redirecting `/` to `/app`.
- `app/routes/auth.login.tsx` now falls back to `PRINT_SHOP_DOMAIN` or `SHOPIFY_SHOP_DOMAIN` when `/auth/login` is reached without `shop`.

Recommended Render environment variable:

```env
PRINT_SHOP_DOMAIN=marketplace-r9pv9qd6.myshopify.com
```

Deploy steps:

```powershell
npm run build
git add .
git commit -m "Fix embedded auth blank app screen"
git push
```

After Render deploys, run:

```powershell
shopify app deploy
```
