# v24 Re-authorize Permission Fix

This version adds an embedded admin route that clears stale Shopify sessions and forces OAuth re-authorization.

## New route

- `/app/reauthorize?shop=<myshopify-domain>`

## Why

If the app was installed before `read_orders` was added, the saved offline token may still have old scopes. The print preview will show `Access denied for order field` until the merchant approves the new scopes.

## Deploy steps

```powershell
npm run build
git add .
git commit -m "Add reauthorize route for order scopes"
git push
shopify app deploy
```

Then open the app in Shopify Admin and click **Re-authorize app permissions**, or uninstall/reinstall the app if Shopify does not show the permission approval screen.

Render `SCOPES` must include:

```env
read_orders,read_all_orders,read_products,read_files,write_files,customer_read_customers,customer_read_orders
```
