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

  const withProfit = await Promise.all(
    periods.map(async (period) => {
      const { from, to } = rangeFromPeriod(period.year, period.month);
      const kpi = await computeKpis({ from, to });
      return { period, profit: kpi.netProfit };
    }),
  );

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
              <th className="px-3 py-2 font-medium">Закрыт кем</th>
              <th className="px-3 py-2 font-medium">Дата</th>
              <th className="px-3 py-2 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {withProfit.map(({ period, profit }) => (
              <tr key={period.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 text-slate-800">
                  {String(period.month).padStart(2, "0")}.{period.year}
                </td>
                <td className="px-3 py-2 text-slate-700">{ruStatus(period.status)}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(profit)}</td>
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
