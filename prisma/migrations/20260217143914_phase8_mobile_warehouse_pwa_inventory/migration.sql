/*
  Warnings:

  - Added the required column `code` to the `InventorySession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdById` to the `InventorySession` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "InventorySessionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inventorySessionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "containerItemId" TEXT NOT NULL,
    "systemQuantity" INTEGER NOT NULL,
    "actualQuantity" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    CONSTRAINT "InventorySessionItem_inventorySessionId_fkey" FOREIGN KEY ("inventorySessionId") REFERENCES "InventorySession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventorySessionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventorySessionItem_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventorySessionItem_containerItemId_fkey" FOREIGN KEY ("containerItemId") REFERENCES "ContainerItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InventorySession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "discrepancyCount" INTEGER NOT NULL DEFAULT 0,
    "financialPeriodId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" DATETIME,
    "sentToAdminAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventorySession_financialPeriodId_fkey" FOREIGN KEY ("financialPeriodId") REFERENCES "FinancialPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventorySession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventorySession_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InventorySession" ("createdAt", "discrepancyCount", "financialPeriodId", "id", "status", "title") SELECT "createdAt", "discrepancyCount", "financialPeriodId", "id", "status", "title" FROM "InventorySession";
DROP TABLE "InventorySession";
ALTER TABLE "new_InventorySession" RENAME TO "InventorySession";
CREATE UNIQUE INDEX "InventorySession_code_key" ON "InventorySession"("code");
CREATE INDEX "InventorySession_financialPeriodId_idx" ON "InventorySession"("financialPeriodId");
CREATE INDEX "InventorySession_createdById_idx" ON "InventorySession"("createdById");
CREATE INDEX "InventorySession_confirmedById_idx" ON "InventorySession"("confirmedById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "InventorySessionItem_inventorySessionId_idx" ON "InventorySessionItem"("inventorySessionId");

-- CreateIndex
CREATE INDEX "InventorySessionItem_productId_idx" ON "InventorySessionItem"("productId");

-- CreateIndex
CREATE INDEX "InventorySessionItem_containerId_idx" ON "InventorySessionItem"("containerId");

-- CreateIndex
CREATE INDEX "InventorySessionItem_containerItemId_idx" ON "InventorySessionItem"("containerItemId");
