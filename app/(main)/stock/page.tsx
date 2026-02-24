import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AddStockOutsideContainerModal } from "@/app/(main)/stock/add-stock-outside-container-modal";
import { EditStockItemModal } from "@/app/(main)/stock/edit-stock-item-modal";
import { StockItemDetailsModal } from "@/app/(main)/stock/stock-item-details-modal";

type StockPageProps = {
  searchParams: Promise<{ q?: string; status?: string }>;
};

function containerStatusLabel(status: "IN_TRANSIT" | "ARRIVED" | "CLOSED") {
  if (status === "IN_TRANSIT") return "В пути";
  if (status === "ARRIVED") return "На складе";
  return "Закрыт";
}

export default async function StockPage({ searchParams }: StockPageProps) {
  const session = await getRequiredSession();
  if (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN") {
    redirect("/dashboard");
  }

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

  const [rows, stockRows, transitRows, arrivedContainersCount, inTransitContainersCount, products] = await Promise.all([
    prisma.containerItem.findMany({
      where: {
        quantity: { gt: 0 },
        ...searchWhere,
        ...statusWhere,
      },
      include: {
        product: { select: { name: true, sku: true, basePriceUSD: true } },
        container: { select: { name: true, status: true, purchaseDate: true, arrivalDate: true } },
      },
      orderBy: [{ container: { purchaseDate: "desc" } }, { product: { name: "asc" } }],
      take: 500,
    }),
    prisma.containerItem.findMany({
      where: {
        quantity: { gt: 0 },
        container: { status: "ARRIVED" },
      },
      select: { quantity: true },
      take: 500,
    }),
    prisma.containerItem.findMany({
      where: {
        quantity: { gt: 0 },
        container: { status: "IN_TRANSIT" },
      },
      select: { quantity: true },
      take: 500,
    }),
    prisma.container.count({ where: { status: "ARRIVED" } }),
    prisma.container.count({ where: { status: "IN_TRANSIT" } }),
    prisma.product.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        size: true,
        imagePath: true,
        costPriceUSD: true,
        basePriceUSD: true,
        category: { select: { name: true } },
      },
    }),
  ]);

  const totalStock = stockRows.reduce((sum, row) => sum + row.quantity, 0);
  const lowStock = stockRows.filter((row) => row.quantity < 20).length;
  const transitTotal = transitRows.reduce((sum, row) => sum + row.quantity, 0);
  const canManageStockItems = session.role === "SUPER_ADMIN";

  return (
    <section className="grid min-w-0 gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-[#c9d6ea] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-slate-500">Позиций на складе</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{stockRows.length}</p>
        </article>
        <article className="rounded-2xl border border-[#c9d6ea] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-slate-500">Общий остаток на складе</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalStock}</p>
        </article>
        <article className="rounded-2xl border border-[#c9d6ea] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-slate-500">Товаров в пути (шт.)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{transitTotal}</p>
        </article>
        <article className="rounded-2xl border border-[#c9d6ea] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-slate-500">Низкий остаток (&lt; 20)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{lowStock}</p>
        </article>
      </div>

      <article className="rounded-2xl border border-[#c9d6ea] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
        <p className="mb-3 text-sm font-medium text-slate-700">Быстрые действия</p>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/stock#warehouse-stock" className="rounded-xl border border-[var(--border)] px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">
            Перейти к остаткам
          </Link>
          <Link href="/inventory-sessions" className="rounded-xl bg-[var(--accent)] px-3 py-2 text-center text-sm font-medium text-white">
            Инвентаризации
          </Link>
          <Link href="/containers" className="rounded-xl border border-[var(--border)] px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">
            Контейнеры
          </Link>
          <Link href="/products" className="rounded-xl border border-[var(--border)] px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">
            Товары
          </Link>
          {session.role === "SUPER_ADMIN" ? (
            <AddStockOutsideContainerModal
              products={products.map((product) => ({
                id: product.id,
                name: product.name,
                sku: product.sku,
                size: product.size,
                imagePath: product.imagePath,
                costPriceUSD: product.costPriceUSD,
                basePriceUSD: product.basePriceUSD,
                categoryName: product.category?.name ?? "Без категории",
              }))}
            />
          ) : null}
        </div>
      </article>

      <article className="rounded-2xl border border-[#c9d6ea] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
        <h2 className="mb-2 text-base font-semibold text-slate-900">Сводка по контейнерам</h2>
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Прибывших контейнеров: {arrivedContainersCount}</div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Контейнеров в пути: {inTransitContainersCount}</div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Позиции в пути: {transitRows.length}</div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Позиции в таблице: {rows.length}</div>
        </div>
      </article>

      <article id="warehouse-stock" className="min-w-0 rounded-2xl border border-[#c9d6ea] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Список товаров склада</h2>
          <form className="flex min-w-0 w-full flex-wrap items-center gap-2 lg:w-auto">
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
          {rows.map((row) => {
            const saleUnit = row.salePriceUSD ?? row.product.basePriceUSD;
            const totalCost = row.costPerUnitUSD * row.quantity;
            const totalSale = saleUnit * row.quantity;
            const purchaseDateLabel = new Date(row.container.purchaseDate).toLocaleDateString("ru-RU");
            const arrivalDateLabel = row.container.arrivalDate
              ? new Date(row.container.arrivalDate).toLocaleDateString("ru-RU")
              : "—";
            const statusLabel = containerStatusLabel(row.container.status);
            return (
              <article key={row.id} className="rounded-xl border border-[var(--border)] bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{row.product.name}</p>
                    <p className="text-xs text-slate-500">Контейнер: {row.container.name}</p>
                  </div>
                  <span className="rounded-md bg-white px-2 py-1 text-xs text-slate-700">{statusLabel}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-700">
                  <p>Количество: {row.quantity}</p>
                  <p>Заказ: {purchaseDateLabel}</p>
                  <p>Приход: {arrivalDateLabel}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StockItemDetailsModal
                    productName={row.product.name}
                    sku={row.product.sku}
                    containerName={row.container.name}
                    statusLabel={statusLabel}
                    purchaseDateLabel={purchaseDateLabel}
                    arrivalDateLabel={arrivalDateLabel}
                    quantity={row.quantity}
                    costPerUnitUSD={row.costPerUnitUSD}
                    salePriceUSD={saleUnit}
                    totalCostUSD={totalCost}
                    totalSaleUSD={totalSale}
                  />
                  {canManageStockItems ? (
                    row.container.status === "IN_TRANSIT" ? (
                      <span className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-400">
                        В пути
                      </span>
                    ) : (
                      <EditStockItemModal
                        itemId={row.id}
                        productName={row.product.name}
                        sku={row.product.sku}
                        quantity={row.quantity}
                        salePriceUSD={row.salePriceUSD}
                      />
                    )
                  ) : null}
                </div>
              </article>
            );
          })}
          {!rows.length ? (
            <div className="rounded-xl border border-[var(--border)] bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
              По текущему фильтру товары не найдены.
            </div>
          ) : null}
        </div>

        <div className="hidden min-w-0 lg:block">
          <div className="w-full max-w-full overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-[var(--surface-soft)] text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Товар</th>
                <th className="px-3 py-2 font-medium">Контейнер</th>
                <th className="px-3 py-2 font-medium">Статус</th>
                <th className="px-3 py-2 font-medium">Количество</th>
                <th className="px-3 py-2 font-medium">Дата заказа</th>
                <th className="px-3 py-2 font-medium">Дата прихода</th>
                <th className="px-3 py-2 font-medium">Подробнее</th>
                {canManageStockItems ? <th className="px-3 py-2 font-medium">Изменить</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const saleUnit = row.salePriceUSD ?? row.product.basePriceUSD;
                const totalCost = row.costPerUnitUSD * row.quantity;
                const totalSale = saleUnit * row.quantity;
                const purchaseDateLabel = new Date(row.container.purchaseDate).toLocaleDateString("ru-RU");
                const arrivalDateLabel = row.container.arrivalDate
                  ? new Date(row.container.arrivalDate).toLocaleDateString("ru-RU")
                  : "—";
                const statusLabel = containerStatusLabel(row.container.status);
                return (
                  <tr key={row.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 text-slate-800">{row.product.name}</td>
                    <td className="px-3 py-2 text-slate-700">{row.container.name}</td>
                    <td className="px-3 py-2 text-slate-700">{statusLabel}</td>
                    <td className="px-3 py-2 text-slate-700">{row.quantity}</td>
                    <td className="px-3 py-2 text-slate-600">{purchaseDateLabel}</td>
                    <td className="px-3 py-2 text-slate-600">{arrivalDateLabel}</td>
                    <td className="px-3 py-2">
                      <StockItemDetailsModal
                        productName={row.product.name}
                        sku={row.product.sku}
                        containerName={row.container.name}
                        statusLabel={statusLabel}
                        purchaseDateLabel={purchaseDateLabel}
                        arrivalDateLabel={arrivalDateLabel}
                        quantity={row.quantity}
                        costPerUnitUSD={row.costPerUnitUSD}
                        salePriceUSD={saleUnit}
                        totalCostUSD={totalCost}
                        totalSaleUSD={totalSale}
                      />
                    </td>
                    {canManageStockItems ? (
                      <td className="px-3 py-2 text-slate-700">
                        {row.container.status === "IN_TRANSIT" ? (
                          <span className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-400">
                            В пути
                          </span>
                        ) : (
                          <EditStockItemModal
                            itemId={row.id}
                            productName={row.product.name}
                            sku={row.product.sku}
                            quantity={row.quantity}
                            salePriceUSD={row.salePriceUSD}
                          />
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={canManageStockItems ? 8 : 7}>
                    По текущему фильтру товары не найдены.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </div>
      </article>
    </section>
  );
}

