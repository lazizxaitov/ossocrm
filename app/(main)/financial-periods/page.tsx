import Link from "next/link";
import { redirect } from "next/navigation";
import { lockFinancialPeriodAction, unlockFinancialPeriodAction } from "@/app/(main)/financial-periods/actions";
import { getRequiredSession } from "@/lib/auth";
import { computeKpis, rangeFromPeriod } from "@/lib/dashboard";
import { formatUsd } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { PERIODS_MANAGE_ROLES, PERIODS_UNLOCK_ROLES, PERIODS_VIEW_ROLES } from "@/lib/rbac";
import { ruStatus } from "@/lib/ru-labels";

type FinancialPeriodsPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

async function getArrivedContainerIdsAt(to: Date) {
  const containers = await prisma.container.findMany({
    where: {
      status: { in: ["ARRIVED", "CLOSED"] },
      purchaseDate: { lte: to },
      OR: [{ arrivalDate: { lte: to } }, { arrivalDate: null }],
    },
    select: { id: true },
  });
  return containers.map((row) => row.id);
}

async function computeWarehouseStockValueAt(to: Date) {
  const containerIds = await getArrivedContainerIdsAt(to);
  if (containerIds.length === 0) return 0;

  const items = await prisma.containerItem.findMany({
    where: { containerId: { in: containerIds } },
    select: { id: true, quantity: true, costPerUnitUSD: true },
  });
  if (items.length === 0) return 0;

  const itemIds = items.map((row) => row.id);

  const [soldAfter, returnsAfter] = await Promise.all([
    prisma.saleItem.groupBy({
      by: ["containerItemId"],
      where: { containerItemId: { in: itemIds }, sale: { createdAt: { gt: to } } },
      _sum: { quantity: true },
    }),
    prisma.returnItem.findMany({
      where: { return: { createdAt: { gt: to } }, saleItem: { containerItemId: { in: itemIds } } },
      select: { quantity: true, saleItem: { select: { containerItemId: true } } },
    }),
  ]);

  const soldAfterMap = new Map<string, number>();
  for (const row of soldAfter) {
    soldAfterMap.set(row.containerItemId, row._sum.quantity ?? 0);
  }

  const returnsAfterMap = new Map<string, number>();
  for (const row of returnsAfter) {
    const key = row.saleItem.containerItemId;
    returnsAfterMap.set(key, (returnsAfterMap.get(key) ?? 0) + row.quantity);
  }

  let total = 0;
  for (const item of items) {
    const soldQtyAfter = soldAfterMap.get(item.id) ?? 0;
    const returnedQtyAfter = returnsAfterMap.get(item.id) ?? 0;
    const qtyAtTo = Math.max(0, item.quantity + soldQtyAfter - returnedQtyAfter);
    total += qtyAtTo * item.costPerUnitUSD;
  }

  return total;
}

