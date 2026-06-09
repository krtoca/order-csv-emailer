V23 fix: force reauthorization when old Shopify offline token is missing order scopes.

What changed:
- app/routes/app._index.tsx deletes stale sessions and redirects to Shopify login when required admin scopes are missing.
- app/routes/print.tsx shows a clear reauthorization message when Shopify returns read_orders access denied.

After deploy:
1. Make sure Render Environment SCOPES is:
   read_orders,read_all_orders,read_products,read_files,write_files,customer_read_customers,customer_read_orders
2. Push this version and let Render deploy.
3. Run: shopify app deploy
4. Open the app from Shopify Admin and approve the permission screen.
5. If no permission screen appears, uninstall and reinstall the app on the test store.
