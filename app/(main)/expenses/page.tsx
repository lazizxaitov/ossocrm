import { redirect } from "next/navigation";
import { CreateOperatingExpenseModal } from "@/app/(main)/expenses/create-operating-expense-modal";
import { getRequiredSession } from "@/lib/auth";
import { formatUsd } from "@/lib/currency";
import { sortInvestorsOssFirst } from "@/lib/investor";
import { prisma } from "@/lib/prisma";
import { EXPENSES_ADD_ROLES, EXPENSES_VIEW_ROLES } from "@/lib/rbac";

type ExpensesPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const session = await getRequiredSession();
  if (!EXPENSES_VIEW_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const canAdd = EXPENSES_ADD_ROLES.includes(session.role);

  const [investorsRaw, rows] = await Promise.all([
    prisma.investor.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.operatingExpense.findMany({
      include: {
        investor: { select: { name: true } },
        createdBy: { select: { name: true, login: true } },
      },
      orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
      take: 300,
    }),
  ]);

  const investors = sortInvestorsOssFirst(investorsRaw);

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Расходы</h2>
            <p className="mt-1 text-sm text-slate-600">История операционных расходов: электричество, газ, зарплаты и другие.</p>
          </div>
          {canAdd ? <CreateOperatingExpenseModal investors={investors} /> : null}
        </div>
      </article>

      {params.error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{params.error}</p>
      ) : null}
      {params.success ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{params.success}</p>
      ) : null}

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Дата и время</th>
              <th className="px-3 py-2 font-medium">Название</th>
              <th className="px-3 py-2 font-medium">Сумма</th>
              <th className="px-3 py-2 font-medium">Инвестор</th>
              <th className="px-3 py-2 font-medium">Добавил</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 text-slate-700">{new Date(row.spentAt).toLocaleString("ru-RU")}</td>
                <td className="px-3 py-2 text-slate-800">{row.title}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(row.amountUSD)}</td>
                <td className="px-3 py-2 text-slate-700">{row.investor.name}</td>
                <td className="px-3 py-2 text-slate-600">{row.createdBy.name} ({row.createdBy.login})</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
                  Расходы пока не добавлены.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </section>
  );
}
