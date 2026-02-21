import { endOfMonth, startOfDay, startOfMonth, subDays } from "@/lib/date";
import { getCurrentFinancialPeriod, getPreviousFinancialPeriod } from "@/lib/financial-period";
import { prisma } from "@/lib/prisma";

export type DashboardRangeKey = "today" | "7d" | "month" | "custom";
export type MonthCloseChecklistKey =
  | "no_debts"
  | "no_issues"
  | "no_open_deals"
  | "inventory_confirmed";

export type MonthCloseChecklistItem = {
  key: MonthCloseChecklistKey;
  label: string;
  ok: boolean;
  reason?: string;
};

export function resolveDateRange(range: DashboardRangeKey, fromRaw?: string, toRaw?: string) {
  const now = new Date();
  if (range === "today") return { from: startOfDay(now), to: now };
  if (range === "7d") return { from: subDays(now, 6), to: now };
  if (range === "month") return { from: startOfMonth(now), to: now };
  const from = fromRaw ? new Date(fromRaw) : startOfMonth(now);
  const to = toRaw ? new Date(toRaw) : now;
  return { from, to };
}

export function rangeFromPeriod(year: number, month: number) {
  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = endOfMonth(from);
  return { from, to };
}

export async function computeKpis(params: { from: Date; to: Date; containerId?: string }) {
  const { from, to, containerId } = params;

  const saleItems = await prisma.saleItem.findMany({
    where: {
      sale: { createdAt: { gte: from, lte: to } },
      containerItem: containerId ? { containerId } : undefined,
    },
    select: {
      quantity: true,
      salePricePerUnitUSD: true,
      costPerUnitUSD: true,
      returnItems: { select: { quantity: true } },
    },
  });

  const expenses = await prisma.containerExpense.findMany({
    where: {
      createdAt: { lte: to },
      containerId: containerId ?? undefined,
    },
    select: {
      createdAt: true,
      amountUSD: true,
      corrections: {
        select: { correctionAmountUSD: true, createdAt: true },
      },
    },
  });

  const debts = await prisma.sale.aggregate({
    where: {
      createdAt: { gte: from, lte: to },
      debtAmountUSD: { gt: 0 },
      items: containerId ? { some: { containerItem: { containerId } } } : undefined,
    },
    _sum: { debtAmountUSD: true },
  });

  let revenue = 0;
  let cogs = 0;
  for (const row of saleItems) {
    const returned = row.returnItems.reduce((sum, item) => sum + item.quantity, 0);
    const effectiveQty = Math.max(0, row.quantity - returned);
    revenue += effectiveQty * row.salePricePerUnitUSD;
    cogs += effectiveQty * row.costPerUnitUSD;
  }

  let totalExpenses = 0;
  for (const expense of expenses) {
    if (expense.createdAt >= from && expense.createdAt <= to) {
      totalExpenses += expense.amountUSD;
    }
    for (const correction of expense.corrections) {
      if (correction.createdAt >= from && correction.createdAt <= to) {
        totalExpenses += correction.correctionAmountUSD;
      }
    }
  }

  const netProfit = revenue - cogs - totalExpenses;
  const debtTotal = debts._sum.debtAmountUSD ?? 0;

  const investments = await prisma.containerInvestment.findMany({
    where: containerId ? { containerId } : undefined,
    include: { container: { select: { netProfitUSD: true } } },
  });

  const payouts = await prisma.investorPayout.groupBy({
    by: ["containerId", "investorId"],
    where: containerId ? { containerId } : undefined,
    _sum: { amountUSD: true },
  });

  const paidMap = new Map<string, number>();
  for (const row of payouts) {
    paidMap.set(`${row.containerId}:${row.investorId}`, row._sum.amountUSD ?? 0);
  }

  let availableToPayout = 0;
  for (const inv of investments) {
    const shareProfit = (inv.container.netProfitUSD * inv.percentageShare) / 100;
    const paid = paidMap.get(`${inv.containerId}:${inv.investorId}`) ?? 0;
    availableToPayout += shareProfit - paid;
  }

  return { revenue, cogs, netProfit, expenses: totalExpenses, debtTotal, availableToPayout };
}

