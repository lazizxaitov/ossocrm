import Link from "next/link";
import { prisma } from "@/lib/prisma";

function containerStatusLabel(status: "IN_TRANSIT" | "ARRIVED" | "CLOSED") {
  if (status === "IN_TRANSIT") return "В пути";
  if (status === "ARRIVED") return "Прибыл";
  return "Закрыт";
}

export default async function WarehouseContainersPage() {
  const containers = await prisma.container.findMany({
    include: {
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Контейнеры</h2>
            <p className="mt-1 text-sm text-slate-600">Просмотр контейнеров без финансовых данных.</p>
          </div>
          <Link
            href="/warehouse"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Назад в склад
          </Link>
        </div>
      </article>

      <div className="space-y-3">
        {containers.map((container) => (
          <article key={container.id} className="rounded-2xl border border-[var(--border)] bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-900">{container.name}</p>
                <p className="text-xs text-slate-500">
                  Дата закупки: {new Date(container.purchaseDate).toLocaleDateString("ru-RU")}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {containerStatusLabel(container.status)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Позиций: {container._count.items}</div>
            </div>
          </article>
        ))}
        {!containers.length ? (
          <article className="rounded-2xl border border-[var(--border)] bg-white p-4 text-sm text-slate-500">
            Контейнеры пока не добавлены.
          </article>
        ) : null}
      </div>
    </section>
  );
}
