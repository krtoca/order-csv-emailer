V22 fix:
- Admin Print Action may call /print without an embedded app session and the shop parameter can be empty.
- /print now falls back to the single stored offline Shopify session in the database.
- Optional Render env fallback: PRINT_SHOP_DOMAIN=your-store.myshopify.com or SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com.
