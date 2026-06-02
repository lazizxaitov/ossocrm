"use client";

import { useMemo, useRef, useState } from "react";

type ProductCategoryItem = {
  id: string;
  name: string;
  description?: string | null;
};

type GridRow = {
  key: number;
  include: boolean;
  sku: string;
  name: string;
  categoryId: string;
  size: string;
  color: string;
  description: string;
  costPriceUSD: string;
  salePriceUSD: string;
  cbm: string;
  kg: string;
  imageFile: File | null;
};

type CreateProductsExcelPageProps = {
  categories: ProductCategoryItem[];
};

function toNumber(value: string) {
  const n = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function makeEmptyRow(key: number): GridRow {
  return {
    key,
    include: true,
    sku: "",
    name: "",
    categoryId: "",
    size: "Без размера",
    color: "",
    description: "",
    costPriceUSD: "",
    salePriceUSD: "",
    cbm: "",
    kg: "",
    imageFile: null,
  };
}

export function CreateProductsExcelPage({ categories }: CreateProductsExcelPageProps) {
  const [rows, setRows] = useState<GridRow[]>([makeEmptyRow(1), makeEmptyRow(2), makeEmptyRow(3)]);
  const [nextKey, setNextKey] = useState(4);
  const [defaultCategoryId, setDefaultCategoryId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const tableWrapRef = useRef<HTMLDivElement | null>(null);

  const categoryOptions = useMemo(
    () => [{ value: "", label: "Без категории" }, ...categories.map((item) => ({ value: item.id, label: item.name }))],
    [categories],
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        if (!row.include) return acc;
        acc.products += row.name.trim() ? 1 : 0;
        acc.costPriceUSD += toNumber(row.costPriceUSD);
        acc.salePriceUSD += toNumber(row.salePriceUSD);
        acc.cbm += toNumber(row.cbm);
        acc.kg += toNumber(row.kg);
        return acc;
      },
      { products: 0, costPriceUSD: 0, salePriceUSD: 0, cbm: 0, kg: 0 },
    );
  }, [rows]);

  function updateRow(key: number, patch: Partial<GridRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, makeEmptyRow(nextKey)]);
    setNextKey((prev) => prev + 1);
    requestAnimationFrame(() => {
      const target = tableWrapRef.current;
      if (target) {
        target.scrollLeft = target.scrollWidth;
        target.scrollTop = target.scrollHeight;
      }
    });
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  function applyDefaultCategory() {
    setRows((prev) => prev.map((row) => ({ ...row, categoryId: defaultCategoryId })));
  }

  async function submitRows() {
    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const cleanedRows = rows
        .filter((row) => row.include)
        .map((row) => ({
          sku: row.sku.trim(),
          name: row.name.trim(),
          categoryId: row.categoryId.trim() || null,
          size: row.size.trim() || "Без размера",
          color: row.color.trim() || null,
          description: row.description.trim() || null,
          costPriceUSD: toNumber(row.costPriceUSD),
          cbm: toNumber(row.cbm),
          kg: toNumber(row.kg),
          salePriceUSD: toNumber(row.salePriceUSD),
          imageFile: row.imageFile,
        }))
        .filter((row) => row.sku && row.name && row.costPriceUSD > 0 && row.salePriceUSD > 0);

      if (!cleanedRows.length) {
        throw new Error("Нет валидных строк. Заполните SKU, название, себестоимость и цену продажи.");
      }

      const form = new FormData();
      const rowsForServer = cleanedRows.map((row, index) => {
        const imageKey = row.imageFile ? `img_${index}_${row.sku}` : null;
        if (imageKey && row.imageFile) {
          form.set(imageKey, row.imageFile);
        }
        return {
          sku: row.sku,
          name: row.name,
          categoryId: row.categoryId,
          size: row.size,
          color: row.color,
          description: row.description,
          costPriceUSD: row.costPriceUSD,
          cbm: row.cbm > 0 ? row.cbm : null,
          kg: row.kg > 0 ? row.kg : null,
          salePriceUSD: row.salePriceUSD,
          imageKey,
        };
      });

      form.set("rowsJson", JSON.stringify(rowsForServer));

      const response = await fetch("/api/products/import-from-excel", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; products?: unknown[] };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Не удалось создать товары.");
      }

      setSuccess(`Создано/обновлено товаров: ${data.products?.length ?? cleanedRows.length}`);
      setRows([makeEmptyRow(1), makeEmptyRow(2), makeEmptyRow(3)]);
      setNextKey(4);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ошибка создания товаров.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] gap-4 rounded-2xl border border-[var(--border)] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={defaultCategoryId}
          onChange={(event) => setDefaultCategoryId(event.target.value)}
          className="min-w-56 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-700"
        >
          {categoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={applyDefaultCategory}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Применить категорию ко всем
        </button>
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Добавить строку
        </button>
        <button
          type="button"
          onClick={submitRows}
          disabled={isSubmitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting ? "Создание..." : "Создать товары"}
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>
      ) : null}

      <div ref={tableWrapRef} className="min-h-0 overflow-auto rounded-xl border border-[var(--border)]">
        <table className="min-w-[1650px] w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Вкл</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-medium">SKU</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Название</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Категория</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Размер</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Цвет</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Описание</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Себестоимость USD</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Цена продажи USD</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-medium">CBM</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-medium">KG</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Фото</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-medium">Удалить</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="align-top text-slate-800">
                <td className="border-b border-[var(--border)] px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(event) => updateRow(row.key, { include: event.target.checked })}
                  />
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2">
                  <input
                    value={row.sku}
                    onChange={(event) => updateRow(row.key, { sku: event.target.value })}
                    placeholder="OSSO-001"
                    className="w-32 rounded border border-[var(--border)] px-2 py-1.5"
                  />
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2">
                  <input
                    value={row.name}
                    onChange={(event) => updateRow(row.key, { name: event.target.value })}
                    placeholder="Название товара"
                    className="w-56 rounded border border-[var(--border)] px-2 py-1.5"
                  />
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2">
                  <select
                    value={row.categoryId}
                    onChange={(event) => updateRow(row.key, { categoryId: event.target.value })}
                    className="w-48 rounded border border-[var(--border)] bg-white px-2 py-1.5"
                  >
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2">
                  <input
                    value={row.size}
                    onChange={(event) => updateRow(row.key, { size: event.target.value })}
                    className="w-32 rounded border border-[var(--border)] px-2 py-1.5"
                  />
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2">
                  <input
                    value={row.color}
                    onChange={(event) => updateRow(row.key, { color: event.target.value })}
                    className="w-32 rounded border border-[var(--border)] px-2 py-1.5"
                  />
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2">
                  <textarea
                    value={row.description}
                    onChange={(event) => updateRow(row.key, { description: event.target.value })}
                    placeholder="Описание"
                    className="min-h-20 w-72 rounded border border-[var(--border)] px-2 py-1.5"
                  />
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2">
                  <input
                    value={row.costPriceUSD}
                    onChange={(event) => updateRow(row.key, { costPriceUSD: event.target.value })}
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-28 rounded border border-[var(--border)] px-2 py-1.5"
                  />
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2">
                  <input
                    value={row.salePriceUSD}
                    onChange={(event) => updateRow(row.key, { salePriceUSD: event.target.value })}
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-28 rounded border border-[var(--border)] px-2 py-1.5"
                  />
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2">
                  <input
                    value={row.cbm}
                    onChange={(event) => updateRow(row.key, { cbm: event.target.value })}
                    type="number"
                    min={0}
                    step="0.0001"
                    className="w-24 rounded border border-[var(--border)] px-2 py-1.5"
                  />
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2">
                  <input
                    value={row.kg}
                    onChange={(event) => updateRow(row.key, { kg: event.target.value })}
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-24 rounded border border-[var(--border)] px-2 py-1.5"
                  />
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2">
                  <label className="flex w-32 cursor-pointer items-center justify-center rounded border border-dashed border-[var(--border)] px-2 py-2 text-xs text-slate-600 hover:bg-slate-50">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        updateRow(row.key, { imageFile: file });
                      }}
                    />
                    {row.imageFile ? row.imageFile.name : "Выбрать фото"}
                  </label>
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2">
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="rounded border border-rose-300 px-2 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                  >
                    X
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-slate-700 md:grid-cols-5">
        <div>Товаров: <span className="font-semibold text-slate-900">{totals.products}</span></div>
        <div>Себестоимость: <span className="font-semibold text-slate-900">{totals.costPriceUSD.toFixed(2)} USD</span></div>
        <div>Продажа: <span className="font-semibold text-slate-900">{totals.salePriceUSD.toFixed(2)} USD</span></div>
        <div>Общий CBM: <span className="font-semibold text-slate-900">{totals.cbm.toFixed(4)}</span></div>
        <div>Общий KG: <span className="font-semibold text-slate-900">{totals.kg.toFixed(2)}</span></div>
      </div>
    </article>
  );
}
