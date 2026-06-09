Write-Host "Stopping Shopify/npm processes is recommended before running this script." -ForegroundColor Yellow
if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue }
if (Test-Path package-lock.json) { Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue }
if (Test-Path extensions\admin-order-print\node_modules) { Remove-Item -Recurse -Force extensions\admin-order-print\node_modules -ErrorAction SilentlyContinue }
if (Test-Path extensions\admin-order-print\package-lock.json) { Remove-Item -Force extensions\admin-order-print\package-lock.json -ErrorAction SilentlyContinue }
if (Test-Path extensions\customer-order-download\node_modules) { Remove-Item -Recurse -Force extensions\customer-order-download\node_modules -ErrorAction SilentlyContinue }
if (Test-Path extensions\customer-order-download\package-lock.json) { Remove-Item -Force extensions\customer-order-download\package-lock.json -ErrorAction SilentlyContinue }
npm cache verify
npm install
npx prisma generate
npx prisma db push
