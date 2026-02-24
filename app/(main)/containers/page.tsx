import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateContainerModal } from "@/app/(main)/containers/create-container-modal";
import { ContainerRowActions } from "@/app/(main)/containers/row-actions";
import { getRequiredSession } from "@/lib/auth";
import { formatUsd } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { CONTAINERS_MANAGE_ROLES, CONTAINERS_VIEW_ROLES } from "@/lib/rbac";
import { ruStatus } from "@/lib/ru-labels";

export default async function ContainersPage() {
  const session = await getRequiredSession();
  if (!CONTAINERS_VIEW_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const canManage = CONTAINERS_MANAGE_ROLES.includes(session.role);
  const showFinance = session.role !== "WAREHOUSE";

  const [containers, latestCurrency, investors, products] = await Promise.all([
    prisma.container.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { items: true, investments: true } },
        investments: { select: { investedAmountUSD: true } },
        items: {
          select: {
            totalCbm: true,
            cbm: true,
            quantity: true,
            salePriceUSD: true,
            product: { select: { basePriceUSD: true } },
            saleItems: {
              select: {
                quantity: true,
                salePricePerUnitUSD: true,
                costPerUnitUSD: true,
                returnItems: { select: { quantity: true } },
              },
            },
          },
        },
      },
    }),
    prisma.currencySetting.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.investor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.product.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        size: true,
        imagePath: true,
        costPriceUSD: true,
        cbm: true,
        kg: true,
        basePriceUSD: true,
        category: { select: { name: true } },
      },
    }),
  ]);

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Контейнеры</h2>
            <p className="mt-1 text-sm text-slate-600">
              Текущий курс CNY → USD:{" "}
              <span className="font-semibold text-slate-800">
                {latestCurrency ? latestCurrency.cnyToUsdRate.toFixed(4) : "не задан"}
              </span>
            </p>
          </div>
          {canManage ? (
            <CreateContainerModal
              defaultRate={latestCurrency?.cnyToUsdRate ?? null}
              investors={investors}
              products={products.map((product) => ({
                id: product.id,
                name: product.name,
                sku: product.sku,
                size: product.size,
                imagePath: product.imagePath,
                costPriceUSD: product.costPriceUSD,
                cbm: product.cbm ?? 0,
                kg: product.kg ?? 0,
                basePriceUSD: product.basePriceUSD,
                categoryName: product.category?.name ?? "Без категории",
              }))}
            />
          ) : null}
        </div>
      </article>

      <article className="overflow-visible rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Название</th>
              <th className="px-3 py-2 font-medium">Статус</th>
              {showFinance ? <th className="px-3 py-2 font-medium">Закупка USD</th> : null}
              {showFinance ? <th className="px-3 py-2 font-medium">Расходы USD</th> : null}
              {showFinance ? <th className="px-3 py-2 font-medium">План</th> : null}
              {showFinance ? <th className="px-3 py-2 font-medium">Факт</th> : null}
              <th className="px-3 py-2 font-medium">Инвестиции</th>
              <th className="px-3 py-2 font-medium">Дата</th>
              <th className="px-3 py-2 font-medium">Товары</th>
              <th className="px-3 py-2 font-medium">TOTAL CBM</th>
              <th className="px-3 py-2 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {containers.map((container) => {
              const investedTotal = container.investments.reduce((sum, row) => sum + row.investedAmountUSD, 0);
              const plannedProfitUSD = container.items.reduce(
                (sum, item) => sum + (item.salePriceUSD ?? item.product.basePriceUSD) * item.quantity,
                0,
              );
              const realizedSalesProfitUSD = container.items.reduce((sum, item) => {
                const itemProfit = item.saleItems.reduce((inner, saleItem) => {
                  const returnedQty = saleItem.returnItems.reduce((retSum, ret) => retSum + ret.quantity, 0);
                  const effectiveQty = Math.max(0, saleItem.quantity - returnedQty);
                  return inner + effectiveQty * (saleItem.salePricePerUnitUSD - saleItem.costPerUnitUSD);
                }, 0);
                return sum + itemProfit;
              }, 0);
              const factualProfitUSD = container.status === "IN_TRANSIT" ? 0 : realizedSalesProfitUSD;
              const totalCbm = container.items.reduce((sum, item) => {
                if (item.totalCbm && item.totalCbm > 0) return sum + item.totalCbm;
                if (item.cbm && item.cbm > 0 && item.quantity > 0) return sum + item.cbm * item.quantity;
                return sum;
              }, 0);
              const expected = container.totalPurchaseUSD + container.totalExpensesUSD;
              const mismatch = Math.abs(investedTotal - expected) >= 0.01;

              return (
                <tr key={container.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium text-slate-800">{container.name}</td>
                  <td className="px-3 py-2 text-slate-700">{ruStatus(container.status)}</td>
                  {showFinance ? <td className="px-3 py-2 text-slate-700">{formatUsd(container.totalPurchaseUSD)}</td> : null}
                  {showFinance ? <td className="px-3 py-2 text-slate-700">{formatUsd(container.totalExpensesUSD)}</td> : null}
                  {showFinance ? <td className="px-3 py-2 text-slate-700">{formatUsd(plannedProfitUSD)}</td> : null}
                  {showFinance ? <td className="px-3 py-2 text-slate-700">{formatUsd(factualProfitUSD)}</td> : null}
                  <td className="px-3 py-2 text-slate-700">
                    {showFinance ? formatUsd(investedTotal) : `${container._count.investments} инвест.`}
                    {mismatch && showFinance ? (
                      <p className="text-xs font-medium text-orange-700">Разница: {formatUsd(investedTotal - expected)}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{new Date(container.purchaseDate).toLocaleDateString("ru-RU")}</td>
                  <td className="px-3 py-2 text-slate-700">{container._count.items}</td>
                  <td className="px-3 py-2 text-slate-700">{totalCbm > 0 ? totalCbm.toFixed(4) : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
                      <Link
                        href={`/containers/${container.id}`}
                        className="w-fit rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Открыть
                      </Link>
                      {canManage ? (
                        <ContainerRowActions
                          containerId={container.id}
                          containerName={container.name}
                          status={container.status}
                          canDelete={session.role === "SUPER_ADMIN"}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!containers.length ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={showFinance ? 11 : 7}>
                  Контейнеры пока не созданы.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </section>
  );
}
