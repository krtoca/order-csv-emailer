# V31 - Top-level reauthorize and print debug fix

This version fixes two issues seen after the app home started loading:

1. **Delete sessions and re-authorize** opened Shopify Accounts inside the embedded app iframe and showed `accounts.shopify.com refused to connect`.
   - Reauthorization now opens at the top browser level with `target="_top"`.
   - The reauthorize route deletes stale sessions first, then sends the browser to `/auth/login?shop=...` as a top-level navigation.

2. **Open diagnostics** could show a blank page when the embedded admin session was stale.
   - Diagnostics now falls back to `PRINT_SHOP_DOMAIN` / saved DB sessions and still shows the saved scopes and environment details.

3. **Print preview error was too generic.**
   - The order GraphQL query now removes customer email/phone fields to avoid unnecessary customer-data access.
   - If Shopify returns an order query error, the preview shows the actual GraphQL message instead of only `Unable to load order`.

After applying:

```powershell
npm run build
git add .
git commit -m "Fix top-level reauthorize and print diagnostics"
git push
```

Wait for Render deploy, then run:

```powershell
shopify app deploy
```

Then open the app and click **Delete sessions and re-authorize**. If Shopify still does not show the permission screen, uninstall and reinstall the app from the test store.
