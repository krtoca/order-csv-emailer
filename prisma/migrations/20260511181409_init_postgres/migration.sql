-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderCsvEmailSetting" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "fromEmail" TEXT,
    "bccEmail" TEXT,
    "emailSubject" TEXT NOT NULL DEFAULT 'Order {{orderName}} line items CSV',
    "emailBody" TEXT NOT NULL DEFAULT 'Thank you for your order. Your order line items CSV file is attached.',
    "csvColumns" TEXT NOT NULL DEFAULT 'orderName,customerEmail,sku,barcode,productTitle,variantTitle,quantity,price,vendor',
    "onlySendForOrderTag" TEXT,
    "onlySendForCustomerTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderCsvEmailSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderCsvEmailSetting_shop_key" ON "OrderCsvEmailSetting"("shop");
