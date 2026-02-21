"use client";

import { useMemo, useState } from "react";
import { createReturnAction } from "@/app/(main)/sales/actions";

type ReturnableSaleItem = {
  saleItemId: string;
  title: string;
  soldQty: number;
  maxReturnQty: number;
  salePricePerUnitUSD: number;
};

type ReturnModalProps = {
  saleId: string;
  items: ReturnableSaleItem[];
};

export function ReturnModal({ saleId, items }: ReturnModalProps) {
  const [open, setOpen] = useState(false);
  const [qtyByItem, setQtyByItem] = useState<Record<string, number>>({});

  const payload = useMemo(
    () =>
      items
        .map((item) => ({
          saleItemId: item.saleItemId,
          quantity: Math.max(0, Number(qtyByItem[item.saleItemId] ?? 0)),
        }))
        .filter((item) => item.quantity > 0),
    [items, qtyByItem],
  );

  const total = useMemo(() => {
    return payload.reduce((sum, row) => {
      const item = items.find((it) => it.saleItemId === row.saleItemId);
      return sum + (item ? row.quantity * item.salePricePerUnitUSD : 0);
    }, 0);
  }, [items, payload]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Оформить возврат
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">Создание возврата</h3>
            <p className="text-sm text-slate-600">Можно оформить полный или частичный возврат.</p>
            <form action={createReturnAction} className="mt-3 grid gap-3">
              <input type="hidden" name="saleId" value={saleId} />
              <input type="hidden" name="itemsJson" value={JSON.stringify(payload)} />
              <div className="space-y-2">
                {items.map((item) => (
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
                      value={qtyByItem[item.saleItemId] ?? 0}
                      onChange={(event) =>
                        setQtyByItem((prev) => ({
                          ...prev,
                          [item.saleItemId]: Math.min(item.maxReturnQty, Math.max(0, Number(event.target.value))),
                        }))
                      }
                      className="md:col-span-4 rounded border border-[var(--border)] px-2 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>
              <p className="text-sm font-medium text-slate-800">Сумма возврата: ${total.toFixed(2)}</p>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Подтвердить возврат
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
