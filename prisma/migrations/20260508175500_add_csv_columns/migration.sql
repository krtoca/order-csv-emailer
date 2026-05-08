-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrderCsvEmailSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "fromEmail" TEXT,
    "bccEmail" TEXT,
    "emailSubject" TEXT NOT NULL DEFAULT 'Order {{orderName}} line items CSV',
    "emailBody" TEXT NOT NULL DEFAULT 'Thank you for your order. Your order line items CSV file is attached.',
    "csvColumns" TEXT NOT NULL DEFAULT 'orderName,customerEmail,sku,productTitle,variantTitle,quantity,price,vendor',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_OrderCsvEmailSetting" ("bccEmail", "createdAt", "emailBody", "emailSubject", "enabled", "fromEmail", "id", "shop", "updatedAt") SELECT "bccEmail", "createdAt", "emailBody", "emailSubject", "enabled", "fromEmail", "id", "shop", "updatedAt" FROM "OrderCsvEmailSetting";
DROP TABLE "OrderCsvEmailSetting";
ALTER TABLE "new_OrderCsvEmailSetting" RENAME TO "OrderCsvEmailSetting";
CREATE UNIQUE INDEX "OrderCsvEmailSetting_shop_key" ON "OrderCsvEmailSetting"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
