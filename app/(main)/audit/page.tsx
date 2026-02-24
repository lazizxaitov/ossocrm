import { redirect } from "next/navigation";
import { getRequiredSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AUDIT_VIEW_ROLES } from "@/lib/rbac";
import { ruAuditAction } from "@/lib/ru-labels";

const ENTITY_LABELS: Record<string, string> = {
  FinancialPeriod: "Финансовый период",
  ContainerExpense: "Расход контейнера",
  OperatingExpense: "Операционный расход",
  ExpenseCorrection: "Корректировка расхода",
  Return: "Возврат",
  Sale: "Продажа",
};

function ruEntityType(value: string) {
  return ENTITY_LABELS[value] ?? value;
}

export default async function AuditPage() {
  const session = await getRequiredSession();
  if (!AUDIT_VIEW_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const logs = await prisma.auditLog.findMany({
    include: { createdBy: { select: { name: true, login: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">Журнал действий</h2>
        <p className="mt-1 text-sm text-slate-600">Прозрачность изменений по системе.</p>
      </article>

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Пользователь</th>
              <th className="px-3 py-2 font-medium">Действие</th>
              <th className="px-3 py-2 font-medium">Дата</th>
              <th className="px-3 py-2 font-medium">Объект</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 text-slate-700">
                  {log.createdBy.name} ({log.createdBy.login})
                </td>
                <td className="px-3 py-2 text-slate-700">{ruAuditAction(log.action)}</td>
                <td className="px-3 py-2 text-slate-600">{new Date(log.createdAt).toLocaleString("ru-RU")}</td>
                <td className="px-3 py-2 text-slate-600">
                  {ruEntityType(log.entityType)} / {log.entityId}
                </td>
              </tr>
            ))}
            {!logs.length ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={4}>
                  Записей пока нет.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </section>
  );
}
