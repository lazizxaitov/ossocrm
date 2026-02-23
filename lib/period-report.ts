import { computeKpis, rangeFromPeriod } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";

export type PeriodReportData = {
  period: {
    id: string;
    month: number;
    year: number;
    status: string;
    lockedAt: Date | null;
  };
  range: {
    from: Date;
    to: Date;
  };
  kpi: {
    revenue: number;
    cogs: number;
    expenses: number;
    netProfit: number;
    debtTotal: number;
    availableToPayout: number;
  };
  sales: Array<{
    invoiceNumber: string;
    createdAt: Date;
    clientName: string;
    status: string;
    totalAmountUSD: number;
    paidAmountUSD: number;
    debtAmountUSD: number;
    dueDate: Date | null;
    itemsCount: number;
  }>;
  expenses: Array<{
    createdAt: Date;
    containerName: string;
    category: string;
    title: string;
    amountUSD: number;
    correctionSumUSD: number;
    finalAmountUSD: number;
    unconfirmedCorrections: number;
  }>;
  payouts: Array<{
    payoutDate: Date;
    investorName: string;
    containerName: string;
    amountUSD: number;
  }>;
  inventory: Array<{
    createdAt: Date;
    title: string;
    status: string;
    discrepancyCount: number;
  }>;
  summary: {
    salesCount: number;
    completedSales: number;
    debtSales: number;
    partialSales: number;
    overdueDebtCount: number;
    overdueDebtAmount: number;
    expensesCount: number;
    payoutsCount: number;
    inventorySessionsCount: number;
    discrepancySessionsCount: number;
    totalCorrectionsUSD: number;
    containersInvolved: number;
  };
};

export function formatUsdPlain(value: number) {
  return `${value.toFixed(2)} USD`;
}

export async function getPeriodReportData(periodId: string): Promise<PeriodReportData | null> {
  const period = await prisma.financialPeriod.findUnique({
    where: { id: periodId },
    select: {
      id: true,
      month: true,
      year: true,
      status: true,
      lockedAt: true,
    },
  });

  if (!period) return null;

  const { from, to } = rangeFromPeriod(period.year, period.month);
  const kpi = await computeKpis({ from, to });

  const [salesRaw, expensesRaw, payoutsRaw, inventoryRaw] = await Promise.all([
    prisma.sale.findMany({
      where: { financialPeriodId: period.id },
      orderBy: { createdAt: "asc" },
      include: {
        client: { select: { name: true } },
        items: { select: { id: true } },
      },
    }),
    prisma.containerExpense.findMany({
      where: { financialPeriodId: period.id },
      orderBy: { createdAt: "asc" },
      include: {
        container: { select: { name: true } },
        corrections: {
          select: {
            correctionAmountUSD: true,
            isConfirmed: true,
          },
        },
      },
    }),
    prisma.investorPayout.findMany({
      where: { financialPeriodId: period.id },
      orderBy: { payoutDate: "asc" },
      include: {
        investor: { select: { name: true } },
        container: { select: { name: true } },
      },
    }),
    prisma.inventorySession.findMany({
      where: { financialPeriodId: period.id },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        title: true,
        status: true,
        discrepancyCount: true,
      },
    }),
  ]);

  const now = new Date();
  const sales = salesRaw.map((sale) => ({
    invoiceNumber: sale.invoiceNumber,
    createdAt: sale.createdAt,
    clientName: sale.client.name,
    status: sale.status,
    totalAmountUSD: sale.totalAmountUSD,
    paidAmountUSD: sale.paidAmountUSD,
    debtAmountUSD: sale.debtAmountUSD,
    dueDate: sale.dueDate,
    itemsCount: sale.items.length,
  }));

  const expenses = expensesRaw.map((expense) => {
    const correctionSumUSD = expense.corrections.reduce((sum, row) => sum + row.correctionAmountUSD, 0);
    const unconfirmedCorrections = expense.corrections.filter((row) => !row.isConfirmed).length;
    return {
      createdAt: expense.createdAt,
      containerName: expense.container.name,
      category: expense.category,
      title: expense.title,
      amountUSD: expense.amountUSD,
      correctionSumUSD,
      finalAmountUSD: expense.amountUSD + correctionSumUSD,
      unconfirmedCorrections,
    };
  });

  const payouts = payoutsRaw.map((row) => ({
    payoutDate: row.payoutDate,
    investorName: row.investor.name,
    containerName: row.container.name,
    amountUSD: row.amountUSD,
  }));

  const inventory = inventoryRaw.map((row) => ({
    createdAt: row.createdAt,
    title: row.title,
    status: row.status,
    discrepancyCount: row.discrepancyCount,
  }));

  const overdueSales = sales.filter((sale) => sale.debtAmountUSD > 0 && sale.dueDate && sale.dueDate < now);
  const overdueDebtAmount = overdueSales.reduce((sum, sale) => sum + sale.debtAmountUSD, 0);
  const totalCorrectionsUSD = expenses.reduce((sum, row) => sum + row.correctionSumUSD, 0);

  const containerSet = new Set<string>();
  for (const row of expenses) containerSet.add(row.containerName);
  for (const row of payouts) containerSet.add(row.containerName);

  const summary = {
    salesCount: sales.length,
    completedSales: sales.filter((row) => row.status === "COMPLETED").length,
    debtSales: sales.filter((row) => row.status === "DEBT").length,
    partialSales: sales.filter((row) => row.status === "PARTIALLY_PAID").length,
    overdueDebtCount: overdueSales.length,
    overdueDebtAmount,
    expensesCount: expenses.length,
    payoutsCount: payouts.length,
    inventorySessionsCount: inventory.length,
    discrepancySessionsCount: inventory.filter((row) => row.discrepancyCount > 0).length,
    totalCorrectionsUSD,
    containersInvolved: containerSet.size,
  };

  return {
    period: {
      id: period.id,
      month: period.month,
      year: period.year,
      status: period.status,
      lockedAt: period.lockedAt,
    },
    range: { from, to },
    kpi,
    sales,
    expenses,
    payouts,
    inventory,
    summary,
  };
}
