"use client";

import { formatUsd } from "@/lib/currency";
import { useState } from "react";

type StockItemDetailsModalProps = {
  productName: string;
  sku: string;
  containerName: string;
  statusLabel: string;
  purchaseDateLabel: string;
  arrivalDateLabel: string;
  quantity: number;
  costPerUnitUSD: number;
  salePriceUSD: number;
  totalCostUSD: number;
  totalSaleUSD: number;
};

export function StockItemDetailsModal({
  productName,
  sku,
  containerName,
  statusLabel,
  purchaseDateLabel,
  arrivalDateLabel,
  quantity,
  costPerUnitUSD,
  salePriceUSD,
  totalCostUSD,
  totalSaleUSD,
}: StockItemDetailsModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Подробнее
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Подробная информация</h3>
            <p className="mt-1 text-sm text-slate-600">{productName}</p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">SKU: {sku}</div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Контейнер: {containerName}</div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Статус: {statusLabel}</div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Количество: {quantity}</div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Дата заказа: {purchaseDateLabel}</div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Дата прихода: {arrivalDateLabel}</div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Себестоимость/ед.: {formatUsd(costPerUnitUSD)}</div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Цена продажи/ед.: {formatUsd(salePriceUSD)}</div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Сумма себестоимости: {formatUsd(totalCostUSD)}</div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Потенциал продажи: {formatUsd(totalSaleUSD)}</div>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
