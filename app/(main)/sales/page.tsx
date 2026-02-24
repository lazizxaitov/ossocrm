import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateSaleModal } from "@/app/(main)/sales/create-sale-modal";
import { getRequiredSession } from "@/lib/auth";
import { formatUsd } from "@/lib/currency";
import { getCurrentFinancialPeriod } from "@/lib/financial-period";
import { prisma } from "@/lib/prisma";
import { SALES_MANAGE_ROLES, SALES_VIEW_ROLES } from "@/lib/rbac";
import { ruStatus } from "@/lib/ru-labels";

type SalesPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const session = await getRequiredSession();
  if (!SALES_VIEW_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const canManage = SALES_MANAGE_ROLES.includes(session.role);

  const [currentPeriod, sales, clients, stock] = await Promise.all([
    getCurrentFinancialPeriod(),
    prisma.sale.findMany({
      where: q
        ? {
            OR: [
              { invoiceNumber: { contains: q } },
              { id: { contains: q } },
              { client: { name: { contains: q } } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      include: { client: true },
      take: 100,
    }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.containerItem.findMany({
      where: { quantity: { gt: 0 }, container: { status: "ARRIVED" } },
      include: { product: { include: { category: { select: { name: true } } } }, container: true },
      orderBy: [{ container: { createdAt: "desc" } }, { createdAt: "desc" }],
    }),
  ]);

  const salesLocked = currentPeriod.status === "LOCKED";
  const canCreateSale = canManage && !salesLocked;

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Продажи</h2>
            <p className="mt-1 text-sm text-slate-600">Продажи, долги, оплаты, возвраты и счет.</p>
            {salesLocked ? (
              <p className="mt-2 text-sm font-medium text-rose-700">
                Месяц {String(currentPeriod.month).padStart(2, "0")}.{currentPeriod.year} закрыт. Новые продажи недоступны.
              </p>
            ) : null}
          </div>
          {canCreateSale ? (
            <div className="flex flex-wrap gap-2">
              <CreateSaleModal
                clients={clients}
                stock={stock.map((item) => ({
                  containerItemId: item.id,
                  productId: item.productId,
                  productName: item.product.name,
                  sku: item.product.sku,
                  containerName: item.container.name,
                  categoryName: item.product.category?.name ?? null,
                  imagePath: item.product.imagePath ?? null,
                  quantity: item.quantity,
                  costPerUnitUSD: item.costPerUnitUSD,
                  basePriceUSD: item.salePriceUSD ?? item.product.basePriceUSD,
                }))}
              />
              <CreateSaleModal
                triggerLabel="Продажа с тумбой"
                modalTitle="Новая продажа с тумбой"
                itemsModalTitle="Добавление тумб в продажу"
                itemSearchPlaceholder="Поиск по модели тумбы / SKU / контейнеру"
                enableDragDrop={false}
                vanityBuilder
                clients={clients}
                stock={stock.map((item) => ({
                  containerItemId: item.id,
                  productId: item.productId,
                  productName: item.product.name,
                  sku: item.product.sku,
                  containerName: item.container.name,
                  categoryName: item.product.category?.name ?? null,
                  imagePath: item.product.imagePath ?? null,
                  quantity: item.quantity,
                  costPerUnitUSD: item.costPerUnitUSD,
                  basePriceUSD: item.salePriceUSD ?? item.product.basePriceUSD,
                }))}
              />
            </div>
          ) : null}
        </div>
      </article>

      <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <form className="flex flex-col gap-2 sm:flex-row">
          <input
            name="q"
            defaultValue={q}
            placeholder="Поиск по номеру счета / ID / клиенту"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Найти
          </button>
        </form>
      </article>

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Счет</th>
              <th className="px-3 py-2 font-medium">Клиент</th>
              <th className="px-3 py-2 font-medium">Итого USD</th>
              <th className="px-3 py-2 font-medium">Оплачено</th>
              <th className="px-3 py-2 font-medium">Долг</th>
              <th className="px-3 py-2 font-medium">Статус</th>
              <th className="px-3 py-2 font-medium">Дата</th>
              <th className="px-3 py-2 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-medium text-slate-800">{sale.invoiceNumber}</td>
                <td className="px-3 py-2 text-slate-700">{sale.client.name}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(sale.totalAmountUSD)}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(sale.paidAmountUSD)}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(sale.debtAmountUSD)}</td>
                <td className="px-3 py-2 text-slate-700">{ruStatus(sale.status)}</td>
                <td className="px-3 py-2 text-slate-600">{new Date(sale.createdAt).toLocaleString("ru-RU")}</td>
                <td className="px-3 py-2">
                  <Link
                    href={`/sales/${sale.id}`}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Открыть
                  </Link>
                </td>
              </tr>
            ))}
            {!sales.length ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  Продажи не найдены.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </section>
  );
}
