"use client";

import Image from "next/image";
import { useActionState, useMemo, useState } from "react";
import {
  addStockOutsideContainerAction,
  type AddStockOutsideContainerState,
} from "@/app/(main)/stock/actions";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  size: string;
  imagePath?: string | null;
  basePriceUSD: number;
  categoryName: string;
};

type ItemRow = {
  key: number;
  productId: string;
  quantity: string;
  sizeLabel: string;
  color: string;
  unitPriceUSD: string;
  salePriceUSD: string;
  lineTotalUSD: string;
  cbm: string;
  kg: string;
  totalCbm: string;
};

type AddStockOutsideContainerModalProps = {
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

export function AddStockOutsideContainerModal({ products }: AddStockOutsideContainerModalProps) {
  const [open, setOpen] = useState(false);
  const initialState: AddStockOutsideContainerState = { error: null, success: null };
  const [state, formAction, pending] = useActionState(addStockOutsideContainerAction, initialState);
  const [search, setSearch] = useState("");
  const [nextKey, setNextKey] = useState(1);
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [isDropActive, setIsDropActive] = useState(false);
  const [editingDetailsForKey, setEditingDetailsForKey] = useState<number | null>(null);
  const [editingPriceForKey, setEditingPriceForKey] = useState<number | null>(null);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

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

  const payload = useMemo(
    () =>
      rows
        .map((row) => {
          const quantity = Math.floor(toNumber(row.quantity));
          const unitPriceUSD = toNumber(row.unitPriceUSD);
          const lineTotalUSD = toNumber(row.lineTotalUSD);
          const salePriceUSD = toNumber(row.salePriceUSD);
          const cbm = toNumber(row.cbm);
          const kg = toNumber(row.kg);
          const totalCbm = toNumber(row.totalCbm);
          return {
            productId: row.productId,
            quantity,
            sizeLabel: row.sizeLabel.trim() || undefined,
            color: row.color.trim() || undefined,
            unitPriceUSD: unitPriceUSD > 0 ? unitPriceUSD : undefined,
            lineTotalUSD: lineTotalUSD > 0 ? lineTotalUSD : undefined,
            salePriceUSD: salePriceUSD > 0 ? salePriceUSD : undefined,
            cbm: cbm > 0 ? cbm : undefined,
            kg: kg > 0 ? kg : undefined,
            totalCbm: totalCbm > 0 ? totalCbm : undefined,
          };
        })
        .filter((row) => row.productId && row.quantity > 0),
    [rows],
  );

  const totalSum = useMemo(
    () =>
      payload.reduce((sum, row) => {
        const line = Number(row.lineTotalUSD ?? 0);
        if (line > 0) return sum + line;
        const unit = Number(row.unitPriceUSD ?? 0);
        if (unit > 0 && row.quantity > 0) return sum + unit * row.quantity;
        return sum;
      }, 0),
    [payload],
  );

  const editingDetailsRow =
    editingDetailsForKey === null ? null : rows.find((row) => row.key === editingDetailsForKey) ?? null;
  const editingPriceRow =
    editingPriceForKey === null ? null : rows.find((row) => row.key === editingPriceForKey) ?? null;

  function addProduct(product: ProductOption) {
    setRows((prev) => {
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
          key: nextKey,
          productId: product.id,
          quantity: "1",
          sizeLabel: product.size || "",
          color: "",
          unitPriceUSD: "",
          salePriceUSD: product.basePriceUSD > 0 ? String(product.basePriceUSD) : "",
          lineTotalUSD: "",
          cbm: "",
          kg: "",
          totalCbm: "",
          };
          nextRow.totalCbm = recalcTotalCbm(nextRow);
          return nextRow;
        })(),
      ];
    });
    setNextKey((value) => value + 1);
  }

  function handleDropProduct(productId: string) {
    const product = productMap.get(productId);
    if (!product) return;
    addProduct(product);
  }

  function updateRow(key: number, patch: Partial<ItemRow>) {
    setRows((prev) =>
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

  function removeRow(key: number) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Добавить товар вне контейнера
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-900/50" onClick={() => setOpen(false)}>
          <div
            className="flex h-full w-full flex-col bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className="text-base font-semibold text-slate-900">Добавление товара вне контейнера</h4>
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
                            onClick={() => addProduct(product)}
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
                  setIsDropActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!isDropActive) setIsDropActive(true);
                }}
                onDragLeave={() => setIsDropActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDropActive(false);
                  const productId = event.dataTransfer.getData("text/plain");
                  handleDropProduct(productId);
                }}
                className={`flex min-h-0 flex-col rounded-xl border p-3 transition-colors ${
                  isDropActive ? "border-[var(--accent)] bg-slate-50" : "border-[var(--border)]"
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
                  {rows.map((row) => {
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
                          <label className="grid justify-items-start gap-0.5 text-[11px] text-slate-600">
                            <span className="md:hidden">Количество (QTY)</span>
                            <input
                              value={row.quantity ?? ""}
                              onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                              type="number"
                              min={0}
                              step={1}
                              placeholder="QTY"
                              className="h-8 w-14 appearance-none rounded border border-[var(--border)] px-1.5 text-[11px] text-slate-700"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setEditingDetailsForKey(row.key)}
                            className="h-8 rounded border border-[var(--border)] px-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Изменить товар
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPriceForKey(row.key)}
                            className="h-8 rounded border border-[var(--border)] px-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Изменить цену
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(row.key)}
                            className="h-8 rounded border border-rose-300 px-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!rows.length ? (
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
                            onChange={(event) => updateRow(editingDetailsRow.key, { sizeLabel: event.target.value })}
                            className="rounded border border-[var(--border)] px-2 py-2 text-sm text-slate-700"
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-slate-600">
                          Цвет
                          <input
                            value={editingDetailsRow.color ?? ""}
                            onChange={(event) => updateRow(editingDetailsRow.key, { color: event.target.value })}
                            className="rounded border border-[var(--border)] px-2 py-2 text-sm text-slate-700"
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-slate-600">
                          CBM
                          <input
                            value={editingDetailsRow.cbm ?? ""}
                            onChange={(event) => updateRow(editingDetailsRow.key, { cbm: event.target.value })}
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
                            onChange={(event) => updateRow(editingDetailsRow.key, { kg: event.target.value })}
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
                            onChange={(event) => updateRow(editingDetailsRow.key, { totalCbm: event.target.value })}
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
                            onChange={(event) => updateRow(editingPriceRow.key, { unitPriceUSD: event.target.value })}
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
                            onChange={(event) => updateRow(editingPriceRow.key, { salePriceUSD: event.target.value })}
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
                            onChange={(event) => updateRow(editingPriceRow.key, { lineTotalUSD: event.target.value })}
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

            <form action={formAction} className="mt-3 rounded-xl border border-[var(--border)] bg-slate-50 p-3">
              <input type="hidden" name="itemsJson" value={JSON.stringify(payload)} />
              <label className="grid gap-1 text-xs text-slate-600">
                Комментарий (обязательно)
                <textarea
                  name="reason"
                  required
                  rows={3}
                  placeholder="Укажите причину ручного добавления товара без контейнера"
                  className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <p className="mt-2 text-xs text-slate-600">
                Сумма товаров: <span className="font-semibold text-slate-900">${totalSum.toFixed(2)}</span>
              </p>
              {state.error ? (
                <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {state.error}
                </p>
              ) : null}
              {state.success ? (
                <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {state.success}
                </p>
              ) : null}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={pending || !payload.length}
                  className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {pending ? "Сохранение..." : "Добавить в склад"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
