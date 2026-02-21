-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SystemControl" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lastBackupAt" DATETIME,
    "inventoryCheckedAt" DATETIME,
    "warehouseDiscrepancyCount" INTEGER NOT NULL DEFAULT 0,
    "closedMonth" TEXT,
    "plannedMonthlyExpensesUSD" REAL NOT NULL DEFAULT 0,
    "serverTimeOffsetMinutes" INTEGER NOT NULL DEFAULT 0,
    "serverTimeAuto" BOOLEAN NOT NULL DEFAULT true,
    "serverTimeZone" TEXT NOT NULL DEFAULT 'UTC',
    "manualSystemTime" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SystemControl" ("closedMonth", "id", "inventoryCheckedAt", "lastBackupAt", "plannedMonthlyExpensesUSD", "serverTimeOffsetMinutes", "updatedAt", "warehouseDiscrepancyCount") SELECT "closedMonth", "id", "inventoryCheckedAt", "lastBackupAt", "plannedMonthlyExpensesUSD", "serverTimeOffsetMinutes", "updatedAt", "warehouseDiscrepancyCount" FROM "SystemControl";
DROP TABLE "SystemControl";
ALTER TABLE "new_SystemControl" RENAME TO "SystemControl";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
