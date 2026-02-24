"use client";

import { useMemo, useState } from "react";
import { createExchangeAction } from "@/app/(main)/sales/actions";

type ReturnableSaleItem = {
  saleItemId: string;
  title: string;
  soldQty: number;
  maxReturnQty: number;
  salePricePerUnitUSD: number;
};

type StockOption = {
  containerItemId: string;
  title: string;
  containerName: string;
  availableQty: number;
  defaultSalePriceUSD: number;
};

type AddedRow = {
  containerItemId: string;
  title: string;
  containerName: string;
  quantity: number;
  salePricePerUnitUSD: number;
  availableQty: number;
};

type ExchangeModalProps = {
  saleId: string;
  returnItems: ReturnableSaleItem[];
  stock: StockOption[];
};

export function ExchangeModal({ saleId, returnItems, stock }: ExchangeModalProps) {
  const [open, setOpen] = useState(false);
  const [returnQtyByItem, setReturnQtyByItem] = useState<Record<string, number>>({});
  const [addRows, setAddRows] = useState<AddedRow[]>([]);
  const [selectedStockId, setSelectedStockId] = useState(stock[0]?.containerItemId ?? "");
  const [addQty, setAddQty] = useState<number>(1);
  const [addPrice, setAddPrice] = useState<number>(stock[0]?.defaultSalePriceUSD ?? 0);

  const returnPayload = useMemo(
    () =>
      returnItems
        .map((item) => ({
          saleItemId: item.saleItemId,
          quantity: Math.max(0, Number(returnQtyByItem[item.saleItemId] ?? 0)),
        }))
        .filter((item) => item.quantity > 0),
    [returnItems, returnQtyByItem],
  );

  const addPayload = useMemo(
    () =>
      addRows.map((row) => ({
        containerItemId: row.containerItemId,
        quantity: Math.max(0, Number(row.quantity)),
        salePricePerUnitUSD: Math.max(0, Number(row.salePricePerUnitUSD)),
      })),
    [addRows],
  );

  const returnTotal = useMemo(
    () =>
      returnPayload.reduce((sum, row) => {
        const item = returnItems.find((it) => it.saleItemId === row.saleItemId);
        return sum + (item ? row.quantity * item.salePricePerUnitUSD : 0);
      }, 0),
    [returnPayload, returnItems],
  );
  const addTotal = useMemo(
    () => addPayload.reduce((sum, row) => sum + row.quantity * row.salePricePerUnitUSD, 0),
    [addPayload],
  );

  function onSelectStock(newId: string) {
    setSelectedStockId(newId);
    const picked = stock.find((row) => row.containerItemId === newId);
    if (picked) {
      setAddPrice(picked.defaultSalePriceUSD);
      setAddQty(1);
    }
  }

  function onAddReplacement() {
    const picked = stock.find((row) => row.containerItemId === selectedStockId);
    if (!picked) return;
    const qty = Math.max(1, Math.min(picked.availableQty, Math.floor(addQty || 0)));
    const price = Math.max(0.01, Number(addPrice || 0));
    setAddRows((prev) => [
      ...prev,
      {
        containerItemId: picked.containerItemId,
        title: picked.title,
        containerName: picked.containerName,
        availableQty: picked.availableQty,
        quantity: qty,
        salePricePerUnitUSD: price,
      },
    ]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Замена товара
      </button>
      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-5xl rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Замена товара</h3>
            <p className="text-sm text-slate-600">Сначала выберите возврат, затем добавьте товар на замену.</p>

            <form action={createExchangeAction} className="mt-3 grid gap-3">
              <input type="hidden" name="saleId" value={saleId} />
              <input type="hidden" name="returnItemsJson" value={JSON.stringify(returnPayload)} />
              <input type="hidden" name="addItemsJson" value={JSON.stringify(addPayload)} />

              <section className="rounded-xl border border-[var(--border)] p-3">
                <h4 className="mb-2 text-sm font-semibold text-slate-900">1. Возврат товаров</h4>
                <div className="grid gap-2">
                  {returnItems.map((item) => (
                    <div key={item.saleItemId} className="grid gap-2 rounded-lg border border-[var(--border)] p-2 md:grid-cols-12">
                      <div className="md:col-span-8">
                        <p className="text-sm font-medium text-slate-800">{item.title}</p>
                        <p className="text-xs text-slate-500">
                          Продано: {item.soldQty}, доступно к возврату: {item.maxReturnQty}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={item.maxReturnQty}
                        value={returnQtyByItem[item.saleItemId] ?? 0}
                        onChange={(event) =>
                          setReturnQtyByItem((prev) => ({
                            ...prev,
                            [item.saleItemId]: Math.min(item.maxReturnQty, Math.max(0, Number(event.target.value))),
                          }))
                        }
                        className="md:col-span-4 rounded border border-[var(--border)] px-2 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-[var(--border)] p-3">
                <h4 className="mb-2 text-sm font-semibold text-slate-900">2. Товар на замену</h4>
                <div className="grid gap-2 md:grid-cols-12">
                  <select
                    value={selectedStockId}
                    onChange={(event) => onSelectStock(event.target.value)}
                    className="md:col-span-6 rounded border border-[var(--border)] px-2 py-2 text-sm"
                  >
                    {stock.map((item) => (
                      <option key={item.containerItemId} value={item.containerItemId}>
                        {item.title} | {item.containerName} | Доступно: {item.availableQty}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={addQty}
                    onChange={(event) => setAddQty(Math.max(1, Number(event.target.value)))}
                    className="md:col-span-2 rounded border border-[var(--border)] px-2 py-2 text-sm"
                    placeholder="Кол-во"
                  />
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={addPrice}
                    onChange={(event) => setAddPrice(Math.max(0, Number(event.target.value)))}
                    className="md:col-span-2 rounded border border-[var(--border)] px-2 py-2 text-sm"
                    placeholder="Цена"
                  />
                  <button
                    type="button"
                    onClick={onAddReplacement}
                    className="md:col-span-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Добавить
                  </button>
                </div>

                <div className="mt-2 grid gap-2">
                  {addRows.map((row, index) => (
                    <div key={`${row.containerItemId}-${index}`} className="grid gap-2 rounded-lg border border-[var(--border)] p-2 md:grid-cols-12">
                      <div className="text-sm text-slate-800 md:col-span-5">
                        {row.title}
                        <p className="text-xs text-slate-500">{row.containerName}</p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={row.availableQty}
                        value={row.quantity}
                        onChange={(event) =>
                          setAddRows((prev) =>
                            prev.map((r, i) =>
                              i === index ? { ...r, quantity: Math.max(1, Math.min(r.availableQty, Number(event.target.value))) } : r,
                            ),
                          )
                        }
                        className="md:col-span-2 rounded border border-[var(--border)] px-2 py-2 text-sm"
                      />
                      <input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={row.salePricePerUnitUSD}
                        onChange={(event) =>
                          setAddRows((prev) =>
                            prev.map((r, i) => (i === index ? { ...r, salePricePerUnitUSD: Math.max(0.01, Number(event.target.value)) } : r)),
                          )
                        }
                        className="md:col-span-3 rounded border border-[var(--border)] px-2 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setAddRows((prev) => prev.filter((_, i) => i !== index))}
                        className="md:col-span-2 rounded border border-rose-300 bg-rose-50 px-2 py-2 text-sm text-rose-700 hover:bg-rose-100"
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Возврат: ${returnTotal.toFixed(2)} | Добавлено: ${addTotal.toFixed(2)} | Разница: ${(addTotal - returnTotal).toFixed(2)}
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                  disabled={!returnPayload.length || !addPayload.length}
                >
                  Провести замену
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
