# One Order Printer - Admin Print + Customer Account PDF

This Shopify app provides two document flows in one app:

1. **Admin**: Shopify Admin > Order detail > Print > One Order Printer
   - Select **Invoice**, **Packing List**, or both
   - Open / download / save PDF

2. **Customer Account**: Customer logs in to Shopify Customer Account > Orders
   - Each order action menu shows **Download Invoice PDF**
   - Customer can download **Invoice PDF only**
   - Packing lists are admin-only
   - The backend validates the Customer Account session token and checks that the order belongs to the logged-in customer before returning the PDF.

## Important setup

### 1. Update app URLs

Replace all `CHANGE-ME` values in:

- `shopify.app.toml`
- `.env`
- `extensions/customer-order-download/src/OrderActionModalExtension.jsx`

The customer account extension must use your deployed app URL in `APP_URL`:

```js
const APP_URL = 'https://your-app.onrender.com';
```

### 2. Required scopes

Default production scopes in this version:

```txt
read_orders,read_all_orders,read_products,read_files,write_files,customer_read_customers,customer_read_orders
```

Notes:

- `read_all_orders` is required for orders older than 60 days and must be approved in Shopify Partner Dashboard before production use.
- `read_files` and `write_files` are required because logo files are uploaded to **Shopify Files**.
- After changing scopes, reinstall or reauthorize the app on the store.

### 3. Logo storage

Template logo upload now uses Shopify Files:

1. Admin uploads PNG/JPG logo in **Customize print templates**.
2. App calls `stagedUploadsCreate`.
3. App uploads the file to Shopify's staged upload target.
4. App calls `fileCreate`.
5. App saves only the Shopify `logoFileId`, `logoUrl`, file name, and content type in the app database.

The logo is loaded from the Shopify CDN URL when PDFs are generated.

> PNG and JPG are supported. WEBP is intentionally not accepted because PDFKit handles PNG/JPG more reliably for server-side PDF rendering.

### 4. Customer account extension network access

The customer extension uses `fetch()` to call the app backend. The extension config has:

```toml
[extensions.capabilities]
api_access = true
network_access = true
```

For production, make sure network access is allowed in the Shopify Partner Dashboard when required.

### 5. Install and run

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Deploy extensions:

```bash
shopify app deploy
```

## Main routes

### Admin print route

```txt
/print?orderId=gid://shopify/Order/123&printType=Invoice&format=html
/print?orderId=gid://shopify/Order/123&printType=Invoice&format=pdf
/print?orderId=gid://shopify/Order/123&printType=Packing%20Slip&format=pdf
/print?orderId=gid://shopify/Order/123&printType=Invoice,Packing%20Slip&format=pdf
/print?orderId=gid://shopify/Order/123&printType=Invoice&format=pdf&download=1
/print?orderId=gid://shopify/Order/123&printType=Invoice&format=pdf&save=1
```

### Customer PDF route

```txt
/customer/pdf?orderId=gid://shopify/Order/123&type=invoice&download=1
```

Customer route requires a Customer Account session token in the `Authorization: Bearer <token>` header.

## Template customization

Open:

```txt
/app/templates
```

Customizable fields:

- Company name
- Company address
- Phone
- Email
- Logo upload to Shopify Files
- Invoice title
- Packing list title
- Footer text
- SKU visibility
- Barcode visibility
- Vendor visibility
- Customer email visibility
- Customer phone visibility
- Invoice price visibility
- Letter / A4 paper size

## Saved PDFs

Saved generated PDFs are still stored on the app server by default:

```txt
public/generated-pdfs/<shop>/
```

For production on Render, use Persistent Disk for saved PDFs, or replace saved PDF storage with S3 / Cloudflare R2. Logo storage does **not** require Persistent Disk anymore because logos are now in Shopify Files.

## Database update

This version adds these fields to `PrintTemplate`:

```prisma
logoFileId      String @default("")
logoFileName    String @default("")
logoContentType String @default("")
```

Run:

```bash
npx prisma db push
```

## v6 fix note

This package removes `@shopify/ui-extensions-react` from the Admin Print Action extension and uses `@shopify/ui-extensions` + Preact instead. This avoids the npm error for non-existing `@shopify/ui-extensions-react@2026.1.0` and keeps the Admin Print target as:

```toml
target = "admin.order-details.print-action.render"
module = "./src/PrintActionExtension.jsx"
```

After replacing files, run:

```bash
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install
npm run dev
```


## v8 note
Pinned @shopify/ui-extensions to ~2026.4.0 in root and extension package.json files. If you used an older folder, delete node_modules and package-lock.json before npm install.

## v9 Admin print UI fix

- Fixed Admin Print Action checkbox labels by using the `label` attribute.
- Fixed order ID detection by using `shopify.data.selected[0].id`, matching Shopify's Admin Print Action example.
- Admin Print Action now uses `format=html` for preview/printing. PDF output is still available from `/print?format=pdf` and app pages.
- Added `@preact/signals` dependency required by `@shopify/ui-extensions@~2026.4.0`.


## v10 notes - app home and print preview fixes

If the Shopify Admin app page shows `Example Domain`, your Shopify app URL is still pointing to the placeholder URL from `shopify.app.toml`. Run:

```powershell
npm run dev -- --reset
```

Select the existing `one-order-print` app. Then open the app from the Dev Console or refresh Shopify Admin. The CLI should update the app URLs to the local tunnel URL.

If the Admin Print preview says `Preview unable to load`, restart dev after installing dependencies and make sure the `/print` route is returning HTML. This version fixes the missing template argument in `print.tsx` that caused the preview route to fail.

Template editing is available inside the embedded app:

```txt
Apps > one-order-print > Customize print templates
```

If the embedded app still shows Example Domain, the template page will not load because Shopify is not loading this local app server yet. Fix the app URL first with `npm run dev -- --reset`.


## v11 fix

This version adds `app/routes.ts`, which is required by the current React Router build/typegen setup. It maps the app routes explicitly so `npm run typecheck` and `npm run build` no longer fail with `Route config file not found at "app/routes.ts"`.


## v15 note
Admin print preview headers were relaxed for Shopify Admin iframe preview: no CSP frame-ancestors header, cross-origin resource policy allowed, and CORS remains enabled.

## V29 active Shopify config scope fix

If Admin Print preview shows `Access denied for order field` and diagnostics shows the offline session scope as old permissions such as `write_metaobject_definitions,write_metaobjects,write_products`, run:

```powershell
.\scripts\fix-shopify-config.ps1 -AppUrl "https://one-order-printer.onrender.com"
shopify app deploy --config shopify.app.one-order-print.toml
```

Then uninstall/reinstall or re-authorize the app. The offline session scope must include `read_orders`.
