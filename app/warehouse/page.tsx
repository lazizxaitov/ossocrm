import Link from "next/link";
import { prisma } from "@/lib/prisma";

function containerStatusLabel(status: "IN_TRANSIT" | "ARRIVED" | "CLOSED") {
  if (status === "IN_TRANSIT") return "В пути";
  if (status === "ARRIVED") return "На складе";
  return "Закрыт";
}

type WarehousePageProps = {
  searchParams: Promise<{ q?: string; status?: string }>;
};

export default async function WarehousePage({ searchParams }: WarehousePageProps) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const statusFilter = ["ALL", "ARRIVED", "IN_TRANSIT"].includes((params.status ?? "").toUpperCase())
    ? (params.status ?? "ALL").toUpperCase()
    : "ALL";

  const searchWhere = q
    ? {
        OR: [
          { product: { name: { contains: q } } },
          { product: { sku: { contains: q } } },
          { container: { name: { contains: q } } },
        ],
      }
    : {};

  const statusWhere =
    statusFilter === "ARRIVED"
      ? { container: { status: "ARRIVED" as const } }
      : statusFilter === "IN_TRANSIT"
        ? { container: { status: "IN_TRANSIT" as const } }
        : {};

  const [rows, arrivedContainersCount, inTransitContainersCount] = await Promise.all([
    prisma.containerItem.findMany({
      where: {
        quantity: { gt: 0 },
        ...searchWhere,
        ...statusWhere,
      },
      include: {
        product: { select: { name: true, sku: true } },
        container: { select: { name: true, status: true, purchaseDate: true, arrivalDate: true } },
      },
      orderBy: [{ container: { purchaseDate: "desc" } }, { product: { name: "asc" } }],
      take: 500,
    }),
    prisma.container.count({ where: { status: "ARRIVED" } }),
    prisma.container.count({ where: { status: "IN_TRANSIT" } }),
  ]);

  return (
    <section className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-[#c9d6ea] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-slate-500">Позиции в списке</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{rows.length}</p>
        </article>
        <article className="rounded-2xl border border-[#c9d6ea] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-slate-500">Контейнеров на складе</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{arrivedContainersCount}</p>
        </article>
        <article className="rounded-2xl border border-[#c9d6ea] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-slate-500">Контейнеров в пути</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{inTransitContainersCount}</p>
        </article>
      </div>

      <article className="rounded-2xl border border-[#c9d6ea] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
        <p className="mb-3 text-sm font-medium text-slate-700">Быстрые действия</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Link href="/warehouse/inventory" className="rounded-xl bg-[var(--accent)] px-3 py-2 text-center text-sm font-medium text-white">
            Инвентаризация
          </Link>
          <Link href="/warehouse/containers" className="rounded-xl border border-[var(--border)] px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">
            Контейнеры
          </Link>
          <Link href="/warehouse/history" className="rounded-xl border border-[var(--border)] px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">
            История инвентаризаций
          </Link>
        </div>
      </article>

      <article id="warehouse-stock" className="rounded-2xl border border-[#c9d6ea] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Список товаров склада</h2>
          <form className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
            <input
              name="q"
              defaultValue={q}
              placeholder="Поиск по товару, SKU, контейнеру"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm sm:w-64"
            />
            <select
              name="status"
              defaultValue={statusFilter}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700 sm:w-auto"
            >
              <option value="ALL">Все статусы</option>
              <option value="ARRIVED">Только на складе</option>
              <option value="IN_TRANSIT">Только в пути</option>
            </select>
            <button
              type="submit"
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Применить
            </button>
          </form>
        </div>

        <div className="grid gap-3 lg:hidden">
          {rows.map((row) => (
            <article key={row.id} className="rounded-xl border border-[var(--border)] bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{row.product.name}</p>
                  <p className="text-xs text-slate-500">SKU: {row.product.sku}</p>
                </div>
                <span className="rounded-md bg-white px-2 py-1 text-xs text-slate-700">{containerStatusLabel(row.container.status)}</span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-700">
                <p>Контейнер: {row.container.name}</p>
                <p>Заказ: {new Date(row.container.purchaseDate).toLocaleDateString("ru-RU")}</p>
                <p>Приход: {row.container.arrivalDate ? new Date(row.container.arrivalDate).toLocaleDateString("ru-RU") : "—"}</p>
              </div>
            </article>
          ))}
          {!rows.length ? (
            <div className="rounded-xl border border-[var(--border)] bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
              По текущему фильтру товары не найдены.
            </div>
          ) : null}
        </div>

        <div className="hidden lg:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--surface-soft)] text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Товар</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Контейнер</th>
                <th className="px-3 py-2 font-medium">Статус</th>
                <th className="px-3 py-2 font-medium">Дата заказа</th>
                <th className="px-3 py-2 font-medium">Дата прихода</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 text-slate-800">{row.product.name}</td>
                  <td className="px-3 py-2 text-slate-700">{row.product.sku}</td>
                  <td className="px-3 py-2 text-slate-700">{row.container.name}</td>
                  <td className="px-3 py-2 text-slate-700">{containerStatusLabel(row.container.status)}</td>
                  <td className="px-3 py-2 text-slate-600">{new Date(row.container.purchaseDate).toLocaleDateString("ru-RU")}</td>
                  <td className="px-3 py-2 text-slate-600">{row.container.arrivalDate ? new Date(row.container.arrivalDate).toLocaleDateString("ru-RU") : "—"}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                    По текущему фильтру товары не найдены.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

