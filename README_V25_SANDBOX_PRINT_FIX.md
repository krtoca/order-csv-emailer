# V25 - Shopify Print Preview Sandbox Fix

This version removes all JavaScript from the HTML returned by `/print?format=html`.

Shopify Admin Print Action displays the printable document in a sandboxed blob/frame where scripts are not allowed. If the printable HTML contains inline event handlers such as `onclick="window.print()"`, Chrome logs:

`Blocked script execution in blob:https://admin.shopify.com/... because the document frame is sandboxed and the allow-scripts permission is not set.`

The printable document is now static HTML/CSS only. Shopify controls the actual print action through the Admin Print Action UI.
