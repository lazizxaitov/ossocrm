"use client";

import Image from "next/image";
import { useActionState, useMemo, useState } from "react";
import { createContainerAction, type CreateContainerFormState } from "@/app/(main)/containers/actions";
import { CustomConfirmDialog } from "@/components/custom-confirm-dialog";
import { CustomDateInput } from "@/components/custom-date-input";
import { CustomSelect } from "@/components/custom-select";

type InvestorOption = {
  id: string;
  name: string;
};

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  size: string;
  imagePath?: string | null;
  costPriceUSD: number;
  cbm: number;
  kg: number;
  basePriceUSD: number;
  categoryName: string;
};

type InvestorRow = {
  key: number;
  investorId: string;
  investedAmountUSD: string;
};

type ItemRow = {
  key: number;
  productId: string;
  sizeLabel: string;
  color: string;
  quantity: string;
  unitPriceUSD: string;
  salePriceUSD: string;
  lineTotalUSD: string;
  cbm: string;
  kg: string;
  totalCbm: string;
};

type CreateContainerModalProps = {
  defaultRate: number | null;
  investors: InvestorOption[];
  products: ProductOption[];
};

function toNumber(value: string) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function recalcTotalCbm(row: ItemRow) {
  const quantity = Math.max(0, Math.floor(toNumber(row.quantity)));
  const cbm = toNumber(row.cbm);
  if (quantity > 0 && cbm > 0) {
    return String(Number((quantity * cbm).toFixed(4)));
  }
  return "";
}

