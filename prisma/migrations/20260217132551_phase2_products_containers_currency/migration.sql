-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "basePriceUSD" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "purchaseDate" DATETIME NOT NULL,
    "arrivalDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'IN_TRANSIT',
    "totalPurchaseCNY" REAL NOT NULL,
    "exchangeRate" REAL NOT NULL,
    "totalPurchaseUSD" REAL NOT NULL,
    "totalExpensesUSD" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ContainerItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "containerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "costPerUnitUSD" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContainerItem_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContainerItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CurrencySetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cnyToUsdRate" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT NOT NULL,
    CONSTRAINT "CurrencySetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "ContainerItem_containerId_idx" ON "ContainerItem"("containerId");

-- CreateIndex
CREATE INDEX "ContainerItem_productId_idx" ON "ContainerItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ContainerItem_containerId_productId_key" ON "ContainerItem"("containerId", "productId");

-- CreateIndex
CREATE INDEX "CurrencySetting_updatedById_idx" ON "CurrencySetting"("updatedById");
