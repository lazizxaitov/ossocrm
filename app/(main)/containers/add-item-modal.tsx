"use client";

import { useMemo, useState } from "react";
import { addContainerItemAction } from "@/app/(main)/containers/actions";
import { CustomSelect } from "@/components/custom-select";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  size: string;
  basePriceUSD: number;
};

type AddItemModalProps = {
  containerId: string;
  products: ProductOption[];
  totalPurchaseUSD: number;
  totalExpensesUSD: number;
  currentQuantity: number;
};

export function AddItemModal({
  containerId,
  products,
  totalPurchaseUSD,
  totalExpensesUSD,
  currentQuantity,
}: AddItemModalProps) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [sizeLabel, setSizeLabel] = useState("");
  const [color, setColor] = useState("");
  const [unitPriceUSD, setUnitPriceUSD] = useState("");
  const [lineTotalUSD, setLineTotalUSD] = useState("");
  const [salePriceUSD, setSalePriceUSD] = useState("");
  const [cbm, setCbm] = useState("");
  const [kg, setKg] = useState("");
  const [totalCbm, setTotalCbm] = useState("");

  const quantitySafe = Math.max(1, Number(quantity) || 1);
  const unitPriceSafe = Math.max(0, Number(unitPriceUSD) || 0);
  const cbmSafe = Math.max(0, Number(cbm) || 0);
  const sumPreview = quantitySafe * unitPriceSafe;
  const totalCbmPreview = quantitySafe * cbmSafe;

  const previewCost = useMemo(() => {
    const qty = Math.max(1, Number(quantity) || 1);
    const totalQty = currentQuantity + qty;
    if (totalQty <= 0) return 0;
    return (totalPurchaseUSD + totalExpensesUSD) / totalQty;
  }, [quantity, currentQuantity, totalPurchaseUSD, totalExpensesUSD]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Добавить товар
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">Добавить товар в контейнер</h3>
            <p className="mt-1 text-xs text-slate-500">
              Себестоимость пересчитывается автоматически по формуле контейнера.
            </p>

            <form action={addContainerItemAction} className="mt-4 grid gap-3">
              <input type="hidden" name="containerId" value={containerId} />
              <CustomSelect
                name="productId"
                required
                value={productId}
                onValueChange={(value) => {
                  setProductId(value);
                  const selected = products.find((product) => product.id === value);
                  if (selected && !sizeLabel.trim()) {
                    setSizeLabel(selected.size || "");
                  }
                  if (selected && !salePriceUSD.trim() && selected.basePriceUSD > 0) {
                    setSalePriceUSD(String(selected.basePriceUSD));
                  }
                }}
                placeholder="Выберите товар"
                options={products.map((product) => ({
                  value: product.id,
                  label: `${product.name} (${product.sku})`,
                }))}
              />
              <label className="grid gap-1 text-xs text-slate-600">
                Количество (QTY)
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="grid gap-1 text-xs text-slate-600">
                  Размер
                  <input
                    name="sizeLabel"
                    value={sizeLabel}
                    onChange={(event) => setSizeLabel(event.target.value)}
                    placeholder="Размер"
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  Цвет
                  <input
                    name="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    placeholder="Цвет"
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  Себестоимость за ед. (USD)
                  <input
                    name="unitPriceUSD"
                    value={unitPriceUSD}
                    onChange={(event) => setUnitPriceUSD(event.target.value)}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Себестоимость за ед."
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  Сумма товара (USD)
                  <input
                    name="lineTotalUSD"
                    value={lineTotalUSD}
                    onChange={(event) => setLineTotalUSD(event.target.value)}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={sumPreview > 0 ? `Сумма (${sumPreview.toFixed(2)})` : "Сумма товара"}
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-600 md:col-span-2">
                  Цена продажи за ед. (USD)
                  <input
                    name="salePriceUSD"
                    value={salePriceUSD}
                    onChange={(event) => setSalePriceUSD(event.target.value)}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Цена продажи за ед."
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  Объем на ед. (CBM)
                  <input
                    name="cbm"
                    value={cbm}
                    onChange={(event) => setCbm(event.target.value)}
                    type="number"
                    min={0}
                    step="0.0001"
                    placeholder="CBM"
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  Вес (KG)
                  <input
                    name="kg"
                    value={kg}
                    onChange={(event) => setKg(event.target.value)}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="KG"
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-600 md:col-span-2">
                  Общий объем (TOTAL CBM)
                  <input
                    name="totalCbm"
                    value={totalCbm}
                    onChange={(event) => setTotalCbm(event.target.value)}
                    type="number"
                    min={0}
                    step="0.0001"
                    placeholder={totalCbmPreview > 0 ? `TOTAL CBM (${totalCbmPreview.toFixed(4)})` : "TOTAL CBM"}
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700"
                  />
                </label>
              </div>
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Прогнозная себестоимость за единицу после добавления:{" "}
                <span className="font-semibold text-slate-900">${previewCost.toFixed(4)}</span>
              </p>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Сохранить
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
