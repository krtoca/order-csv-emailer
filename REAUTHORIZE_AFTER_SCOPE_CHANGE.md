# Reauthorize after scope change

This version forces the backend to request required order scopes even if the Render SCOPES environment variable is stale.

After deploying this version:

1. In Render, set SCOPES to:
   read_orders,read_all_orders,read_products,read_files,write_files,customer_read_customers,customer_read_orders

2. Run locally:
   shopify app deploy

3. Open the app in Shopify Admin and approve the updated permissions. If Shopify does not prompt, uninstall and reinstall the app on the test store.

4. The existing offline token may still have old scopes until the app is reauthorized.
