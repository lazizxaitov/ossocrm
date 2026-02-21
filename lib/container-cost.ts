import { prisma } from "@/lib/prisma";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export async function recalculateContainerUnitCost(containerId: string, tx: TxClient = prisma) {
  const [container, grouped] = await Promise.all([
    tx.container.findUnique({
      where: { id: containerId },
      select: { totalPurchaseUSD: true, totalExpensesUSD: true },
    }),
    tx.containerItem.aggregate({
      where: { containerId },
      _sum: { quantity: true },
    }),
  ]);

  if (!container) {
    throw new Error("Контейнер не найден.");
  }

  const totalQuantity = grouped._sum.quantity ?? 0;
  const totalCost = container.totalPurchaseUSD + container.totalExpensesUSD;
  const unitCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;

  await tx.containerItem.updateMany({
    where: { containerId },
    data: { costPerUnitUSD: unitCost },
  });

  return { totalQuantity, unitCost };
}
