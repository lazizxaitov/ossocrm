import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TxClient = Prisma.TransactionClient;

export async function recalculateContainerFinancials(
  containerId: string,
  tx: TxClient = prisma as unknown as TxClient,
) {
  const [saleItems, expenses] = await Promise.all([
    tx.saleItem.findMany({
      where: { containerItem: { containerId } },
      select: {
        quantity: true,
        salePricePerUnitUSD: true,
        costPerUnitUSD: true,
        returnItems: { select: { quantity: true } },
      },
    }),
    tx.containerExpense.findMany({
      where: { containerId },
      select: {
        amountUSD: true,
        corrections: { select: { correctionAmountUSD: true } },
      },
    }),
  ]);

  let totalSalesRevenue = 0;
  let totalCostOfGoodsSold = 0;

  for (const item of saleItems) {
    const returnedQty = item.returnItems.reduce((sum, row) => sum + row.quantity, 0);
    const effectiveQty = Math.max(0, item.quantity - returnedQty);
    totalSalesRevenue += effectiveQty * item.salePricePerUnitUSD;
    totalCostOfGoodsSold += effectiveQty * item.costPerUnitUSD;
  }

  const totalExpenses = expenses.reduce((sum, expense) => {
    const corrections = expense.corrections.reduce((inner, row) => inner + row.correctionAmountUSD, 0);
    return sum + expense.amountUSD + corrections;
  }, 0);

  const netProfitUSD = totalSalesRevenue - totalCostOfGoodsSold - totalExpenses;

  await tx.container.update({
    where: { id: containerId },
    data: {
      totalExpensesUSD: totalExpenses,
      netProfitUSD,
    },
  });

  return { totalSalesRevenue, totalCostOfGoodsSold, totalExpenses, netProfitUSD };
}
