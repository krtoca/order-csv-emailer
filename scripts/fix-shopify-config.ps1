param(
  [string]$AppUrl = "https://one-order-printer.onrender.com"
)

$ErrorActionPreference = "Stop"
$Scopes = "read_orders,read_all_orders,read_products,read_files,write_files,customer_read_customers,customer_read_orders"
$RedirectBlock = @"
[auth]
redirect_urls = [
  "$AppUrl/auth/callback",
  "$AppUrl/auth/shopify/callback",
  "$AppUrl/api/auth/callback"
]
"@

$files = Get-ChildItem -Path . -Filter "shopify*.toml" -File
if ($files.Count -eq 0) {
  throw "No shopify*.toml files found in the current directory. Run this script from the project root."
}

foreach ($file in $files) {
  $text = Get-Content $file.FullName -Raw

  if ($text -match 'application_url\s*=') {
    $text = [regex]::Replace($text, 'application_url\s*=\s*"[^"]*"', "application_url = `"$AppUrl`"")
  } else {
    $text = $text + "`napplication_url = `"$AppUrl`"`n"
  }

  if ($text -match '(?s)\[access_scopes\].*?scopes\s*=\s*"[^"]*"') {
    $text = [regex]::Replace($text, '(?s)\[access_scopes\].*?scopes\s*=\s*"[^"]*"', "[access_scopes]`nscopes = `"$Scopes`"")
  } else {
    $text = $text + "`n[access_scopes]`nscopes = `"$Scopes`"`n"
  }

  if ($text -match '(?s)\[auth\]\s*redirect_urls\s*=\s*\[.*?\]') {
    $text = [regex]::Replace($text, '(?s)\[auth\]\s*redirect_urls\s*=\s*\[.*?\]', $RedirectBlock.Trim())
  } else {
    $text = $text + "`n" + $RedirectBlock + "`n"
  }

  Set-Content -Path $file.FullName -Value $text -Encoding UTF8
  Write-Host "Updated $($file.Name)"
}

$customerFile = "extensions/customer-order-download/src/OrderActionModalExtension.jsx"
if (Test-Path $customerFile) {
  $customerText = Get-Content $customerFile -Raw
  $customerText = [regex]::Replace($customerText, "const APP_URL\s*=\s*'[^']*';", "const APP_URL = '$AppUrl';")
  Set-Content -Path $customerFile -Value $customerText -Encoding UTF8
  Write-Host "Updated $customerFile"
}

Write-Host "Done. Now run:"
Write-Host "  Select-String -Path .\shopify*.toml -Pattern \"scopes|application_url\""
Write-Host "  npm run build"
Write-Host "  git add .; git commit -m 'Fix Shopify active config scopes'; git push"
Write-Host "  shopify app deploy --config shopify.app.one-order-print.toml"
