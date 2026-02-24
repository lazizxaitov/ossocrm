import { DashboardFilterPopover } from "@/app/(main)/dashboard/filter-popover";
import { MonthCloseModal } from "@/app/(main)/dashboard/month-close-modal";
import { AutoLogoutTimer } from "@/components/auto-logout-timer";
import { getRequiredSession } from "@/lib/auth";
import {
  buildContainerRows,
  buildDebtRows,
  buildMonthCloseChecklistForPeriod,
  buildMonthlyProfitChart,
  computeKpis,
  resolveDateRange,
  type DashboardRangeKey,
} from "@/lib/dashboard";
import { formatUsd } from "@/lib/currency";
import { getCurrentFinancialPeriod } from "@/lib/financial-period";
import { prisma } from "@/lib/prisma";
import { DASHBOARD_ROLES } from "@/lib/rbac";
import { ruStatus } from "@/lib/ru-labels";
import { redirect } from "next/navigation";

type DashboardPageProps = {
  searchParams: Promise<{
    range?: DashboardRangeKey;
    from?: string;
    to?: string;
    containerId?: string;
  }>;
};

function maxAbs(values: number[]) {
  const max = Math.max(...values.map((v) => Math.abs(v)), 1);
  return max;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await getRequiredSession();
  if (!DASHBOARD_ROLES.includes(session.role)) {
    redirect("/login");
  }
  if (session.role === "INVESTOR") {
    redirect("/investor");
  }

  const params = await searchParams;
  const range = (params.range ?? "month") as DashboardRangeKey;
  const containerId = params.containerId && params.containerId !== "all" ? params.containerId : undefined;
  const { from, to } = resolveDateRange(range, params.from, params.to);

  const [currentPeriod, kpi, containerRows, debtRows, profitChart, containers, control] = await Promise.all([
    getCurrentFinancialPeriod(),
    computeKpis({ from, to, containerId }),
    buildContainerRows(from, to),
    buildDebtRows(),
    buildMonthlyProfitChart(),
    prisma.container.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "desc" } }),
    prisma.systemControl.findUnique({ where: { id: 1 }, select: { serverTimeOffsetMinutes: true } }),
  ]);
  const idleLimitMinutes = Math.max(1, control?.serverTimeOffsetMinutes ?? 10);
  const checklist = await buildMonthCloseChecklistForPeriod(currentPeriod.id);
  const salesByContainer = containerRows.slice(0, 8).map((row) => ({ label: row.name, value: row.sold }));
  const debtChart = debtRows.slice(0, 8).map((row) => ({ label: row.client, value: row.debt }));

  const profitMax = maxAbs(profitChart.map((x) => x.value));
  const salesMax = maxAbs(salesByContainer.map((x) => x.value));
  const debtMax = maxAbs(debtChart.map((x) => x.value));

  return (
    <section className="grid gap-5">
      <article className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Аналитика</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Главная панель</h2>
          </div>
          <DashboardFilterPopover
            range={range}
            from={params.from}
            to={params.to}
            containerId={containerId}
            containers={containers}
          />
        </div>
      </article>

            <MonthCloseModal
              checklist={checklist}
              period={{
                month: currentPeriod.month,
                year: currentPeriod.year,
                status: currentPeriod.status,
              }}
            />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {[
          { title: "Общая выручка", value: formatUsd(kpi.revenue) },
          { title: "Себестоимость проданного", value: formatUsd(kpi.cogs) },
          { title: "Чистая прибыль", value: formatUsd(kpi.netProfit) },
          { title: "Общие расходы", value: formatUsd(kpi.expenses) },
          { title: "В долгах", value: formatUsd(kpi.debtTotal) },
          { title: "К выплате инвесторам", value: formatUsd(kpi.availableToPayout) },
        ].map((card) => (
          <article key={card.title} className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
            <p className="text-xs text-slate-500">{card.title}</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{card.value}</p>
          </article>
        ))}
      </div>

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <div className="px-4 py-3">
          <h3 className="text-base font-semibold text-slate-900">Контейнеры</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Контейнер</th>
              <th className="px-3 py-2 font-medium">Инвестировано</th>
              <th className="px-3 py-2 font-medium">Продано</th>
              <th className="px-3 py-2 font-medium">Расходы</th>
              <th className="px-3 py-2 font-medium">Прибыль</th>
              <th className="px-3 py-2 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {containerRows.map((row) => (
              <tr key={row.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 text-slate-800">{row.name}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(row.invested)}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(row.sold)}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(row.expenses)}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(row.profit)}</td>
                <td className="px-3 py-2 text-slate-700">{ruStatus(row.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <div className="px-4 py-3">
          <h3 className="text-base font-semibold text-slate-900">Долги клиентов</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Клиент</th>
              <th className="px-3 py-2 font-medium">Сумма долга</th>
              <th className="px-3 py-2 font-medium">Просрочка</th>
              <th className="px-3 py-2 font-medium">Дней просрочки</th>
            </tr>
          </thead>
          <tbody>
            {debtRows.map((row) => (
              <tr key={row.client} className={`border-t border-[var(--border)] ${row.overdue ? "bg-red-50" : ""}`}>
                <td className="px-3 py-2 text-slate-800">{row.client}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(row.debt)}</td>
                <td className="px-3 py-2 text-slate-700">{row.overdue ? "Да" : "Нет"}</td>
                <td className={`px-3 py-2 ${row.days > 30 ? "font-semibold text-red-700" : "text-slate-700"}`}>{row.days}</td>
              </tr>
            ))}
            {!debtRows.length ? (
              <tr>
                <td className="px-3 py-4 text-center text-slate-500" colSpan={4}>Долгов нет.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>

      <div className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <h3 className="mb-3 text-base font-semibold text-slate-900">Прибыль по месяцам</h3>
          <div className="space-y-2">
            {profitChart.map((point) => (
              <div key={point.label} className="grid grid-cols-[48px_1fr_90px] items-center gap-2 text-sm">
                <span className="text-slate-600">{point.label}</span>
                <div className="h-3 rounded bg-slate-100">
                  <div
                    className={`h-3 rounded ${point.value >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                    style={{ width: `${Math.max(4, (Math.abs(point.value) / profitMax) * 100)}%` }}
                  />
                </div>
                <span className="text-right text-slate-700">{formatUsd(point.value)}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <h3 className="mb-3 text-base font-semibold text-slate-900">Продажи по контейнерам</h3>
          <div className="space-y-2">
            {salesByContainer.map((point) => (
              <div key={point.label} className="grid grid-cols-[1fr_90px] items-center gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-28 truncate text-slate-600">{point.label}</span>
                  <div className="h-3 flex-1 rounded bg-slate-100">
                    <div className="h-3 rounded bg-[var(--accent)]" style={{ width: `${Math.max(4, (point.value / salesMax) * 100)}%` }} />
                  </div>
                </div>
                <span className="text-right text-slate-700">{formatUsd(point.value)}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <h3 className="mb-3 text-base font-semibold text-slate-900">График долгов</h3>
          <div className="space-y-2">
            {debtChart.map((point) => (
              <div key={point.label} className="grid grid-cols-[1fr_90px] items-center gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-28 truncate text-slate-600">{point.label}</span>
                  <div className="h-3 flex-1 rounded bg-slate-100">
                    <div className="h-3 rounded bg-amber-500" style={{ width: `${Math.max(4, (point.value / debtMax) * 100)}%` }} />
                  </div>
                </div>
                <span className="text-right text-slate-700">{formatUsd(point.value)}</span>
              </div>
            ))}
          </div>
        </article>
      </div>
      <AutoLogoutTimer idleLimitMinutes={idleLimitMinutes} />
    </section>
  );
}





