import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TxClient = Prisma.TransactionClient;

type InvestmentRow = {
  id: string;
  investedAmountUSD: number;
  percentageShare: number;
  isManualShare: boolean;
};

function computeAutoShares(rows: InvestmentRow[]) {
  const manualRows = rows.filter((row) => row.isManualShare && row.percentageShare > 0);
  const autoRows = rows.filter((row) => !(row.isManualShare && row.percentageShare > 0));
  const manualTotal = manualRows.reduce((sum, row) => sum + row.percentageShare, 0);
  const remaining = Math.max(0, 100 - manualTotal);
  const autoTotal = autoRows.reduce((sum, row) => sum + row.investedAmountUSD, 0);

  return autoRows.map((row) => ({
    id: row.id,
    percentageShare: autoTotal > 0 ? (row.investedAmountUSD / autoTotal) * remaining : 0,
  }));
}

export async function recalculateContainerInvestmentShares(
  containerId: string,
  tx: TxClient = prisma as unknown as TxClient,
) {
  const [container, investments] = await Promise.all([
    tx.container.findUnique({
      where: { id: containerId },
      select: { totalPurchaseUSD: true, totalExpensesUSD: true },
    }),
    tx.containerInvestment.findMany({
      where: { containerId },
      select: { id: true, investedAmountUSD: true, percentageShare: true, isManualShare: true },
    }),
  ]);

  if (!container) {
    throw new Error("Контейнер не найден.");
  }

  const total = investments.reduce((sum, row) => sum + row.investedAmountUSD, 0);

  if (investments.some((row) => row.isManualShare && row.percentageShare > 0)) {
    const updates = computeAutoShares(investments);
    for (const row of updates) {
      await tx.containerInvestment.update({
        where: { id: row.id },
        data: { percentageShare: row.percentageShare },
      });
    }
  } else {
    for (const row of investments) {
      const percentageShare = total > 0 ? (row.investedAmountUSD / total) * 100 : 0;
      await tx.containerInvestment.update({
        where: { id: row.id },
        data: { percentageShare },
      });
    }
  }

  const expected = container.totalPurchaseUSD + container.totalExpensesUSD;
  return { investedTotal: total, expectedTotal: expected, matchesExpected: Math.abs(total - expected) < 0.01 };
}

export function computeInvestorProfit(containerNetProfitUSD: number, percentageShare: number) {
  return (containerNetProfitUSD * percentageShare) / 100;
}

export function sortInvestorsOssFirst<T extends { name: string }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const aIsOsso = a.name.trim().toLowerCase() === "osso company";
    const bIsOsso = b.name.trim().toLowerCase() === "osso company";
    if (aIsOsso && !bIsOsso) return -1;
    if (!aIsOsso && bIsOsso) return 1;
    return a.name.localeCompare(b.name, "ru");
  });
}