export function CreateContainerModal({ defaultRate, investors, products }: CreateContainerModalProps) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const initialState: CreateContainerFormState = { error: null, success: false };
  const [state, formAction, isPending] = useActionState(createContainerAction, initialState);
  const [open, setOpen] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [investorNextKey, setInvestorNextKey] = useState(2);
  const [investorRows, setInvestorRows] = useState<InvestorRow[]>([{ key: 1, investorId: "", investedAmountUSD: "" }]);

  const [itemNextKey, setItemNextKey] = useState(2);
  const [editingPriceForKey, setEditingPriceForKey] = useState<number | null>(null);
  const [editingDetailsForKey, setEditingDetailsForKey] = useState<number | null>(null);
  const [itemRows, setItemRows] = useState<ItemRow[]>([]);
  const [isItemsDropActive, setIsItemsDropActive] = useState(false);

  const [purchaseCny, setPurchaseCny] = useState("");
  const [rate, setRate] = useState(defaultRate ? String(defaultRate) : "");
  const [initialExpensesUSD, setInitialExpensesUSD] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");

  const purchaseCnyNumber = Number(purchaseCny || 0);
  const rateNumber = Number(rate || 0);
  const initialExpensesNumber = Number(initialExpensesUSD || 0);
  const purchaseUsdFromCurrency = purchaseCnyNumber * rateNumber;

  const investmentsPayload = useMemo(
    () =>
      investorRows
        .map((row) => ({
          investorId: row.investorId,
          investedAmountUSD: Number(row.investedAmountUSD || 0),
        }))
        .filter((row) => row.investorId && row.investedAmountUSD > 0),
    [investorRows],
  );

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const containerItemsPayload = useMemo(
    () =>
      itemRows
        .map((row) => {
          const quantity = Math.floor(toNumber(row.quantity));
          const unitPriceUSD = toNumber(row.unitPriceUSD);
          const salePriceUSD = toNumber(row.salePriceUSD);
          const lineTotalUSD = toNumber(row.lineTotalUSD);
          const cbm = toNumber(row.cbm);
          const kg = toNumber(row.kg);
          const totalCbmManual = toNumber(row.totalCbm);
          const totalCbmAuto = cbm > 0 && quantity > 0 ? cbm * quantity : 0;
          return {
            productId: row.productId,
            sizeLabel: row.sizeLabel.trim(),
            color: row.color.trim(),
            quantity,
            unitPriceUSD: unitPriceUSD > 0 ? unitPriceUSD : undefined,
            salePriceUSD: salePriceUSD > 0 ? salePriceUSD : undefined,
            lineTotalUSD: lineTotalUSD > 0 ? lineTotalUSD : undefined,
            cbm: cbm > 0 ? cbm : undefined,
            kg: kg > 0 ? kg : undefined,
            totalCbm: totalCbmManual > 0 ? totalCbmManual : totalCbmAuto > 0 ? totalCbmAuto : undefined,
          };
        })
        .filter((row) => row.productId && row.quantity > 0),
    [itemRows],
  );

  const investedTotal = useMemo(
    () => investmentsPayload.reduce((sum, row) => sum + row.investedAmountUSD, 0),
    [investmentsPayload],
  );
  const itemsPurchaseUsd = useMemo(
    () =>
      containerItemsPayload.reduce((sum, row) => {
        const quantity = Math.max(0, Math.floor(Number(row.quantity) || 0));
        const lineTotal = Number(row.lineTotalUSD ?? 0);
        if (Number.isFinite(lineTotal) && lineTotal > 0) return sum + lineTotal;
        const unitPrice = Number(row.unitPriceUSD ?? 0);
        if (quantity > 0 && Number.isFinite(unitPrice) && unitPrice > 0) return sum + quantity * unitPrice;
        return sum;
      }, 0),
    [containerItemsPayload],
  );
  const totalPurchaseUsd = Math.max(purchaseUsdFromCurrency, itemsPurchaseUsd);
  const expectedInvestmentsUsd = totalPurchaseUsd + Math.max(0, initialExpensesNumber);
  const diff = investedTotal - expectedInvestmentsUsd;
  const hasMismatch = Math.abs(diff) >= 0.01;
  const editingDetailsRow = editingDetailsForKey === null ? null : itemRows.find((row) => row.key === editingDetailsForKey) ?? null;
  const editingPriceRow = editingPriceForKey === null ? null : itemRows.find((row) => row.key === editingPriceForKey) ?? null;

  const groupedProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const map = new Map<string, ProductOption[]>();
    const filtered = products.filter((product) => {
      if (!normalizedSearch) return true;
      const hay = `${product.name} ${product.sku} ${product.categoryName}`.toLowerCase();
      return hay.includes(normalizedSearch);
    });
    for (const product of filtered) {
      const key = product.categoryName || "Без категории";
      const list = map.get(key) ?? [];
      list.push(product);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [products, search]);

  function updateInvestorRow(key: number, patch: Partial<InvestorRow>) {
    setInvestorRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addInvestorRow() {
    setInvestorRows((prev) => [...prev, { key: investorNextKey, investorId: "", investedAmountUSD: "" }]);
    setInvestorNextKey((value) => value + 1);
  }

  function removeInvestorRow(key: number) {
    setInvestorRows((prev) => prev.filter((row) => row.key !== key));
  }

  function updateItemRow(key: number, patch: Partial<ItemRow>) {
    setItemRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        if (patch.quantity !== undefined || patch.cbm !== undefined) {
          next.totalCbm = recalcTotalCbm(next);
        }
        return next;
      }),
    );
  }

  function removeItemRow(key: number) {
    setItemRows((prev) => prev.filter((row) => row.key !== key));
  }

  function addProductToContainer(product: ProductOption) {
    setItemRows((prev) => {
      const existing = prev.find((row) => row.productId === product.id);
      if (existing) {
        return prev.map((row) =>
          row.productId === product.id
            ? { ...row, quantity: String(Math.max(1, Number(row.quantity || 1)) + 1) }
            : row,
        );
      }
      return [
        ...prev,
        (() => {
          const nextRow: ItemRow = {
          key: itemNextKey,
          productId: product.id,
          sizeLabel: product.size || "",
          color: "",
          quantity: "1",
          unitPriceUSD: product.costPriceUSD > 0 ? String(product.costPriceUSD) : "",
          salePriceUSD: product.basePriceUSD > 0 ? String(product.basePriceUSD) : "",
          lineTotalUSD: "",
          cbm: product.cbm > 0 ? String(product.cbm) : "",
          kg: product.kg > 0 ? String(product.kg) : "",
          totalCbm: "",
          };
          nextRow.totalCbm = recalcTotalCbm(nextRow);
          return nextRow;
        })(),
      ];
    });
    setItemNextKey((value) => value + 1);
  }

  function handleDropProduct(productId: string) {
    const product = productMap.get(productId);
    if (!product) return;
    addProductToContainer(product);
  }

  function requestCloseMainModal() {
    setConfirmCloseOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Создать контейнер
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={requestCloseMainModal}>
          <div
            className="max-h-[95vh] w-full max-w-6xl overflow-auto rounded-2xl bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">Новый контейнер</h3>
            <p className="text-sm text-slate-600">
              Заполните закупку, товары, инвесторов и стартовые расходы.
            </p>

            <form action={formAction} className="mt-4 grid gap-3">
              <div className="grid gap-2 md:grid-cols-6">
                <input
                  name="name"
                  required
                  placeholder="Контейнер февраль 2026"
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                <CustomDateInput
                  name="purchaseDate"
                  required
                  defaultValue={todayIso}
                  placeholder="Дата заказа/закупки"
                />
                <CustomDateInput
                  name="arrivalDate"
                  value={arrivalDate}
                  onValueChange={setArrivalDate}
                  placeholder="Примерная дата прибытия"
                />
                <input
                  name="totalPurchaseCNY"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={purchaseCny}
                  onChange={(event) => setPurchaseCny(event.target.value)}
                  placeholder="Закупка CNY"
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                <input
                  name="exchangeRate"
                  type="number"
                  min={0}
                  step="0.0001"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                  placeholder="Курс CNY→USD"
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                <input
                  name="initialExpensesUSD"
                  type="number"
                  min={0}
                  step="0.01"
                  value={initialExpensesUSD}
                  onChange={(event) => setInitialExpensesUSD(event.target.value)}
                  placeholder="Стартовые расходы USD"
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
              <p className="text-xs text-slate-500">
                Курс можно оставить пустым: система возьмет актуальный курс из настроек валюты.
              </p>

              <div className="rounded-xl border border-[var(--border)] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">Товары контейнера</p>
                  <button
                    type="button"
                    onClick={() => setItemsModalOpen(true)}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Добавить товар
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Добавлено позиций: <span className="font-semibold text-slate-700">{itemRows.length}</span>
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800">Инвесторы контейнера</p>
                  <button
                    type="button"
                    onClick={addInvestorRow}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Добавить инвестора
                  </button>
                </div>
                <div className="space-y-2">
                  {investorRows.map((row) => (
                    <div key={row.key} className="grid gap-2 rounded-lg border border-[var(--border)] p-2 md:grid-cols-12">
                      <CustomSelect
                        value={row.investorId ?? ""}
                        onValueChange={(value) => updateInvestorRow(row.key, { investorId: value })}
                        placeholder="Выберите инвестора"
                        className="md:col-span-8"
                        options={investors.map((investor) => ({ value: investor.id, label: investor.name }))}
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.investedAmountUSD ?? ""}
                        onChange={(event) => updateInvestorRow(row.key, { investedAmountUSD: event.target.value })}
                        placeholder="Сумма вложения USD"
                        className="md:col-span-3 rounded border border-[var(--border)] px-2 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeInvestorRow(row.key)}
                        className="md:col-span-1 rounded border border-[var(--border)] px-2 py-2 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        X
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <input type="hidden" name="investmentsJson" value={JSON.stringify(investmentsPayload)} />
              <input type="hidden" name="containerItemsJson" value={JSON.stringify(containerItemsPayload)} />

              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <p>Закупка USD (по курсу): ${purchaseUsdFromCurrency.toFixed(2)}</p>
                <p>Закупка USD (по товарам): ${itemsPurchaseUsd.toFixed(2)}</p>
                <p>Итог закупки USD: ${totalPurchaseUsd.toFixed(2)}</p>
                <p>Стартовые расходы USD: ${Math.max(0, initialExpensesNumber).toFixed(2)}</p>
                <p>Ожидаемо к инвестициям: ${expectedInvestmentsUsd.toFixed(2)}</p>
                <p>Вложено инвесторами: ${investedTotal.toFixed(2)}</p>
                {hasMismatch ? (
                  <p className="font-semibold text-orange-700">
                    Внимание: разница ${diff.toFixed(2)}. Сумма инвестиций не совпадает с закупкой.
                  </p>
                ) : (
                  <p className="font-semibold text-emerald-700">Суммы совпадают.</p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  {isPending ? "Сохранение..." : "Сохранить контейнер"}
                </button>
                <button
                  type="button"
                  onClick={requestCloseMainModal}
                  disabled={isPending}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Отмена
                </button>
              </div>
              {state.error ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {state.error}
                </p>
              ) : null}
              {state.success ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  Контейнер успешно создан.
                </p>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}
      <CustomConfirmDialog
        open={confirmCloseOpen}
        title="Закрыть создание контейнера"
        message="Данные формы будут потеряны. Закрыть окно?"
        confirmLabel="Закрыть"
        cancelLabel="Остаться"
        danger
        onCancel={() => setConfirmCloseOpen(false)}
        onConfirm={() => {
          setConfirmCloseOpen(false);
          setOpen(false);
        }}
      />

      {itemsModalOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-900/50" onClick={() => setItemsModalOpen(false)}>
          <div
            className="flex h-full w-full flex-col bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className="text-base font-semibold text-slate-900">Добавление товаров в контейнер</h4>
            <div className="mt-3 grid min-h-0 flex-1 gap-3 lg:grid-cols-[380px_1fr]">
              <section className="flex min-h-0 flex-col rounded-xl border border-[var(--border)] p-3">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Поиск по категории / товару / SKU"
                  className="mb-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                <div className="min-h-0 flex-1 space-y-2 overflow-auto">
                  {groupedProducts.map(([category, list]) => (
                    <div key={category} className="rounded-lg border border-[var(--border)] p-2">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{category}</p>
                      <div className="space-y-1">
                        {list.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => addProductToContainer(product)}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "copy";
                              event.dataTransfer.setData("text/plain", product.id);
                            }}
                            className="w-full rounded-md border border-transparent px-2 py-1.5 text-left text-sm text-slate-700 hover:border-[var(--border)] hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-2">
                              {product.imagePath ? (
                                <Image
                                  src={product.imagePath}
                                  alt={product.name}
                                  width={36}
                                  height={36}
                                  className="h-9 w-9 rounded-md border border-[var(--border)] object-cover"
                                />
                              ) : (
                                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-[var(--border)] text-[10px] text-slate-400">
                                  нет
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="truncate font-medium">{product.name}</p>
                                <p className="truncate text-xs text-slate-500">{product.sku}</p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsItemsDropActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!isItemsDropActive) setIsItemsDropActive(true);
                }}
                onDragLeave={() => setIsItemsDropActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsItemsDropActive(false);
                  const productId = event.dataTransfer.getData("text/plain");
                  handleDropProduct(productId);
                }}
                className={`flex min-h-0 flex-col rounded-xl border p-3 transition-colors ${
                  isItemsDropActive ? "border-[var(--accent)] bg-slate-50" : "border-[var(--border)]"
                }`}
              >
                <p className="mb-2 text-sm font-medium text-slate-800">Добавленные товары</p>
                <div className="mb-2 hidden grid-cols-[minmax(160px,2fr)_96px_64px_96px_96px_84px] gap-1.5 px-1 text-[11px] font-medium text-slate-500 md:grid">
                  <p>Товар</p>
                  <p>Размер</p>
                  <p>Количество (QTY)</p>
                  <p>Товар</p>
                  <p>Цена</p>
                  <p>Удалить</p>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-auto">
                  {itemRows.map((row) => {
                    const productName = products.find((product) => product.id === row.productId)?.name ?? "";
                    return (
                      <div key={row.key} className="rounded-lg border border-[var(--border)] bg-white p-2">
                        <div className="grid items-center gap-1.5 md:grid-cols-[minmax(160px,2fr)_96px_64px_96px_96px_84px]">
                          <div className="rounded border border-[var(--border)] bg-slate-50 px-2 py-2 text-sm text-slate-700">
                            {productName || "—"}
                          </div>
                          <div
                            title={row.sizeLabel || "Без размера"}
                            className="truncate rounded border border-[var(--border)] bg-slate-50 px-2 py-2 text-sm text-slate-700"
                          >
                            {row.sizeLabel || "Без размера"}
                          </div>
                          <div className="flex items-center">
                            <input
                              value={row.quantity ?? ""}
                              onChange={(event) => updateItemRow(row.key, { quantity: event.target.value })}
                              type="number"
                              min={0}
                              step={1}
                              placeholder="QTY"
                              className="h-10 w-14 appearance-none rounded border border-[var(--border)] px-1.5 text-[11px] text-slate-700"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingDetailsForKey(row.key)}
                            className="h-10 rounded border border-[var(--border)] px-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Изменить товар
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPriceForKey(row.key)}
                            className="h-10 rounded border border-[var(--border)] px-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Изменить цену
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItemRow(row.key)}
                            className="h-10 rounded border border-rose-300 px-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!itemRows.length ? (
                    <div className="rounded-lg border border-dashed border-[var(--border)] bg-slate-50 px-4 py-6 text-center">
                      <p className="text-sm font-medium text-slate-700">Перетащите товар сюда</p>
                      <p className="mt-1 text-xs text-slate-500">или нажмите на товар слева для добавления</p>
                    </div>
                  ) : null}
                </div>

                {editingDetailsRow ? (
                  <div
                    className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4"
                    onClick={() => setEditingDetailsForKey(null)}
                  >
                    <div
                      className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-4 shadow-xl"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <p className="text-sm font-semibold text-slate-900">Изменить товар</p>
                      <div className="mt-3 grid gap-2">
                        <label className="grid gap-1 text-xs text-slate-600">
                          Размер
                          <input
                            value={editingDetailsRow.sizeLabel ?? ""}
                            onChange={(event) => updateItemRow(editingDetailsRow.key, { sizeLabel: event.target.value })}
                            className="rounded border border-[var(--border)] px-2 py-2 text-sm text-slate-700"
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-slate-600">
                          Цвет
                          <input
                            value={editingDetailsRow.color ?? ""}
                            onChange={(event) => updateItemRow(editingDetailsRow.key, { color: event.target.value })}
                            className="rounded border border-[var(--border)] px-2 py-2 text-sm text-slate-700"
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-slate-600">
                          CBM
                          <input
                            value={editingDetailsRow.cbm ?? ""}
                            onChange={(event) => updateItemRow(editingDetailsRow.key, { cbm: event.target.value })}
                            type="number"
                            min={0}
                            step="0.0001"
                            placeholder="CBM"
                            className="rounded border border-[var(--border)] px-2 py-2 text-sm text-slate-700"
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-slate-600">
                          KG
                          <input
                            value={editingDetailsRow.kg ?? ""}
                            onChange={(event) => updateItemRow(editingDetailsRow.key, { kg: event.target.value })}
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="KG"
                            className="rounded border border-[var(--border)] px-2 py-2 text-sm text-slate-700"
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-slate-600">
                          TOTAL CBM
                          <input
                            value={editingDetailsRow.totalCbm ?? ""}
                            onChange={(event) => updateItemRow(editingDetailsRow.key, { totalCbm: event.target.value })}
                            type="number"
                            min={0}
                            step="0.0001"
                            placeholder="TOTAL CBM"
                            className="rounded border border-[var(--border)] px-2 py-2 text-sm text-slate-700"
                          />
                        </label>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingDetailsForKey(null)}
                          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Готово
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {editingPriceRow ? (
                  <div
                    className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4"
                    onClick={() => setEditingPriceForKey(null)}
                  >
                    <div
                      className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-4 shadow-xl"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <p className="text-sm font-semibold text-slate-900">Изменить цену</p>
                      <div className="mt-3 grid gap-2">
                        <label className="grid gap-1 text-xs text-slate-600">
                          Себестоимость за ед. (USD)
                          <input
                            value={editingPriceRow.unitPriceUSD ?? ""}
                            onChange={(event) => updateItemRow(editingPriceRow.key, { unitPriceUSD: event.target.value })}
                            type="number"
                            min={0}
                            step="0.01"
                            className="rounded border border-[var(--border)] px-2 py-2 text-sm text-slate-700"
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-slate-600">
                          Цена продажи за ед. (USD)
                          <input
                            value={editingPriceRow.salePriceUSD ?? ""}
                            onChange={(event) => updateItemRow(editingPriceRow.key, { salePriceUSD: event.target.value })}
                            type="number"
                            min={0}
                            step="0.01"
                            className="rounded border border-[var(--border)] px-2 py-2 text-sm text-slate-700"
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-slate-600">
                          Сумма товара (USD)
                          <input
                            value={editingPriceRow.lineTotalUSD ?? ""}
                            onChange={(event) => updateItemRow(editingPriceRow.key, { lineTotalUSD: event.target.value })}
                            type="number"
                            min={0}
                            step="0.01"
                            className="rounded border border-[var(--border)] px-2 py-2 text-sm text-slate-700"
                          />
                        </label>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingPriceForKey(null)}
                          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Готово
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <p>
                  Сумма товаров: <span className="font-semibold text-slate-900">${itemsPurchaseUsd.toFixed(2)}</span>
                </p>
                <p>
                  Общая сумма контейнера:{" "}
                  <span className="font-semibold text-slate-900">${totalPurchaseUsd.toFixed(2)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setItemsModalOpen(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}