export async function buildContainerRows(from: Date, to: Date) {
  const containers = await prisma.container.findMany({
    include: {
      investments: true,
      items: {
        include: {
          saleItems: {
            where: { sale: { createdAt: { gte: from, lte: to } } },
            include: { returnItems: true },
          },
        },
      },
      expenses: { include: { corrections: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return containers.map((container) => {
    const invested = container.investments.reduce((sum, row) => sum + row.investedAmountUSD, 0);
    let sold = 0;
    let soldQty = 0;
    let currentQty = 0;

    for (const item of container.items) {
      currentQty += item.quantity;
      for (const saleItem of item.saleItems) {
        const returned = saleItem.returnItems.reduce((sum, row) => sum + row.quantity, 0);
        const effectiveQty = Math.max(0, saleItem.quantity - returned);
        soldQty += effectiveQty;
        sold += effectiveQty * saleItem.salePricePerUnitUSD;
      }
    }

    const totalQty = soldQty + currentQty;
    const soldPercent = totalQty > 0 ? (soldQty / totalQty) * 100 : 0;
    const expenses = container.expenses.reduce((sum, row) => {
      const corr = row.corrections.reduce((inner, c) => inner + c.correctionAmountUSD, 0);
      return sum + row.amountUSD + corr;
    }, 0);

    let status = "OPEN";
    if (container.status === "CLOSED") status = "CLOSED";
    else if (soldPercent >= 99) status = "SOLD_OUT";
    else if (soldPercent > 0) status = "IN_PROGRESS";

    return {
      id: container.id,
      name: container.name,
      invested,
      sold,
      expenses,
      profit: container.netProfitUSD,
      status,
      soldPercent,
    };
  });
}

export async function buildDebtRows(now: Date = new Date()) {
  const sales = await prisma.sale.findMany({
    where: { debtAmountUSD: { gt: 0 } },
    include: { client: true },
    orderBy: { dueDate: "asc" },
  });

  const byClient = new Map<string, { client: string; debt: number; overdue: boolean; days: number }>();
  for (const sale of sales) {
    const due = sale.dueDate ? new Date(sale.dueDate) : null;
    const overdue = !!due && due < now;
    const days = overdue ? Math.floor((now.getTime() - due.getTime()) / 86400000) : 0;
    const prev = byClient.get(sale.clientId) ?? { client: sale.client.name, debt: 0, overdue: false, days: 0 };
    prev.debt += sale.debtAmountUSD;
    prev.overdue = prev.overdue || overdue;
    prev.days = Math.max(prev.days, days);
    byClient.set(sale.clientId, prev);
  }

  return [...byClient.values()].sort((a, b) => b.debt - a.debt);
}

export async function buildMonthlyProfitChart() {
  const now = new Date();
  const points: Array<{ label: string; value: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const base = subDays(startOfMonth(now), i * 30);
    const from = startOfMonth(base);
    const to = endOfMonth(base);
    const kpi = await computeKpis({ from, to });
    points.push({ label: from.toLocaleDateString("ru-RU", { month: "short" }), value: kpi.netProfit });
  }
  return points;
}

export async function buildSystemAlerts() {
  const alerts: Array<{ level: "critical" | "warning"; text: string }> = [];
  const control = await prisma.systemControl.findUnique({ where: { id: 1 } });
  const now = new Date();
  const debtRows = await buildDebtRows(now);
  const containerRows = await buildContainerRows(subDays(now, 30), now);

  const currentPeriod = await getCurrentFinancialPeriod();
  const previousPeriod = await getPreviousFinancialPeriod(now);

  if (previousPeriod && previousPeriod.status !== "LOCKED") {
    alerts.push({ level: "critical", text: "Предыдущий месяц не закрыт." });
  }

  if (currentPeriod.status !== "LOCKED") {
    alerts.push({ level: "critical", text: "Текущий период открыт и требует контроля закрытия." });
  }

  if (!control?.inventoryCheckedAt) {
    alerts.push({ level: "critical", text: "Инвентаризация не пройдена." });
  }
  if ((control?.warehouseDiscrepancyCount ?? 0) > 0) {
    alerts.push({ level: "critical", text: "Есть расхождения на складе." });
  }
  if (debtRows.some((row) => row.overdue)) {
    alerts.push({ level: "critical", text: "Есть просроченные долги клиентов." });
  }
  if (containerRows.some((row) => row.soldPercent >= 90 && row.status !== "SOLD_OUT" && row.status !== "CLOSED")) {
    alerts.push({ level: "warning", text: "Есть контейнеры, проданные более чем на 90%." });
  }

  const investors = await prisma.containerInvestment.findMany({ include: { container: true } });
  const payouts = await prisma.investorPayout.groupBy({ by: ["containerId", "investorId"], _sum: { amountUSD: true } });
  const paidMap = new Map<string, number>();
  for (const row of payouts) paidMap.set(`${row.containerId}:${row.investorId}`, row._sum.amountUSD ?? 0);

  if (
    investors.some((row) => {
      const total = (row.container.netProfitUSD * row.percentageShare) / 100;
      if (total <= 0) return false;
      const paid = paidMap.get(`${row.containerId}:${row.investorId}`) ?? 0;
      const progress = paid / total;
      return progress >= 0.9 && progress < 1;
    })
  ) {
    alerts.push({ level: "warning", text: "Инвестор близок к полной выплате." });
  }

  if (control?.plannedMonthlyExpensesUSD && control.plannedMonthlyExpensesUSD > 0) {
    const from = startOfMonth(now);
    const to = now;
    const kpi = await computeKpis({ from, to });
    if (kpi.expenses > control.plannedMonthlyExpensesUSD) {
      alerts.push({ level: "warning", text: "Расходы превышают план на текущий месяц." });
    }
  }

  return alerts;
}

export async function buildMonthCloseBlockersForPeriod(periodId: string) {
  const checklist = await buildMonthCloseChecklistForPeriod(periodId);
  return checklist.filter((item) => !item.ok).map((item) => item.reason ?? item.label);
}

export async function buildMonthCloseChecklistForPeriod(periodId: string): Promise<MonthCloseChecklistItem[]> {
  const period = await prisma.financialPeriod.findUnique({ where: { id: periodId } });
  if (!period) {
    return [
      {
        key: "no_issues",
        label: "Проблем нет",
        ok: false,
        reason: "Период не найден.",
      },
    ];
  }

  const { from, to } = rangeFromPeriod(period.year, period.month);

  const debtsCount = await prisma.sale.count({
    where: {
      financialPeriodId: periodId,
      debtAmountUSD: { gt: 0 },
    },
  });

  const openDealsCount = await prisma.sale.count({
    where: {
      financialPeriodId: periodId,
      status: { in: ["DEBT", "PARTIALLY_PAID"] },
    },
  });

  const pendingOrProblemInventoryCount = await prisma.inventorySession.count({
    where: {
      financialPeriodId: periodId,
      OR: [{ status: "PENDING" }, { status: "DISCREPANCY" }],
    },
  });
  const confirmedInventoryCount = await prisma.inventorySession.count({
    where: {
      financialPeriodId: periodId,
      status: "CONFIRMED",
    },
  });

  const control = await prisma.systemControl.findUnique({ where: { id: 1 } });
  const unconfirmedCorrections = await prisma.expenseCorrection.count({
    where: { financialPeriodId: periodId, isConfirmed: false },
  });

  const kpi = await computeKpis({ from, to });
  const issueReasons: string[] = [];
  if ((control?.warehouseDiscrepancyCount ?? 0) > 0) issueReasons.push("Есть расхождения склада.");
  if (unconfirmedCorrections > 0) issueReasons.push("Есть неподтвержденные корректировки.");
  if (kpi.netProfit < 0) issueReasons.push("Отрицательная чистая прибыль периода.");

  return [
    {
      key: "no_debts",
      label: "Долгов нет",
      ok: debtsCount === 0,
      reason:
        debtsCount > 0
          ? `Найдены продажи с долгом: ${debtsCount}. Сначала погасите задолженность.`
          : undefined,
    },
    {
      key: "no_issues",
      label: "Проблем нет",
      ok: issueReasons.length === 0,
      reason: issueReasons.length > 0 ? issueReasons.join(" ") : undefined,
    },
    {
      key: "no_open_deals",
      label: "Незакрытых сделок нет",
      ok: openDealsCount === 0,
      reason:
        openDealsCount > 0
          ? `Есть незакрытые сделки: ${openDealsCount}. Завершите их перед закрытием месяца.`
          : undefined,
    },
    {
      key: "inventory_confirmed",
      label: "Инвентаризация прошла",
      ok: confirmedInventoryCount > 0 && pendingOrProblemInventoryCount === 0,
      reason:
        confirmedInventoryCount === 0
          ? "Инвентаризация за текущий месяц не подтверждена: код не введен администратором."
          : pendingOrProblemInventoryCount > 0
            ? "Есть незавершенные или проблемные сессии инвентаризации."
            : undefined,
    },
  ];
}
