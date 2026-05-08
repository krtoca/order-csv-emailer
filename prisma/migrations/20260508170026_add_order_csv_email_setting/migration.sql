-- CreateTable
CREATE TABLE "OrderCsvEmailSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "fromEmail" TEXT,
    "bccEmail" TEXT,
    "emailSubject" TEXT NOT NULL DEFAULT 'Order {{orderName}} line items CSV',
    "emailBody" TEXT NOT NULL DEFAULT 'Thank you for your order. Your order line items CSV file is attached.',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderCsvEmailSetting_shop_key" ON "OrderCsvEmailSetting"("shop");
