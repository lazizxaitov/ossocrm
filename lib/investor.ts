import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TxClient = Prisma.TransactionClient;

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
      select: { id: true, investedAmountUSD: true },
    }),
  ]);

  if (!container) {
    throw new Error("Контейнер не найден.");
  }

  const total = investments.reduce((sum, row) => sum + row.investedAmountUSD, 0);
  for (const row of investments) {
    const percentageShare = total > 0 ? (row.investedAmountUSD / total) * 100 : 0;
    await tx.containerInvestment.update({
      where: { id: row.id },
      data: { percentageShare },
    });
  }

  const expected = container.totalPurchaseUSD + container.totalExpensesUSD;
  return { investedTotal: total, expectedTotal: expected, matchesExpected: Math.abs(total - expected) < 0.01 };
}

export function computeInvestorProfit(containerNetProfitUSD: number, percentageShare: number) {
  return (containerNetProfitUSD * percentageShare) / 100;
}
