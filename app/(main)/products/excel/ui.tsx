"use client";

import { useMemo, useRef, useState } from "react";
import { ResizableHeaderCell, type ResizableColumn, useResizableColumns } from "@/components/ui/use-resizable-columns";

type ProductCategoryItem = {
  id: string;
  name: string;
  description?: string | null;
};

type GridRow = {
  key: number;
  include: boolean;
  factoryName: string;
  localName: string;
  priceCNY: string;
  size: string;
  quantity: string;
  totalAmountCNY: string;
  cbm: string;
  kg: string;
  totalCbm: string;
  netWorthKgs: string;
  exchangeRate: string;
  totalAmountUSD: string;
  categoryId: string;
  description: string;
  salePriceUSD: string;
  imageFile: File | null;
};

const PRODUCT_SHEET_COLUMNS: ResizableColumn[] = [
  { id: "factoryName", label: "FACTORI NAME", defaultWidth: 220 },
  { id: "localName", label: "OSSO NAME", defaultWidth: 250 },
  { id: "picture", label: "PICTURE / 图片", defaultWidth: 150 },
  { id: "priceCNY", label: "UNIT PRICE", defaultWidth: 130 },
  { id: "size", label: "SAIZE", defaultWidth: 170 },
  { id: "quantity", label: "QUANTITY ( SET )", defaultWidth: 130 },
  { id: "totalAmountCNY", label: "TOTAL AMOUNT", defaultWidth: 150 },
  { id: "cbm", label: "CBM", defaultWidth: 120 },
  { id: "kg", label: "KG", defaultWidth: 120 },
  { id: "totalCbm", label: "TOTAL CBM", defaultWidth: 140 },
  { id: "netWorthKgs", label: "TOTAL N.W. KGS", defaultWidth: 150 },
  { id: "dalee", label: "DALEE", defaultWidth: 110 },
  { id: "yusd", label: "Y - $", defaultWidth: 120 },
  { id: "totalAmountUSD", label: "TOTAL AMOUNT", defaultWidth: 150 },
  { id: "avgUnit", label: "ortacha birlik", defaultWidth: 140 },
  { id: "expenseUnit", label: "YOLGA VA Rastamojka ortacha birligi", defaultWidth: 220 },
  { id: "birDonasi", label: "BIR DONASI", defaultWidth: 140 },
  { id: "jami", label: "JAMI", defaultWidth: 150 },
  { id: "transportga", label: "TRANSPORTGA", defaultWidth: 140 },
  { id: "transportTotal", label: "TOTAL AMOUNT TRANSPORTGA", defaultWidth: 190 },
  { id: "customsUnit", label: "RASTAMOJKAGA", defaultWidth: 140 },
  { id: "customsTotal", label: "TOTAL AMOUNT RASTAMOJKAGA", defaultWidth: 210 },
  { id: "totalAmount2", label: "TOTAL AMOUNT", defaultWidth: 160 },
  { id: "allContainers", label: "TOTAL AMOUNT ALL CONTEYNERS", defaultWidth: 230 },
  { id: "category", label: "Категория", defaultWidth: 180 },
  { id: "description", label: "Описание", defaultWidth: 260 },
  { id: "salePriceUSD", label: "Цена продажи USD", defaultWidth: 150 },
  { id: "include", label: "Вкл", defaultWidth: 80 },
  { id: "delete", label: "Удалить", defaultWidth: 90 },
];

function formatSheetNumber(value: number, digits = 2) {
  if (!Number.isFinite(value) || value === 0) return "";
  return String(Number(value.toFixed(digits)));
}

function estimateColumnWidth(values: unknown[], min = 100, max = 420) {
  const longest = values.reduce<number>((best, value) => Math.max(best, String(value ?? "").length), 0);
  return Math.min(max, Math.max(min, longest * 9 + 36));
}

type CreateProductsExcelPageProps = {
  categories: ProductCategoryItem[];
};

