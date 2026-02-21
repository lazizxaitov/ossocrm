-- CreateTable
CREATE TABLE "ManualStockEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "containerId" TEXT NOT NULL,
    "containerItemId" TEXT,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceUSD" REAL,
    "salePriceUSD" REAL,
    "lineTotalUSD" REAL NOT NULL,
    "sizeLabel" TEXT,
    "color" TEXT,
    "cbm" REAL,
    "kg" REAL,
    "totalCbm" REAL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManualStockEntry_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ManualStockEntry_containerItemId_fkey" FOREIGN KEY ("containerItemId") REFERENCES "ContainerItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ManualStockEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ManualStockEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ManualStockEntry_containerId_idx" ON "ManualStockEntry"("containerId");

-- CreateIndex
CREATE INDEX "ManualStockEntry_containerItemId_idx" ON "ManualStockEntry"("containerItemId");

-- CreateIndex
CREATE INDEX "ManualStockEntry_productId_idx" ON "ManualStockEntry"("productId");

-- CreateIndex
CREATE INDEX "ManualStockEntry_createdById_idx" ON "ManualStockEntry"("createdById");
