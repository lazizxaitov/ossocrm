import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AddItemModal } from "@/app/(main)/containers/add-item-modal";
import { CustomDateInput } from "@/components/custom-date-input";
import { CustomSelect } from "@/components/custom-select";
import { updateContainerStatusAction } from "@/app/(main)/containers/actions";
import {
  addContainerInvestmentAction,
  createInvestorPayoutAction,
} from "@/app/(main)/investors/actions";
import {
  confirmExpenseCorrectionAction,
  createContainerExpenseAction,
  createExpenseCorrectionAction,
} from "@/app/(main)/containers/expense-actions";
import { getRequiredSession } from "@/lib/auth";
import { formatUsd } from "@/lib/currency";
import { computeInvestorProfit, sortInvestorsOssFirst } from "@/lib/investor";
import { prisma } from "@/lib/prisma";
import { ruStatus } from "@/lib/ru-labels";
import {
  CONTAINERS_MANAGE_ROLES,
  CONTAINERS_VIEW_ROLES,
  EXPENSES_ADD_ROLES,
  EXPENSES_CORRECTION_ROLES,
  EXPENSES_VIEW_ROLES,
  INVESTORS_MANAGE_ROLES,
} from "@/lib/rbac";

type ContainerDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function ContainerDetailPage({ params, searchParams }: ContainerDetailPageProps) {
  const session = await getRequiredSession();
  if (!CONTAINERS_VIEW_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const query = await searchParams;
  const error = (query.error ?? "").trim();
  const success = (query.success ?? "").trim();
  const canManage = CONTAINERS_MANAGE_ROLES.includes(session.role);
  const canManageInvestors = INVESTORS_MANAGE_ROLES.includes(session.role);
  const canAddExpense = EXPENSES_ADD_ROLES.includes(session.role);
  const canCorrectExpense = EXPENSES_CORRECTION_ROLES.includes(session.role);
  const canViewExpenses = EXPENSES_VIEW_ROLES.includes(session.role);
  const showFinance = session.role !== "WAREHOUSE";

  const [container, products, investors, payouts] = await Promise.all([
    prisma.container.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
            saleItems: {
              select: {
                quantity: true,
                salePricePerUnitUSD: true,
                costPerUnitUSD: true,
                returnItems: { select: { quantity: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        investments: {
          include: { investor: true },
          orderBy: { createdAt: "asc" },
        },
        expenses: {
          include: {
            corrections: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.product.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, size: true, basePriceUSD: true },
    }),
    prisma.investor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.investorPayout.findMany({
      where: { containerId: id },
      select: { investorId: true, amountUSD: true },
    }),
  ]);

  if (!container) {
    notFound();
  }
  const investorsSorted = sortInvestorsOssFirst(investors);
  const containerInvestmentsSorted = [...container.investments].sort((a, b) => {
    const aIsOsso = a.investor.name.trim().toLowerCase() === "osso company";
    const bIsOsso = b.investor.name.trim().toLowerCase() === "osso company";
    if (aIsOsso && !bIsOsso) return -1;
    if (!aIsOsso && bIsOsso) return 1;
    return a.investor.name.localeCompare(b.investor.name, "ru");
  });

  const totalQuantity = container.items.reduce((sum, item) => sum + item.quantity, 0);
  const plannedProfitUSD = container.items.reduce(
    (sum, item) => sum + (item.salePriceUSD ?? item.product.basePriceUSD) * item.quantity,
    0,
  );
  const realizedSalesProfitUSD = container.items.reduce((sum, item) => {
    const rowProfit = item.saleItems.reduce((inner, saleItem) => {
      const returnedQty = saleItem.returnItems.reduce((retSum, ret) => retSum + ret.quantity, 0);
      const effectiveQty = Math.max(0, saleItem.quantity - returnedQty);
      return inner + effectiveQty * (saleItem.salePricePerUnitUSD - saleItem.costPerUnitUSD);
    }, 0);
    return sum + rowProfit;
  }, 0);
  const factualProfitUSD = container.status === "IN_TRANSIT" ? 0 : realizedSalesProfitUSD;
  const investedTotal = container.investments.reduce((sum, row) => sum + row.investedAmountUSD, 0);
  const expected = container.totalPurchaseUSD + container.totalExpensesUSD;
  const mismatch = Math.abs(investedTotal - expected) >= 0.01;

  const paidByInvestor = new Map<string, number>();
  for (const payout of payouts) {
    paidByInvestor.set(payout.investorId, (paidByInvestor.get(payout.investorId) ?? 0) + payout.amountUSD);
  }

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{container.name}</h2>
            <p className="mt-1 text-sm text-slate-600">
              Статус: <span className="font-medium text-slate-800">{ruStatus(container.status)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/api/containers/${container.id}/export`}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Экспорт в Excel
            </Link>
            {canManage ? (
              <AddItemModal
                containerId={container.id}
                products={products}
                totalPurchaseUSD={container.totalPurchaseUSD}
                totalExpensesUSD={container.totalExpensesUSD}
                currentQuantity={totalQuantity}
              />
            ) : null}
            <Link
              href="/containers"
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

      <div className="grid gap-4 md:grid-cols-6">
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-xs text-slate-500">Закупка CNY</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{container.totalPurchaseCNY.toFixed(2)}</p>
        </article>
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-xs text-slate-500">Курс CNY → USD</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{container.exchangeRate.toFixed(4)}</p>
        </article>
        {showFinance ? (
          <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
            <p className="text-xs text-slate-500">Закупка USD</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">{formatUsd(container.totalPurchaseUSD)}</p>
          </article>
        ) : null}
        {showFinance ? (
          <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
            <p className="text-xs text-slate-500">Расходы USD</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">{formatUsd(container.totalExpensesUSD)}</p>
          </article>
        ) : null}
        {showFinance ? (
          <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
            <p className="text-xs text-slate-500">Планируемая прибыль (сумма продаж)</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">{formatUsd(plannedProfitUSD)}</p>
          </article>
        ) : null}
        {showFinance ? (
          <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
            <p className="text-xs text-slate-500">Реальная прибыль (в продажах)</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">{formatUsd(factualProfitUSD)}</p>
          </article>
        ) : null}
      </div>

      {canManage ? (
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <h3 className="mb-2 text-base font-semibold text-slate-900">Изменить статус контейнера</h3>
          <form action={updateContainerStatusAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="containerId" value={container.id} />
            <CustomSelect name="status" defaultValue={container.status} className="min-w-[160px]" options={[{ value: "IN_TRANSIT", label: "В пути" }, { value: "ARRIVED", label: "Прибыл" }, { value: "CLOSED", label: "Закрыт" }]} />
            <CustomDateInput name="arrivalDate" placeholder="Дата прибытия" className="min-w-[170px]" />
            <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90">
              Сохранить
            </button>
          </form>
        </article>
      ) : null}

      {showFinance ? (
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Инвесторы контейнера</h3>
              <p className="text-sm text-slate-600">
                Вложено: {formatUsd(investedTotal)} | Ожидаемо: {formatUsd(expected)}
              </p>
              <p className="text-sm text-slate-600">
                План по контейнеру: {formatUsd(plannedProfitUSD)} | Факт продаж: {formatUsd(factualProfitUSD)}
              </p>
              <p className="text-sm text-slate-600">
                Чистая прибыль (с учётом расходов): {formatUsd(container.netProfitUSD)}
              </p>
              <p className="text-xs text-slate-500">
                Выплаты инвесторам доступны после прибытия контейнера и только из реальной прибыли в продажах.
              </p>
              {mismatch ? <p className="text-sm font-medium text-orange-700">Есть расхождение сумм инвестиций.</p> : null}
            </div>
          </div>

          {canManageInvestors ? (
            <div className="mb-3 grid gap-2 rounded-xl border border-[var(--border)] p-3 md:grid-cols-5">
              <form action={addContainerInvestmentAction} className="contents">
                <input type="hidden" name="containerId" value={container.id} />
                <CustomSelect name="investorId" required className="md:col-span-2" placeholder="Выберите инвестора" options={investorsSorted.map((investor) => ({ value: investor.id, label: investor.name }))} />
                <input
                  name="investedAmountUSD"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="Сумма вложения USD"
                  className="rounded border border-[var(--border)] px-2 py-2 text-sm md:col-span-2"
                />
                <button type="submit" className="rounded bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90">
                  Добавить инвестицию
                </button>
              </form>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--surface-soft)] text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Инвестор</th>
                  <th className="px-3 py-2 font-medium">Вложил</th>
                  <th className="px-3 py-2 font-medium">%</th>
                  <th className="px-3 py-2 font-medium">План прибыль</th>
                  <th className="px-3 py-2 font-medium">Факт прибыль</th>
                  <th className="px-3 py-2 font-medium">Выплачено</th>
                  <th className="px-3 py-2 font-medium">Остаток к выплате</th>
                </tr>
              </thead>
              <tbody>
                {containerInvestmentsSorted.map((row) => {
                  const plannedProfit = computeInvestorProfit(plannedProfitUSD, row.percentageShare);
                  const actualProfit = computeInvestorProfit(factualProfitUSD, row.percentageShare);
                  const paid = paidByInvestor.get(row.investorId) ?? 0;
                  const shareAmountUSD = actualProfit;
                  const remaining = Math.max(0, shareAmountUSD - paid);
                  return (
                    <tr key={row.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 text-slate-800">{row.investor.name}</td>
                      <td className="px-3 py-2 text-slate-700">{formatUsd(row.investedAmountUSD)}</td>
                      <td className="px-3 py-2 text-slate-700">{row.percentageShare.toFixed(2)}%</td>
                      <td className="px-3 py-2 text-slate-700">{formatUsd(plannedProfit)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatUsd(actualProfit)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatUsd(paid)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatUsd(remaining)}</td>
                    </tr>
                  );
                })}
                {!container.investments.length ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-slate-500" colSpan={7}>
                      Инвесторы не добавлены.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {canManageInvestors ? (
            <div className="mt-3 rounded-xl border border-[var(--border)] p-3">
              <h4 className="mb-2 text-sm font-semibold text-slate-900">Создать выплату инвестору</h4>
              <form action={createInvestorPayoutAction} className="grid gap-2 md:grid-cols-5">
                <input type="hidden" name="containerId" value={container.id} />
                <CustomSelect name="investorId" required className="md:col-span-2" placeholder="Инвестор" options={containerInvestmentsSorted.map((row) => ({ value: row.investorId, label: row.investor.name }))} />
                <input
                  name="amountUSD"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="Сумма выплаты USD"
                  className="rounded border border-[var(--border)] px-2 py-2 text-sm md:col-span-2"
                />
                <CustomDateInput name="payoutDate" placeholder="Дата выплаты" className="min-w-[170px]" />
                <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90 md:col-span-5">
                  Провести выплату
                </button>
              </form>
            </div>
          ) : null}
        </article>
      ) : null}

      {showFinance && canViewExpenses ? (
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-slate-900">Расходы контейнера</h3>
            {container.status === "CLOSED" ? (
              <p className="text-xs font-medium text-orange-700">
                Контейнер закрыт: добавление расходов и корректировок недоступно.
              </p>
            ) : null}
          </div>

          {canAddExpense && container.status !== "CLOSED" ? (
            <form action={createContainerExpenseAction} className="mb-3 grid gap-2 rounded-xl border border-[var(--border)] p-3 md:grid-cols-6">
              <input type="hidden" name="containerId" value={container.id} />
              <input
                name="title"
                required
                placeholder="Название расхода"
                className="rounded border border-[var(--border)] px-2 py-2 text-sm md:col-span-2"
              />
              <CustomSelect name="category" defaultValue="LOGISTICS" options={[{ value: "LOGISTICS", label: "Логистика" }, { value: "CUSTOMS", label: "Таможня" }, { value: "STORAGE", label: "Хранение" }, { value: "TRANSPORT", label: "Транспорт" }, { value: "OTHER", label: "Другое" }]} />
              <input
                name="amountUSD"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="Сумма USD"
                className="rounded border border-[var(--border)] px-2 py-2 text-sm"
              />
              <input
                name="description"
                placeholder="Описание"
                className="rounded border border-[var(--border)] px-2 py-2 text-sm md:col-span-2"
              />
              <button
                type="submit"
                className="rounded bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 md:col-span-6"
              >
                Добавить расход
              </button>
            </form>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--surface-soft)] text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Дата</th>
                  <th className="px-3 py-2 font-medium">Категория</th>
                  <th className="px-3 py-2 font-medium">Сумма</th>
                  <th className="px-3 py-2 font-medium">Коррекции</th>
                  <th className="px-3 py-2 font-medium">Итог</th>
                  {canCorrectExpense ? <th className="px-3 py-2 font-medium">Действия</th> : null}
                </tr>
              </thead>
              <tbody>
                {container.expenses.map((expense) => {
                  const correctionSum = expense.corrections.reduce(
                    (sum, row) => sum + row.correctionAmountUSD,
                    0,
                  );
                  const finalAmount = expense.amountUSD + correctionSum;
                  return (
                    <tr key={expense.id} className="border-t border-[var(--border)] align-top">
                      <td className="px-3 py-2 text-slate-600">
                        {new Date(expense.createdAt).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{expense.category}</td>
                      <td className="px-3 py-2 text-slate-700">{formatUsd(expense.amountUSD)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatUsd(correctionSum)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatUsd(finalAmount)}</td>
                      {canCorrectExpense ? (
                        <td className="px-3 py-2">
                          {expense.corrections.some((row) => !row.isConfirmed) ? (
                            <div className="mb-2 space-y-1">
                              {expense.corrections
                                .filter((row) => !row.isConfirmed)
                                .map((row) => (
                                  <form key={row.id} action={confirmExpenseCorrectionAction} className="flex items-center gap-2">
                                    <input type="hidden" name="correctionId" value={row.id} />
                                    <span className="text-xs text-orange-700">
                                      Неподтв. {formatUsd(row.correctionAmountUSD)}
                                    </span>
                                    {container.status !== "CLOSED" ? (
                                      <button
                                        type="submit"
                                        className="rounded border border-[var(--border)] px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                                      >
                                        Подтвердить
                                      </button>
                                    ) : null}
                                  </form>
                                ))}
                            </div>
                          ) : null}
                          {container.status !== "CLOSED" ? (
                            <form action={createExpenseCorrectionAction} className="grid gap-2 md:grid-cols-3">
                              <input type="hidden" name="expenseId" value={expense.id} />
                              <input
                                name="correctionAmountUSD"
                                type="number"
                                step="0.01"
                                required
                                placeholder="+/- USD"
                                className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                              />
                              <input
                                name="reason"
                                required
                                placeholder="Причина корректировки"
                                className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                              />
                              <button
                                type="submit"
                                className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                              >
                                Добавить корректировку
                              </button>
                            </form>
                          ) : (
                            <span className="text-xs text-slate-500">Недоступно</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
                {!container.expenses.length ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-slate-500" colSpan={canCorrectExpense ? 6 : 5}>
                      Расходов пока нет.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Товар</th>
              <th className="px-3 py-2 font-medium">Размер</th>
              <th className="px-3 py-2 font-medium">Цвет</th>
              <th className="px-3 py-2 font-medium">Количество</th>
              {showFinance ? <th className="px-3 py-2 font-medium">Цена за ед. (USD)</th> : null}
              {showFinance ? <th className="px-3 py-2 font-medium">Цена продажи (USD)</th> : null}
              {showFinance ? <th className="px-3 py-2 font-medium">Сумма (USD)</th> : null}
              <th className="px-3 py-2 font-medium">CBM</th>
              <th className="px-3 py-2 font-medium">KG</th>
              <th className="px-3 py-2 font-medium">TOTAL CBM</th>
              {showFinance ? <th className="px-3 py-2 font-medium">Себестоимость за ед. (USD)</th> : null}
              <th className="px-3 py-2 font-medium">Добавлено</th>
            </tr>
          </thead>
          <tbody>
            {container.items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 text-slate-700">{item.product.sku}</td>
                <td className="px-3 py-2 text-slate-800">{item.product.name}</td>
                <td className="px-3 py-2 text-slate-700">{item.sizeLabel ?? item.product.size ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700">{item.color ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                {showFinance ? (
                  <td className="px-3 py-2 text-slate-700">
                    {item.unitPriceUSD !== null ? `$${item.unitPriceUSD.toFixed(2)}` : "—"}
                  </td>
                ) : null}
                {showFinance ? (
                  <td className="px-3 py-2 text-slate-700">
                    {item.salePriceUSD !== null ? `$${item.salePriceUSD.toFixed(2)}` : "—"}
                  </td>
                ) : null}
                {showFinance ? (
                  <td className="px-3 py-2 text-slate-700">
                    {item.lineTotalUSD !== null ? `$${item.lineTotalUSD.toFixed(2)}` : "—"}
                  </td>
                ) : null}
                <td className="px-3 py-2 text-slate-700">{item.cbm !== null ? item.cbm.toFixed(4) : "—"}</td>
                <td className="px-3 py-2 text-slate-700">{item.kg !== null ? item.kg.toFixed(2) : "—"}</td>
                <td className="px-3 py-2 text-slate-700">{item.totalCbm !== null ? item.totalCbm.toFixed(4) : "—"}</td>
                {showFinance ? <td className="px-3 py-2 text-slate-700">${item.costPerUnitUSD.toFixed(4)}</td> : null}
                <td className="px-3 py-2 text-slate-600">{new Date(item.createdAt).toLocaleDateString("ru-RU")}</td>
              </tr>
            ))}
            {!container.items.length ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={showFinance ? 13 : 8}>
                  В контейнер пока не добавлены товары.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </section>
  );
}


