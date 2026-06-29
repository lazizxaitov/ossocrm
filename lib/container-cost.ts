import { prisma } from "@/lib/prisma";
import {
  buildCustomsFallbackPerUnitMap,
  calculateV2Costing,
  COSTING_RULE_MODES,
  resolveCostingRuleMode,
} from "@/lib/costing-rules";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export async function recalculateContainerUnitCost(containerId: string, tx: TxClient = prisma) {
  const [container, grouped, control, items, expenses] = await Promise.all([
    tx.container.findUnique({
      where: { id: containerId },
      select: { totalPurchaseUSD: true, totalExpensesUSD: true },
    }),
    tx.containerItem.aggregate({
      where: { containerId },
      _sum: { quantity: true },
    }),
    tx.systemControl.findUnique({
      where: { id: 1 },
      select: { costingRuleMode: true },
    }),
    tx.containerItem.findMany({
      where: { containerId },
      select: {
        id: true,
        quantity: true,
        unitPriceUSD: true,
        lineTotalUSD: true,
        cbm: true,
        manualCustomsPerUnitUSD: true,
        product: {
          select: {
            name: true,
            sku: true,
            category: { select: { name: true } },
          },
        },
      },
    }),
    tx.containerExpense.findMany({
      where: { containerId },
      select: {
        category: true,
        amountUSD: true,
      },
    }),
  ]);

  if (!container) {
    throw new Error("Контейнер не найден.");
  }

  const costingRuleMode = resolveCostingRuleMode(control?.costingRuleMode);

  if (costingRuleMode === COSTING_RULE_MODES.CATEGORY_BASED_V2) {
    const totalCustomsUsd = expenses
      .filter((expense) => expense.category === "CUSTOMS")
      .reduce((sum, expense) => sum + expense.amountUSD, 0);
    const customsFallbackMap = buildCustomsFallbackPerUnitMap({
      items: items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitPriceUsd: item.unitPriceUSD,
        lineTotalUsd: item.lineTotalUSD,
        manualCustomsPerUnitUsd: item.manualCustomsPerUnitUSD,
        categoryName: item.product.category?.name,
        productName: item.product.name,
        sku: item.product.sku,
      })),
      totalCustomsUsd,
    });

    for (const item of items) {
      const metrics = calculateV2Costing({
        quantity: item.quantity,
        unitPriceUsd: item.unitPriceUSD,
        lineTotalUsd: item.lineTotalUSD,
        cbmPerUnit: item.cbm,
        categoryName: item.product.category?.name,
        productName: item.product.name,
        sku: item.product.sku,
        manualCustomsPerUnitUsd: item.manualCustomsPerUnitUSD,
        fallbackCustomsPerUnitUsd: customsFallbackMap.get(item.id) ?? 0,
      });
      await tx.containerItem.update({
        where: { id: item.id },
        data: { costPerUnitUSD: metrics.finalUnitCostUsd },
      });
    }

    return {
      totalQuantity: grouped._sum.quantity ?? 0,
      unitCost: 0,
    };
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
