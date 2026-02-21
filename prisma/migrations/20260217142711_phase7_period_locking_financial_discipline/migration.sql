/*
  Warnings:

  - Added the required column `financialPeriodId` to the `ContainerExpense` table without a default value. This is not possible if the table is not empty.
  - Added the required column `financialPeriodId` to the `ExpenseCorrection` table without a default value. This is not possible if the table is not empty.
  - Added the required column `financialPeriodId` to the `InvestorPayout` table without a default value. This is not possible if the table is not empty.
  - Added the required column `financialPeriodId` to the `Sale` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "FinancialPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lockedById" TEXT,
    "lockedAt" DATETIME,
    "lockReason" TEXT,
    "unlockReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialPeriod_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventorySession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "discrepancyCount" INTEGER NOT NULL DEFAULT 0,
    "financialPeriodId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventorySession_financialPeriodId_fkey" FOREIGN KEY ("financialPeriodId") REFERENCES "FinancialPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Adjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "amountUSD" REAL NOT NULL DEFAULT 0,
    "financialPeriodId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Adjustment_financialPeriodId_fkey" FOREIGN KEY ("financialPeriodId") REFERENCES "FinancialPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContainerExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "containerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountUSD" REAL NOT NULL,
    "description" TEXT,
    "financialPeriodId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContainerExpense_financialPeriodId_fkey" FOREIGN KEY ("financialPeriodId") REFERENCES "FinancialPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ContainerExpense_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ContainerExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ContainerExpense" ("amountUSD", "category", "containerId", "createdAt", "createdById", "description", "id", "title") SELECT "amountUSD", "category", "containerId", "createdAt", "createdById", "description", "id", "title" FROM "ContainerExpense";
DROP TABLE "ContainerExpense";
ALTER TABLE "new_ContainerExpense" RENAME TO "ContainerExpense";
CREATE INDEX "ContainerExpense_containerId_idx" ON "ContainerExpense"("containerId");
CREATE INDEX "ContainerExpense_createdById_idx" ON "ContainerExpense"("createdById");
CREATE INDEX "ContainerExpense_financialPeriodId_idx" ON "ContainerExpense"("financialPeriodId");
CREATE TABLE "new_ExpenseCorrection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expenseId" TEXT NOT NULL,
    "correctionAmountUSD" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "financialPeriodId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseCorrection_financialPeriodId_fkey" FOREIGN KEY ("financialPeriodId") REFERENCES "FinancialPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpenseCorrection_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ContainerExpense" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpenseCorrection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ExpenseCorrection" ("correctionAmountUSD", "createdAt", "createdById", "expenseId", "id", "reason") SELECT "correctionAmountUSD", "createdAt", "createdById", "expenseId", "id", "reason" FROM "ExpenseCorrection";
DROP TABLE "ExpenseCorrection";
ALTER TABLE "new_ExpenseCorrection" RENAME TO "ExpenseCorrection";
CREATE INDEX "ExpenseCorrection_expenseId_idx" ON "ExpenseCorrection"("expenseId");
CREATE INDEX "ExpenseCorrection_createdById_idx" ON "ExpenseCorrection"("createdById");
CREATE INDEX "ExpenseCorrection_financialPeriodId_idx" ON "ExpenseCorrection"("financialPeriodId");
CREATE TABLE "new_InvestorPayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "investorId" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "amountUSD" REAL NOT NULL,
    "payoutDate" DATETIME NOT NULL,
    "financialPeriodId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestorPayout_financialPeriodId_fkey" FOREIGN KEY ("financialPeriodId") REFERENCES "FinancialPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InvestorPayout_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InvestorPayout_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InvestorPayout_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InvestorPayout" ("amountUSD", "containerId", "createdAt", "createdById", "id", "investorId", "payoutDate") SELECT "amountUSD", "containerId", "createdAt", "createdById", "id", "investorId", "payoutDate" FROM "InvestorPayout";
DROP TABLE "InvestorPayout";
ALTER TABLE "new_InvestorPayout" RENAME TO "InvestorPayout";
CREATE INDEX "InvestorPayout_investorId_idx" ON "InvestorPayout"("investorId");
CREATE INDEX "InvestorPayout_containerId_idx" ON "InvestorPayout"("containerId");
CREATE INDEX "InvestorPayout_createdById_idx" ON "InvestorPayout"("createdById");
CREATE INDEX "InvestorPayout_financialPeriodId_idx" ON "InvestorPayout"("financialPeriodId");
CREATE TABLE "new_Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "totalAmountUSD" REAL NOT NULL,
    "paidAmountUSD" REAL NOT NULL,
    "debtAmountUSD" REAL NOT NULL,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL,
    "financialPeriodId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sale_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_financialPeriodId_fkey" FOREIGN KEY ("financialPeriodId") REFERENCES "FinancialPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("clientId", "createdAt", "createdById", "debtAmountUSD", "dueDate", "id", "invoiceNumber", "paidAmountUSD", "status", "totalAmountUSD") SELECT "clientId", "createdAt", "createdById", "debtAmountUSD", "dueDate", "id", "invoiceNumber", "paidAmountUSD", "status", "totalAmountUSD" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_invoiceNumber_key" ON "Sale"("invoiceNumber");
CREATE INDEX "Sale_clientId_idx" ON "Sale"("clientId");
CREATE INDEX "Sale_createdById_idx" ON "Sale"("createdById");
CREATE INDEX "Sale_financialPeriodId_idx" ON "Sale"("financialPeriodId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FinancialPeriod_status_idx" ON "FinancialPeriod"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialPeriod_month_year_key" ON "FinancialPeriod"("month", "year");

-- CreateIndex
CREATE INDEX "InventorySession_financialPeriodId_idx" ON "InventorySession"("financialPeriodId");

-- CreateIndex
CREATE INDEX "Adjustment_financialPeriodId_idx" ON "Adjustment"("financialPeriodId");
