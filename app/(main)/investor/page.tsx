import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSession } from "@/lib/auth";
import { formatUsd } from "@/lib/currency";
import { computeInvestorProfit } from "@/lib/investor";
import { prisma } from "@/lib/prisma";
import { INVESTOR_PORTAL_ROLES } from "@/lib/rbac";

export default async function InvestorPortalPage() {
  const session = await getRequiredSession();
  if (!INVESTOR_PORTAL_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { investorId: true },
  });

  if (!user?.investorId) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">Кабинет инвестора</h2>
        <p className="mt-2 text-sm text-slate-600">
          Ваш профиль не привязан к карточке инвестора. Обратитесь к администратору.
        </p>
      </section>
    );
  }

  const investor = await prisma.investor.findUnique({
    where: { id: user.investorId },
    include: {
      investments: {
        include: { container: true },
        orderBy: { createdAt: "desc" },
      },
      payouts: true,
    },
  });

  if (!investor) {
    redirect("/login");
  }

  const paidByContainer = new Map<string, number>();
  for (const payout of investor.payouts) {
    paidByContainer.set(payout.containerId, (paidByContainer.get(payout.containerId) ?? 0) + payout.amountUSD);
  }

  const investedTotal = investor.investments.reduce((sum, row) => sum + row.investedAmountUSD, 0);
  const profitTotal = investor.investments.reduce(
    (sum, row) => sum + computeInvestorProfit(row.container.netProfitUSD, row.percentageShare),
    0,
  );
  const paidTotal = investor.payouts.reduce((sum, row) => sum + row.amountUSD, 0);
  const remainingTotal = profitTotal - paidTotal;

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Кабинет инвестора</h2>
            <p className="mt-1 text-sm text-slate-600">Инвестор: {investor.name}</p>
          </div>
          <Link
            href="/api/investor/report"
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Скачать отчёт
          </Link>
        </div>
      </article>

      <div className="grid gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-xs text-slate-500">Всего вложено</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{formatUsd(investedTotal)}</p>
        </article>
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-xs text-slate-500">Всего прибыль</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{formatUsd(profitTotal)}</p>
        </article>
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-xs text-slate-500">Выплачено</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{formatUsd(paidTotal)}</p>
        </article>
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-xs text-slate-500">Остаток к выплате</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{formatUsd(remainingTotal)}</p>
        </article>
      </div>

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Контейнер</th>
              <th className="px-3 py-2 font-medium">Вложил</th>
              <th className="px-3 py-2 font-medium">% доли</th>
              <th className="px-3 py-2 font-medium">Прибыль</th>
              <th className="px-3 py-2 font-medium">Выплачено</th>
              <th className="px-3 py-2 font-medium">Остаток</th>
              <th className="px-3 py-2 font-medium">ROI %</th>
            </tr>
          </thead>
          <tbody>
            {investor.investments.map((row) => {
              const profit = computeInvestorProfit(row.container.netProfitUSD, row.percentageShare);
              const paid = paidByContainer.get(row.containerId) ?? 0;
              const remaining = profit - paid;
              const roi = row.investedAmountUSD > 0 ? (profit / row.investedAmountUSD) * 100 : 0;
              return (
                <tr key={row.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 text-slate-800">{row.container.name}</td>
                  <td className="px-3 py-2 text-slate-700">{formatUsd(row.investedAmountUSD)}</td>
                  <td className="px-3 py-2 text-slate-700">{row.percentageShare.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-slate-700">{formatUsd(profit)}</td>
                  <td className="px-3 py-2 text-slate-700">{formatUsd(paid)}</td>
                  <td className="px-3 py-2 text-slate-700">{formatUsd(remaining)}</td>
                  <td className="px-3 py-2 text-slate-700">{roi.toFixed(2)}%</td>
                </tr>
              );
            })}
            {!investor.investments.length ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                  У вас пока нет контейнеров.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </section>
  );
}
