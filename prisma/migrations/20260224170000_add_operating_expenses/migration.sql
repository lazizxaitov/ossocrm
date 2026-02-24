CREATE TABLE "OperatingExpense" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "amountUSD" REAL NOT NULL,
  "spentAt" DATETIME NOT NULL,
  "investorId" TEXT NOT NULL,
  "financialPeriodId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperatingExpense_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OperatingExpense_financialPeriodId_fkey" FOREIGN KEY ("financialPeriodId") REFERENCES "FinancialPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OperatingExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "OperatingExpense_investorId_idx" ON "OperatingExpense"("investorId");
CREATE INDEX "OperatingExpense_financialPeriodId_idx" ON "OperatingExpense"("financialPeriodId");
CREATE INDEX "OperatingExpense_createdById_idx" ON "OperatingExpense"("createdById");
CREATE INDEX "OperatingExpense_spentAt_idx" ON "OperatingExpense"("spentAt");
