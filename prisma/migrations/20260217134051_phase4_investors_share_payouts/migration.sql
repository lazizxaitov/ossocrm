-- CreateTable
CREATE TABLE "Investor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContainerInvestment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "containerId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "investedAmountUSD" REAL NOT NULL,
    "percentageShare" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContainerInvestment_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContainerInvestment_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestorPayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "investorId" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "amountUSD" REAL NOT NULL,
    "payoutDate" DATETIME NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestorPayout_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InvestorPayout_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InvestorPayout_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Container" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "purchaseDate" DATETIME NOT NULL,
    "arrivalDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'IN_TRANSIT',
    "totalPurchaseCNY" REAL NOT NULL,
    "exchangeRate" REAL NOT NULL,
    "totalPurchaseUSD" REAL NOT NULL,
    "totalExpensesUSD" REAL NOT NULL DEFAULT 0,
    "netProfitUSD" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Container" ("arrivalDate", "createdAt", "exchangeRate", "id", "name", "purchaseDate", "status", "totalExpensesUSD", "totalPurchaseCNY", "totalPurchaseUSD") SELECT "arrivalDate", "createdAt", "exchangeRate", "id", "name", "purchaseDate", "status", "totalExpensesUSD", "totalPurchaseCNY", "totalPurchaseUSD" FROM "Container";
DROP TABLE "Container";
ALTER TABLE "new_Container" RENAME TO "Container";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "investorId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "id", "isActive", "login", "name", "password", "role") SELECT "createdAt", "id", "isActive", "login", "name", "password", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");
CREATE UNIQUE INDEX "User_investorId_key" ON "User"("investorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ContainerInvestment_containerId_idx" ON "ContainerInvestment"("containerId");

-- CreateIndex
CREATE INDEX "ContainerInvestment_investorId_idx" ON "ContainerInvestment"("investorId");

-- CreateIndex
CREATE UNIQUE INDEX "ContainerInvestment_containerId_investorId_key" ON "ContainerInvestment"("containerId", "investorId");

-- CreateIndex
CREATE INDEX "InvestorPayout_investorId_idx" ON "InvestorPayout"("investorId");

-- CreateIndex
CREATE INDEX "InvestorPayout_containerId_idx" ON "InvestorPayout"("containerId");

-- CreateIndex
CREATE INDEX "InvestorPayout_createdById_idx" ON "InvestorPayout"("createdById");