async function computeAvailableToPayoutAt(to: Date) {
  const containerIds = await getArrivedContainerIdsAt(to);
  if (containerIds.length === 0) return 0;

  const [containers, investments, paidUpTo] = await Promise.all([
    prisma.container.findMany({
      where: { id: { in: containerIds } },
      select: { id: true, netProfitUSD: true, totalExpensesUSD: true },
    }),
    prisma.containerInvestment.findMany({
      where: { containerId: { in: containerIds } },
      select: { containerId: true, investorId: true, percentageShare: true },
    }),
    prisma.investorPayout.groupBy({
      by: ["containerId", "investorId"],
      where: { containerId: { in: containerIds }, payoutDate: { lte: to } },
      _sum: { amountUSD: true },
    }),
  ]);

  const paidMap = new Map<string, number>();
  for (const row of paidUpTo) {
    paidMap.set(`${row.containerId}:${row.investorId}`, row._sum.amountUSD ?? 0);
  }

  const containerMap = new Map(containers.map((c) => [c.id, c]));

  const [salesAfter, returnProfitAfterOldSales, expenseAfter, correctionAfter] = await Promise.all([
    prisma.saleItem.findMany({
      where: { sale: { createdAt: { gt: to } }, containerItem: { containerId: { in: containerIds } } },
      select: {
        quantity: true,
        salePricePerUnitUSD: true,
        costPerUnitUSD: true,
        containerItem: { select: { containerId: true } },
        returnItems: { select: { quantity: true } },
      },
    }),
    prisma.returnItem.findMany({
      where: {
        return: { createdAt: { gt: to } },
        saleItem: { sale: { createdAt: { lte: to } }, containerItem: { containerId: { in: containerIds } } },
      },
      select: {
        quantity: true,
        saleItem: {
          select: {
            salePricePerUnitUSD: true,
            costPerUnitUSD: true,
            containerItem: { select: { containerId: true } },
          },
        },
      },
    }),
    prisma.containerExpense.findMany({
      where: { containerId: { in: containerIds }, createdAt: { gt: to } },
      select: { containerId: true, amountUSD: true },
    }),
    prisma.expenseCorrection.findMany({
      where: { expense: { containerId: { in: containerIds } }, createdAt: { gt: to } },
      select: { correctionAmountUSD: true, expense: { select: { containerId: true } } },
    }),
  ]);

  const salesProfitAfterMap = new Map<string, number>();
  for (const row of salesAfter) {
    const returned = row.returnItems.reduce((sum, r) => sum + r.quantity, 0);
    const effectiveQty = Math.max(0, row.quantity - returned);
    const profit = effectiveQty * (row.salePricePerUnitUSD - row.costPerUnitUSD);
    salesProfitAfterMap.set(row.containerItem.containerId, (salesProfitAfterMap.get(row.containerItem.containerId) ?? 0) + profit);
  }

  const returnProfitAfterOldSalesMap = new Map<string, number>();
  for (const row of returnProfitAfterOldSales) {
    const profit = row.quantity * (row.saleItem.salePricePerUnitUSD - row.saleItem.costPerUnitUSD);
    const containerId = row.saleItem.containerItem.containerId;
    returnProfitAfterOldSalesMap.set(containerId, (returnProfitAfterOldSalesMap.get(containerId) ?? 0) + profit);
  }

  const expensesAfterMap = new Map<string, number>();
  for (const row of expenseAfter) {
    expensesAfterMap.set(row.containerId, (expensesAfterMap.get(row.containerId) ?? 0) + row.amountUSD);
  }
  for (const row of correctionAfter) {
    const containerId = row.expense.containerId;
    expensesAfterMap.set(containerId, (expensesAfterMap.get(containerId) ?? 0) + row.correctionAmountUSD);
  }

  const netProfitAtToByContainer = new Map<string, number>();
  for (const containerId of containerIds) {
    const container = containerMap.get(containerId);
    if (!container) continue;
    const netProfitCurrent = container.netProfitUSD;
    const salesProfitAfterValue = salesProfitAfterMap.get(containerId) ?? 0;
    const returnProfitAfterOldSalesValue = returnProfitAfterOldSalesMap.get(containerId) ?? 0;
    const expensesAfterValue = expensesAfterMap.get(containerId) ?? 0;
    netProfitAtToByContainer.set(
      containerId,
      netProfitCurrent - salesProfitAfterValue + returnProfitAfterOldSalesValue + expensesAfterValue,
    );
  }

  let available = 0;
  for (const inv of investments) {
    const netProfitAtTo = netProfitAtToByContainer.get(inv.containerId) ?? 0;
    const shareProfit = (netProfitAtTo * inv.percentageShare) / 100;
    const paid = paidMap.get(`${inv.containerId}:${inv.investorId}`) ?? 0;
    available += shareProfit - paid;
  }

  return available;
}

