# V29 - Active Shopify config scope fix

The print preview can reach `/print`, but Shopify returns:

`Access denied for order field. Required access: read_orders`

If diagnostics shows the saved offline session scope as something like:

`write_metaobject_definitions,write_metaobjects,write_products`

then the app was installed or reauthorized with the wrong Shopify app config / old access scopes. Render `SCOPES` alone is not enough. The active Shopify app config used by `shopify app deploy` must also include `read_orders`.

## Fix

Run from the project root:

```powershell
cd C:\Users\Jeff\desktop\shopify\one-order-printer
.\scripts\fix-shopify-config.ps1 -AppUrl "https://one-order-printer.onrender.com"
```

Confirm there are no old URLs and that all Shopify TOML files include the correct scopes:

```powershell
Select-String -Path .\shopify*.toml -Pattern "application_url|scopes|example.com|CHANGE-ME|trycloudflare"
```

Expected scopes:

```txt
read_orders,read_all_orders,read_products,read_files,write_files,customer_read_customers,customer_read_orders
```

Then deploy the active config explicitly:

```powershell
npm run build
git add .
git commit -m "Fix Shopify active config scopes"
git push
shopify app deploy --config shopify.app.one-order-print.toml
```

After deploy, uninstall and reinstall the app, or open the app and use the reauthorize button. Then check diagnostics.

The offline session scope must include `read_orders`. If it does not, the app is still being installed from an old config or wrong Shopify Partner app.
