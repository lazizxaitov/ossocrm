import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequiredSession } from "@/lib/auth";
import { formatUsd } from "@/lib/currency";
import { computeInvestorProfit } from "@/lib/investor";
import { prisma } from "@/lib/prisma";
import { INVESTORS_VIEW_ROLES } from "@/lib/rbac";

type InvestorDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function InvestorDetailPage({ params }: InvestorDetailPageProps) {
  const session = await getRequiredSession();
  if (!INVESTORS_VIEW_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const investor = await prisma.investor.findUnique({
    where: { id },
    include: {
      investments: {
        include: { container: true },
        orderBy: { createdAt: "desc" },
      },
      payouts: {
        include: { container: { select: { name: true } } },
        orderBy: { payoutDate: "desc" },
      },
    },
  });

  if (!investor) {
    notFound();
  }

  const paidByContainer = new Map<string, number>();
  for (const payout of investor.payouts) {
    paidByContainer.set(payout.containerId, (paidByContainer.get(payout.containerId) ?? 0) + payout.amountUSD);
  }

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{investor.name}</h2>
            <p className="mt-1 text-sm text-slate-600">Телефон: {investor.phone ?? "не указан"}</p>
          </div>
          <Link
            href="/investors"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            К списку
          </Link>
        </div>
      </article>

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
            </tr>
          </thead>
          <tbody>
            {investor.investments.map((row) => {
              const profit = computeInvestorProfit(row.container.netProfitUSD, row.percentageShare);
              const paid = paidByContainer.get(row.containerId) ?? 0;
              const remaining = profit - paid;
              return (
                <tr key={row.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 text-slate-800">{row.container.name}</td>
                  <td className="px-3 py-2 text-slate-700">{formatUsd(row.investedAmountUSD)}</td>
                  <td className="px-3 py-2 text-slate-700">{row.percentageShare.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-slate-700">{formatUsd(profit)}</td>
                  <td className="px-3 py-2 text-slate-700">{formatUsd(paid)}</td>
                  <td className="px-3 py-2 text-slate-700">{formatUsd(remaining)}</td>
                </tr>
              );
            })}
            {!investor.investments.length ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                  У инвестора пока нет привязанных контейнеров.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </section>
  );
}