function toNumber(value: string) {
  const n = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function calcTotalAmountCny(row: Pick<GridRow, "quantity" | "priceCNY">) {
  const quantity = Math.max(0, Math.floor(toNumber(row.quantity)));
  const priceCNY = toNumber(row.priceCNY);
  if (quantity > 0 && priceCNY > 0) return String(Number((quantity * priceCNY).toFixed(2)));
  return "";
}

function calcTotalCbm(row: Pick<GridRow, "quantity" | "cbm">) {
  const quantity = Math.max(0, Math.floor(toNumber(row.quantity)));
  const cbm = toNumber(row.cbm);
  if (quantity > 0 && cbm > 0) return String(Number((quantity * cbm).toFixed(4)));
  return "";
}

function calcNetWorthKgs(row: Pick<GridRow, "quantity" | "kg">) {
  const quantity = Math.max(0, Math.floor(toNumber(row.quantity)));
  const kg = toNumber(row.kg);
  if (quantity > 0 && kg > 0) return String(Number((quantity * kg).toFixed(3)));
  return "";
}

function calcTotalAmountUsd(row: Pick<GridRow, "quantity" | "priceCNY" | "totalAmountCNY" | "exchangeRate">) {
  const totalAmountCNY = toNumber(row.totalAmountCNY) || toNumber(calcTotalAmountCny(row));
  const exchangeRate = toNumber(row.exchangeRate);
  if (totalAmountCNY > 0 && exchangeRate > 0) return String(Number((totalAmountCNY * exchangeRate).toFixed(2)));
  return "";
}

function makeEmptyRow(key: number, exchangeRate = ""): GridRow {
  return {
    key,
    include: true,
    factoryName: "",
    localName: "",
    priceCNY: "",
    size: "Без размера",
    quantity: "1",
    totalAmountCNY: "",
    cbm: "",
    kg: "",
    totalCbm: "",
    netWorthKgs: "",
    exchangeRate,
    totalAmountUSD: "",
    categoryId: "",
    description: "",
    salePriceUSD: "",
    imageFile: null,
  };
}

export function CreateProductsExcelPage({ categories }: CreateProductsExcelPageProps) {
  const [defaultRate, setDefaultRate] = useState("");
  const [rows, setRows] = useState<GridRow[]>([
    makeEmptyRow(1, defaultRate),
    makeEmptyRow(2, defaultRate),
    makeEmptyRow(3, defaultRate),
  ]);
  const [nextKey, setNextKey] = useState(4);
  const [defaultCategoryId, setDefaultCategoryId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const { getWidth, totalWidth, startResize, setColumnWidth, resetWidths } = useResizableColumns(
    "osso:products-excel-columns:v1",
    PRODUCT_SHEET_COLUMNS,
  );

  function autoSizeColumn(columnId: string) {
    const values = rows.map((row) => {
      const quantity = Math.max(0, Math.floor(toNumber(row.quantity)));
      const totalAmountUsd = toNumber(row.totalAmountUSD) || toNumber(calcTotalAmountUsd(row));
      const shareRatio = totals.totalAmountUSD > 0 ? totalAmountUsd / totals.totalAmountUSD : 0;
      const avgUnitUsd = quantity > 0 ? totalAmountUsd / quantity : 0;
      switch (columnId) {
        case "picture":
          return row.imageFile ? row.imageFile.name : "";
        case "dalee":
          return "DALEE";
        case "yusd":
          return formatSheetNumber(avgUnitUsd, 6);
        case "avgUnit":
          return formatSheetNumber(shareRatio, 6);
        case "expenseUnit":
        case "transportga":
        case "transportTotal":
        case "customsUnit":
        case "customsTotal":
          return "—";
        case "birDonasi":
        case "jami":
        case "totalAmount2":
        case "allContainers":
          return formatSheetNumber(totalAmountUsd, 6);
        default:
          return (row as Record<string, unknown>)[columnId] ?? "";
      }
    });
    const label = PRODUCT_SHEET_COLUMNS.find((column) => column.id === columnId)?.label ?? columnId;
    setColumnWidth(columnId, estimateColumnWidth([label, ...values]));
  }

  const categoryOptions = useMemo(
    () => [{ value: "", label: "Без категории" }, ...categories.map((item) => ({ value: item.id, label: item.name }))],
    [categories],
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        if (!row.include) return acc;
        acc.products += row.localName.trim() ? 1 : 0;
        acc.quantity += Math.max(0, Math.floor(toNumber(row.quantity)));
        acc.totalAmountCNY += toNumber(row.totalAmountCNY) || toNumber(calcTotalAmountCny(row));
        acc.totalAmountUSD += toNumber(row.totalAmountUSD) || toNumber(calcTotalAmountUsd(row));
        acc.totalCbm += toNumber(row.totalCbm) || toNumber(calcTotalCbm(row));
        acc.netWorthKgs += toNumber(row.netWorthKgs) || toNumber(calcNetWorthKgs(row));
        return acc;
      },
      { products: 0, quantity: 0, totalAmountCNY: 0, totalAmountUSD: 0, totalCbm: 0, netWorthKgs: 0 },
    );
  }, [rows]);

  function updateRow(key: number, patch: Partial<GridRow>) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };

        if (patch.quantity !== undefined || patch.priceCNY !== undefined) {
          if (patch.totalAmountCNY === undefined) next.totalAmountCNY = calcTotalAmountCny(next);
        }
        if (
          patch.quantity !== undefined ||
          patch.priceCNY !== undefined ||
          patch.totalAmountCNY !== undefined ||
          patch.exchangeRate !== undefined
        ) {
          if (patch.totalAmountUSD === undefined) next.totalAmountUSD = calcTotalAmountUsd(next);
        }
        if (patch.quantity !== undefined || patch.cbm !== undefined) {
          if (patch.totalCbm === undefined) next.totalCbm = calcTotalCbm(next);
        }
        if (patch.quantity !== undefined || patch.kg !== undefined) {
          if (patch.netWorthKgs === undefined) next.netWorthKgs = calcNetWorthKgs(next);
        }
        return next;
      }),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, makeEmptyRow(nextKey, defaultRate)]);
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

  function applyDefaultRate() {
    setRows((prev) =>
      prev.map((row) => {
        const next = { ...row, exchangeRate: defaultRate };
        next.totalAmountUSD = calcTotalAmountUsd(next);
        return next;
      }),
    );
  }

  async function submitRows() {
    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const cleanedRows = rows
        .filter((row) => row.include)
        .map((row) => {
          const exchangeRate = toNumber(row.exchangeRate);
          const costPriceUSD = Number((toNumber(row.priceCNY) * exchangeRate).toFixed(4));
          return {
            sku: row.factoryName.trim(),
            name: row.localName.trim(),
            categoryId: row.categoryId.trim() || null,
            size: row.size.trim() || "Без размера",
            color: null,
            description: row.description.trim() || null,
            costPriceUSD,
            cbm: toNumber(row.cbm),
            kg: toNumber(row.kg),
            salePriceUSD: toNumber(row.salePriceUSD),
            imageFile: row.imageFile,
          };
        })
        .filter((row) => row.sku && row.name && row.costPriceUSD > 0 && row.salePriceUSD > 0);

      if (!cleanedRows.length) {
        throw new Error("Нет валидных строк. Заполните название в заводе, название у нас, цену в юане, курс и цену продажи.");
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
          color: null,
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
      setRows([makeEmptyRow(1, defaultRate), makeEmptyRow(2, defaultRate), makeEmptyRow(3, defaultRate)]);
      setNextKey(4);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ошибка создания товаров.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article className="grid h-full min-h-0 grid-rows-[auto_auto_1fr_auto_auto] gap-4 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
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
        <input
          value={defaultRate}
          onChange={(event) => setDefaultRate(event.target.value)}
          type="number"
          min={0}
          step="0.0001"
          placeholder="Yuan to USD"
          className="w-40 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-700"
        />
        <button
          type="button"
          onClick={applyDefaultRate}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Применить курс ко всем
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
          onClick={resetWidths}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Сбросить ширины
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

      <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[0.18em] text-slate-900">TRUCK ALL-1</h2>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Product creation sheet</p>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-slate-400">
        <div className="grid min-w-[980px] grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr] text-center text-sm text-slate-800">
          <div className="border-b-2 border-r border-slate-400 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]">PRODUCTS</div>
          <div className="border-b-2 border-r border-slate-400 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]">SETS</div>
          <div className="border-b-2 border-r border-slate-400 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]">RMB</div>
          <div className="border-b-2 border-r border-slate-400 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]">USD</div>
          <div className="border-b-2 border-r border-slate-400 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]">TOTAL CBM</div>
          <div className="border-b-2 border-slate-400 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]">TOTAL N.W. KGS</div>

          <div className="border-r border-slate-300 px-3 py-4 text-2xl font-semibold">{totals.products}</div>
          <div className="border-r border-slate-300 px-3 py-4 text-2xl font-semibold">{totals.quantity}</div>
          <div className="border-r border-slate-300 px-3 py-4 text-2xl font-semibold">{totals.totalAmountCNY.toFixed(2)}</div>
          <div className="border-r border-slate-300 px-3 py-4 text-2xl font-semibold">{totals.totalAmountUSD.toFixed(2)}</div>
          <div className="border-r border-slate-300 px-3 py-4 text-2xl font-semibold">{totals.totalCbm.toFixed(4)}</div>
          <div className="px-3 py-4 text-2xl font-semibold">{totals.netWorthKgs.toFixed(3)}</div>
        </div>
      </div>

      <div ref={tableWrapRef} className="min-h-0 overflow-auto rounded-xl border border-slate-400">
        <table className="w-full border-separate border-spacing-0 text-left text-sm" style={{ minWidth: totalWidth }}>
          <colgroup>
            {PRODUCT_SHEET_COLUMNS.map((column) => (
              <col key={column.id} style={{ width: getWidth(column.id) }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-white text-slate-800">
            <tr>
              {PRODUCT_SHEET_COLUMNS.map((column, index) => (
                <ResizableHeaderCell
                  key={column.id}
                  label={column.label}
                  width={getWidth(column.id)}
                  onResizeStart={(event) => startResize(column.id, event)}
                  onAutoSize={() => autoSizeColumn(column.id)}
                  className={index < PRODUCT_SHEET_COLUMNS.length - 1 ? "uppercase tracking-[0.08em]" : ""}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const quantity = Math.max(0, Math.floor(toNumber(row.quantity)));
              const totalAmountUsd = toNumber(row.totalAmountUSD) || toNumber(calcTotalAmountUsd(row));
              const shareRatio = totals.totalAmountUSD > 0 ? totalAmountUsd / totals.totalAmountUSD : 0;
              const avgUnitUsd = quantity > 0 ? totalAmountUsd / quantity : 0;
              return (
              <tr key={row.key} className="align-top text-slate-800">
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.factoryName}
                    onChange={(event) => updateRow(row.key, { factoryName: event.target.value })}
                    placeholder="Завод / SKU"
                    className="min-w-0 w-full rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.localName}
                    onChange={(event) => updateRow(row.key, { localName: event.target.value })}
                    placeholder="Название у нас"
                    className="min-w-0 w-full rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
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
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.priceCNY}
                    onChange={(event) => updateRow(row.key, { priceCNY: event.target.value })}
                    type="number"
                    min={0}
                    step="0.0001"
                    className="min-w-0 w-full rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.size}
                    onChange={(event) => updateRow(row.key, { size: event.target.value })}
                    className="min-w-0 w-full rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.quantity}
                    onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                    type="number"
                    min={0}
                    step="1"
                    className="min-w-0 w-full rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.totalAmountCNY}
                    onChange={(event) => updateRow(row.key, { totalAmountCNY: event.target.value })}
                    type="number"
                    min={0}
                    step="0.01"
                    className="min-w-0 w-full rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.cbm}
                    onChange={(event) => updateRow(row.key, { cbm: event.target.value })}
                    type="number"
                    min={0}
                    step="0.0001"
                    className="min-w-0 w-full rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.kg}
                    onChange={(event) => updateRow(row.key, { kg: event.target.value })}
                    type="number"
                    min={0}
                    step="0.01"
                    className="min-w-0 w-full rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.totalCbm}
                    onChange={(event) => updateRow(row.key, { totalCbm: event.target.value })}
                    type="number"
                    min={0}
                    step="0.0001"
                    className="min-w-0 w-full rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.netWorthKgs}
                    onChange={(event) => updateRow(row.key, { netWorthKgs: event.target.value })}
                    type="number"
                    min={0}
                    step="0.001"
                    className="min-w-0 w-full rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.exchangeRate}
                    onChange={(event) => updateRow(row.key, { exchangeRate: event.target.value })}
                    type="number"
                    min={0}
                    step="0.0001"
                    className="min-w-0 w-full rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.totalAmountUSD}
                    onChange={(event) => updateRow(row.key, { totalAmountUSD: event.target.value })}
                    type="number"
                    min={0}
                    step="0.01"
                    className="min-w-0 w-full rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <div className="w-full bg-slate-50 px-2 py-2 text-center text-[13px] font-medium text-slate-700">DALEE</div>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <div className="w-full bg-slate-50 px-2 py-2 text-center text-[13px] text-slate-700">{formatSheetNumber(avgUnitUsd, 6) || "—"}</div>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <div className="w-full bg-slate-50 px-2 py-2 text-center text-[13px] text-slate-700">{formatSheetNumber(totalAmountUsd, 6) || "—"}</div>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <div className="w-full bg-slate-50 px-2 py-2 text-center text-[13px] text-slate-700">{formatSheetNumber(shareRatio, 6) || "—"}</div>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <div className="w-full bg-slate-50 px-2 py-2 text-center text-[13px] text-slate-700">—</div>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <div className="w-full bg-slate-50 px-2 py-2 text-center text-[13px] text-slate-700">{formatSheetNumber(avgUnitUsd, 6) || "—"}</div>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <div className="w-full bg-slate-50 px-2 py-2 text-center text-[13px] text-slate-700">{formatSheetNumber(totalAmountUsd, 6) || "—"}</div>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <div className="w-full bg-slate-50 px-2 py-2 text-center text-[13px] text-slate-700">—</div>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <div className="w-full bg-slate-50 px-2 py-2 text-center text-[13px] text-slate-700">—</div>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <div className="w-full bg-slate-50 px-2 py-2 text-center text-[13px] text-slate-700">—</div>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <div className="w-full bg-slate-50 px-2 py-2 text-center text-[13px] text-slate-700">—</div>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <div className="w-full bg-slate-50 px-2 py-2 text-center text-[13px] text-slate-700">{formatSheetNumber(totalAmountUsd, 6) || "—"}</div>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <div className="w-full bg-slate-50 px-2 py-2 text-center text-[13px] text-slate-700">{formatSheetNumber(totalAmountUsd, 6) || "—"}</div>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <select
                    value={row.categoryId}
                    onChange={(event) => updateRow(row.key, { categoryId: event.target.value })}
                    className="min-w-0 w-full rounded border border-[var(--border)] bg-white px-2 py-2"
                  >
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <textarea
                    value={row.description}
                    onChange={(event) => updateRow(row.key, { description: event.target.value })}
                    placeholder="Описание"
                    className="min-h-24 min-w-0 w-full rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.salePriceUSD}
                    onChange={(event) => updateRow(row.key, { salePriceUSD: event.target.value })}
                    type="number"
                    min={0}
                    step="0.01"
                    className="min-w-0 w-full rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(event) => updateRow(row.key, { include: event.target.checked })}
                  />
                </td>
                <td className="border-b border-slate-300 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="rounded border border-rose-300 px-2 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                  >
                    X
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </article>
  );
}
