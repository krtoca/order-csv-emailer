# V26 scope diagnostics review

This version does not try to bypass Shopify permissions. If Shopify Admin API returns `Access denied for order field`, the saved offline token does not include `read_orders`.

Added:

- `/app/diagnostics` page
- Home page button: `Open diagnostics`
- Diagnostics shows:
  - runtime `SCOPES`
  - masked `SHOPIFY_API_KEY`
  - `SHOPIFY_APP_URL`
  - current embedded session scope
  - offline session scope used by print preview
  - missing required scopes
  - saved Session rows
- Print preview error now displays stored offline session scope so it is clear whether the token actually has `read_orders`.

Required checks:

1. Render `SHOPIFY_API_KEY` must be the Client ID of the same Shopify app you deploy with `shopify app deploy`.
2. Render `SCOPES` must include `read_orders`.
3. `shopify.app.toml` or active CLI config must include `read_orders` in `[access_scopes]`.
4. After changing scopes, run `shopify app deploy`.
5. Open `/app/diagnostics`, click `Delete sessions and re-authorize`, and approve the permission screen.
6. If Shopify does not show the approval screen, uninstall/reinstall the app.

There is no code workaround for a token missing `read_orders`; Shopify will not allow order lookup until the app is authorized with that scope.
