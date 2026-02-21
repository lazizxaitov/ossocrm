-- CreateTable
CREATE TABLE "SystemControl" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lastBackupAt" DATETIME,
    "inventoryCheckedAt" DATETIME,
    "warehouseDiscrepancyCount" INTEGER NOT NULL DEFAULT 0,
    "closedMonth" TEXT,
    "plannedMonthlyExpensesUSD" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
