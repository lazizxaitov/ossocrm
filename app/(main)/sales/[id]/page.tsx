import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addPaymentAction } from "@/app/(main)/sales/actions";
import { DeleteSaleButton } from "@/app/(main)/sales/delete-sale-button";
import { ExchangeModal } from "@/app/(main)/sales/exchange-modal";
import { ReturnModal } from "@/app/(main)/sales/return-modal";
import { CustomDateInput } from "@/components/custom-date-input";
import { getRequiredSession } from "@/lib/auth";
import { formatUsd } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { SALES_MANAGE_ROLES, SALES_VIEW_ROLES } from "@/lib/rbac";
import { ruStatus } from "@/lib/ru-labels";

type SaleDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function SaleDetailPage({ params, searchParams }: SaleDetailPageProps) {
  const session = await getRequiredSession();
  if (!SALES_VIEW_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const query = await searchParams;
  const error = (query.error ?? "").trim();
  const success = (query.success ?? "").trim();
  const canManage = SALES_MANAGE_ROLES.includes(session.role);

  const [sale, stock] = await Promise.all([
    prisma.sale.findUnique({
      where: { id },
      include: {
        client: true,
        createdBy: { select: { name: true, login: true } },
        items: {
          include: {
            product: true,
            containerItem: { include: { container: true } },
            returnItems: true,
          },
        },
        payments: {
          include: { createdBy: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
        returns: {
          include: {
            createdBy: { select: { name: true } },
            items: { include: { saleItem: { include: { product: true } } } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.containerItem.findMany({
      where: { quantity: { gt: 0 }, container: { status: "ARRIVED" } },
      include: { product: true, container: true },
      orderBy: [{ container: { createdAt: "desc" } }, { createdAt: "desc" }],
      take: 200,
    }),
  ]);

  if (!sale) {
    notFound();
  }

  const returnIds = sale.returns.map((ret) => ret.id);
  const exchangeReturnIds = new Set<string>();
  if (returnIds.length > 0) {
    const returnLogs = await prisma.auditLog.findMany({
      where: {
        action: "CREATE_RETURN",
        entityType: "Return",
        entityId: { in: returnIds },
      },
      select: { entityId: true, metadata: true },
    });
    for (const log of returnLogs) {
      try {
        const meta = log.metadata ? (JSON.parse(log.metadata) as { mode?: string }) : null;
        if (meta?.mode === "exchange") {
          exchangeReturnIds.add(log.entityId);
        }
      } catch {
        // ignore broken metadata
      }
    }
  }

  const returnableItems = sale.items.map((item) => {
    const returned = item.returnItems.reduce((sum, row) => sum + row.quantity, 0);
    const maxReturnQty = Math.max(0, item.quantity - returned);
    return {
      saleItemId: item.id,
      title: `${item.product.name} (${item.product.sku})`,
      soldQty: item.quantity,
      maxReturnQty,
      salePricePerUnitUSD: item.salePricePerUnitUSD,
    };
  });

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{sale.invoiceNumber}</h2>
            <p className="mt-1 text-sm text-slate-600">
              Клиент: {sale.client.name} | Статус: {ruStatus(sale.status)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <>
                <ReturnModal saleId={sale.id} items={returnableItems.filter((item) => item.maxReturnQty > 0)} />
                <ExchangeModal
                  saleId={sale.id}
                  returnItems={returnableItems.filter((item) => item.maxReturnQty > 0)}
                  stock={stock.map((item) => ({
                    containerItemId: item.id,
                    title: `${item.product.name} (${item.product.sku})`,
                    containerName: item.container.name,
                    availableQty: item.quantity,
                    defaultSalePriceUSD: item.salePriceUSD ?? item.product.basePriceUSD,
                  }))}
                />
              </>
            ) : null}
            {session.role === "SUPER_ADMIN" ? <DeleteSaleButton saleId={sale.id} invoiceNumber={sale.invoiceNumber} /> : null}
            <Link
              href={`/api/sales/${sale.id}/invoice`}
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Скачать PDF
            </Link>
            <Link
              href="/sales"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              К списку
            </Link>
          </div>
        </div>
      </article>

      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-xs text-slate-500">Итого</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{formatUsd(sale.totalAmountUSD)}</p>
        </article>
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-xs text-slate-500">Оплачено</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{formatUsd(sale.paidAmountUSD)}</p>
        </article>
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-xs text-slate-500">Долг</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{formatUsd(sale.debtAmountUSD)}</p>
        </article>
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-xs text-slate-500">Создал</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">
            {sale.createdBy.name} ({sale.createdBy.login})
          </p>
        </article>
      </div>

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Товар</th>
              <th className="px-3 py-2 font-medium">Контейнер</th>
              <th className="px-3 py-2 font-medium">Кол-во</th>
              <th className="px-3 py-2 font-medium">Себестоимость / ед.</th>
              <th className="px-3 py-2 font-medium">Цена / ед.</th>
              <th className="px-3 py-2 font-medium">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 text-slate-800">
                  {item.product.name} ({item.product.sku})
                </td>
                <td className="px-3 py-2 text-slate-700">{item.containerItem.container.name}</td>
                <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                <td className="px-3 py-2 text-slate-700">${item.costPerUnitUSD.toFixed(4)}</td>
                <td className="px-3 py-2 text-slate-700">${item.salePricePerUnitUSD.toFixed(2)}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(item.totalUSD)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      {canManage ? (
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <h3 className="mb-3 text-base font-semibold text-slate-900">Добавить оплату</h3>
          <form action={addPaymentAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="saleId" value={sale.id} />
            <input
              name="amountUSD"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Сумма USD"
              className="rounded border border-[var(--border)] px-2 py-2 text-sm"
              required
            />
            <CustomDateInput name="paymentDate" placeholder="Дата оплаты" className="min-w-[170px]" />
            <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90">
              Провести оплату
            </button>
          </form>
        </article>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <h3 className="mb-3 text-base font-semibold text-slate-900">Платежи</h3>
          <div className="space-y-2">
            {sale.payments.map((payment) => (
              <div key={payment.id} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                <p className="font-medium text-slate-800">{formatUsd(payment.amountUSD)}</p>
                <p className="text-xs text-slate-500">
                  {new Date(payment.paymentDate).toLocaleDateString("ru-RU")} | {payment.createdBy.name}
                </p>
              </div>
            ))}
            {!sale.payments.length ? <p className="text-sm text-slate-500">Платежей пока нет.</p> : null}
          </div>
        </article>

        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <h3 className="mb-3 text-base font-semibold text-slate-900">Возвраты</h3>
          <div className="space-y-2">
            {sale.returns.map((ret) => (
              <div key={ret.id} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                <p className="font-medium text-slate-800">
                  {ret.returnNumber} - {formatUsd(ret.totalReturnUSD)}
                  {exchangeReturnIds.has(ret.id) ? (
                    <span className="ml-2 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                      Замена
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(ret.createdAt).toLocaleDateString("ru-RU")} | {ret.createdBy.name}
                </p>
              </div>
            ))}
            {!sale.returns.length ? <p className="text-sm text-slate-500">Возвратов пока нет.</p> : null}
          </div>
        </article>
      </div>
    </section>
  );
}
