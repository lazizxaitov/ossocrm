import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateInvestorModal } from "@/app/(main)/investors/create-investor-modal";
import { getRequiredSession } from "@/lib/auth";
import { formatUsd } from "@/lib/currency";
import { computeInvestorProfit } from "@/lib/investor";
import { prisma } from "@/lib/prisma";
import { INVESTORS_MANAGE_ROLES, INVESTORS_VIEW_ROLES } from "@/lib/rbac";

export default async function InvestorsPage() {
  const session = await getRequiredSession();
  if (!INVESTORS_VIEW_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const canManage = INVESTORS_MANAGE_ROLES.includes(session.role);

  const [investors, payouts] = await Promise.all([
    prisma.investor.findMany({
      include: {
        investments: { include: { container: { select: { netProfitUSD: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.investorPayout.groupBy({
      by: ["investorId"],
      _sum: { amountUSD: true },
    }),
  ]);

  const paidByInvestor = new Map(payouts.map((row) => [row.investorId, row._sum.amountUSD ?? 0]));

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">Инвесторы</h2>
        <p className="mt-1 text-sm text-slate-600">Управление долями, прибылью и выплатами по контейнерам.</p>
      </article>

      {canManage ? (
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Добавление инвестора</h3>
            <CreateInvestorModal />
          </div>
        </article>
      ) : null}

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Имя</th>
              <th className="px-3 py-2 font-medium">Всего вложено</th>
              <th className="px-3 py-2 font-medium">Всего прибыль</th>
              <th className="px-3 py-2 font-medium">Выплачено</th>
              <th className="px-3 py-2 font-medium">Остаток</th>
              <th className="px-3 py-2 font-medium">Детали</th>
            </tr>
          </thead>
          <tbody>
            {investors.map((investor) => {
              const invested = investor.investments.reduce((sum, row) => sum + row.investedAmountUSD, 0);
              const profit = investor.investments.reduce(
                (sum, row) => sum + computeInvestorProfit(row.container.netProfitUSD, row.percentageShare),
                0,
              );
              const paid = paidByInvestor.get(investor.id) ?? 0;
              const remaining = profit - paid;
              return (
                <tr key={investor.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 text-slate-800">{investor.name}</td>
                  <td className="px-3 py-2 text-slate-700">{formatUsd(invested)}</td>
                  <td className="px-3 py-2 text-slate-700">{formatUsd(profit)}</td>
                  <td className="px-3 py-2 text-slate-700">{formatUsd(paid)}</td>
                  <td className="px-3 py-2 text-slate-700">{formatUsd(remaining)}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/investors/${investor.id}`}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Открыть
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!investors.length ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                  Инвесторы пока не добавлены.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </section>
  );
}