export default async function FinancialPeriodsPage({ searchParams }: FinancialPeriodsPageProps) {
  const session = await getRequiredSession();
  if (!PERIODS_VIEW_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const errorMessage = params.error ? String(params.error) : "";
  const successMessage = params.success ? String(params.success) : "";

  const canLock = PERIODS_MANAGE_ROLES.includes(session.role);
  const canUnlock = PERIODS_UNLOCK_ROLES.includes(session.role);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  let periods = await prisma.financialPeriod.findMany({
    where: {
      OR: [
        { year: { lt: currentYear } },
        { year: currentYear, month: { lte: currentMonth } },
      ],
    },
    include: { lockedBy: { select: { name: true, login: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 24,
  });

  if (periods.length === 0) {
    await prisma.financialPeriod.create({
      data: { month: now.getMonth() + 1, year: now.getFullYear(), status: "OPEN" },
    });
    periods = await prisma.financialPeriod.findMany({
      where: {
        OR: [
          { year: { lt: currentYear } },
          { year: currentYear, month: { lte: currentMonth } },
        ],
      },
      include: { lockedBy: { select: { name: true, login: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 24,
    });
  }

  const withProfit: Array<{
    period: (typeof periods)[number];
    profit: number;
    expenses: number;
    revenue: number;
    stockValueUSD: number;
    availableToPayoutUSD: number;
  }> = [];

  for (const period of periods) {
    const { from, to } = rangeFromPeriod(period.year, period.month);
    const [kpi, stockValueUSD, availableToPayoutUSD] = await Promise.all([
      computeKpis({ from, to }),
      computeWarehouseStockValueAt(to),
      computeAvailableToPayoutAt(to),
    ]);
    withProfit.push({
      period,
      profit: kpi.netProfit,
      expenses: kpi.expenses,
      revenue: kpi.revenue,
      stockValueUSD,
      availableToPayoutUSD,
    });
  }

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">Финансовые периоды</h2>
        <p className="mt-1 text-sm text-slate-600">Контроль закрытия и разблокировки месяцев.</p>
      </article>

      {errorMessage ? (
        <article className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMessage}
        </article>
      ) : null}

      {successMessage ? (
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </article>
      ) : null}

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Месяц</th>
              <th className="px-3 py-2 font-medium">Статус</th>
              <th className="px-3 py-2 font-medium">Прибыль</th>
              <th className="px-3 py-2 font-medium">Расходы</th>
              <th className="px-3 py-2 font-medium">Склад</th>
              <th className="px-3 py-2 font-medium">Продажи</th>
              <th className="px-3 py-2 font-medium">Инвесторам</th>
              <th className="px-3 py-2 font-medium">Закрыт кем</th>
              <th className="px-3 py-2 font-medium">Дата</th>
              <th className="px-3 py-2 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {withProfit.map(({ period, profit, expenses, revenue, stockValueUSD, availableToPayoutUSD }) => (
              <tr key={period.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 text-slate-800">
                  {String(period.month).padStart(2, "0")}.{period.year}
                </td>
                <td className="px-3 py-2 text-slate-700">{ruStatus(period.status)}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(profit)}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(expenses)}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(stockValueUSD)}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(revenue)}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(availableToPayoutUSD)}</td>
                <td className="px-3 py-2 text-slate-700">
                  {period.lockedBy ? `${period.lockedBy.name} (${period.lockedBy.login})` : "—"}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {period.lockedAt ? new Date(period.lockedAt).toLocaleString("ru-RU") : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {canLock && period.status === "OPEN" ? (
                      <form action={lockFinancialPeriodAction}>
                        <input type="hidden" name="periodId" value={period.id} />
                        <button
                          type="submit"
                          className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          Закрыть
                        </button>
                      </form>
                    ) : null}
                    {canUnlock && period.status === "LOCKED" ? (
                      <form action={unlockFinancialPeriodAction} className="flex items-center gap-2">
                        <input type="hidden" name="periodId" value={period.id} />
                        <input
                          name="reason"
                          required
                          placeholder="Причина разблокировки"
                          className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                        />
                        <button
                          type="submit"
                          className="rounded bg-[var(--accent)] px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          Разблокировать
                        </button>
                      </form>
                    ) : null}
                    <Link
                      href={`/api/financial-periods/${period.id}/report`}
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      CSV
                    </Link>
                    <Link
                      href={`/api/financial-periods/${period.id}/report/word`}
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Word
                    </Link>
                    <Link
                      href={`/api/financial-periods/${period.id}/report/pdf`}
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      PDF
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
