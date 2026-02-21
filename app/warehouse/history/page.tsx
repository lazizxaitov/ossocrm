import Link from "next/link";
import { getRequiredSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function inventoryStatusLabel(status: "PENDING" | "CONFIRMED" | "DISCREPANCY") {
  if (status === "PENDING") return "Ожидает подтверждения";
  if (status === "CONFIRMED") return "Подтверждена";
  return "Есть расхождения";
}

export default async function WarehouseHistoryPage() {
  const session = await getRequiredSession();

  const sessions = await prisma.inventorySession.findMany({
    where: session.role === "WAREHOUSE" ? { createdById: session.userId } : undefined,
    include: {
      createdBy: { select: { name: true } },
      confirmedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">История инвентаризаций</h2>
            <p className="mt-1 text-sm text-slate-600">Список созданных сессий и их статусов.</p>
          </div>
          <Link
            href="/warehouse"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Назад в склад
          </Link>
        </div>
      </article>

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Дата</th>
              <th className="px-3 py-2 font-medium">Код</th>
              <th className="px-3 py-2 font-medium">Статус</th>
              <th className="px-3 py-2 font-medium">Расхождения</th>
              <th className="px-3 py-2 font-medium">Создал</th>
              <th className="px-3 py-2 font-medium">Подтвердил</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((row) => (
              <tr key={row.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 text-slate-700">{new Date(row.createdAt).toLocaleString("ru-RU")}</td>
                <td className="px-3 py-2 font-semibold text-slate-800">
                  {row.status === "CONFIRMED" ? row.code : "Скрыт"}
                </td>
                <td className="px-3 py-2 text-slate-700">{inventoryStatusLabel(row.status)}</td>
                <td className="px-3 py-2 text-slate-700">{row.discrepancyCount}</td>
                <td className="px-3 py-2 text-slate-700">{row.createdBy.name}</td>
                <td className="px-3 py-2 text-slate-700">{row.confirmedBy ? row.confirmedBy.name : "—"}</td>
              </tr>
            ))}
            {!sessions.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                  История пока пустая.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </section>
  );
}
