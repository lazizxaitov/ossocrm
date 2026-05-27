"use client";

import Image from "next/image";
import { useActionState, useMemo, useState } from "react";
import { createContainerAction, type CreateContainerFormState } from "@/app/(main)/containers/actions";

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

type GridRow = {
  key: number;
  productId: string;
  model: string;
  unitPriceUSD: string;
  saize: string;
  color: string;
  quantity: string;
  totalAmountUSD: string;
  cbm: string;
  kg: string;
  totalCbm: string;
  nwKgs: string;
  totalAmount2: string;
};

type InvestmentRow = {
  key: number;
  investorId: string;
  investorName: string;
  investedAmountUSD: string;
  percentageShare: string;
};

type ExpenseRow = {
  key: number;
  title: string;
  category: "LOGISTICS" | "CUSTOMS" | "STORAGE" | "TRANSPORT" | "OTHER";
  amountUSD: string;
  description: string;
};


function toNumber(raw: string) {
  const normalized = String(raw ?? "").trim().replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function calcTotalCbm(row: Pick<GridRow, "quantity" | "cbm">) {
  const q = Math.max(0, Math.floor(toNumber(row.quantity)));
  const cbm = toNumber(row.cbm);
  if (q > 0 && cbm > 0) return String(Number((q * cbm).toFixed(4)));
  return "";
}

function calcNwKgs(row: Pick<GridRow, "quantity" | "kg">) {
  const q = Math.max(0, Math.floor(toNumber(row.quantity)));
  const kg = toNumber(row.kg);
  if (q > 0 && kg > 0) return String(Number((q * kg).toFixed(3)));
  return "";
}

function calcLineTotal(row: Pick<GridRow, "quantity" | "unitPriceUSD">) {
  const q = Math.max(0, Math.floor(toNumber(row.quantity)));
  const unit = toNumber(row.unitPriceUSD);
  if (q > 0 && unit > 0) return String(Number((q * unit).toFixed(2)));
  return "";
}

export function CreateContainerExcelPage({
  defaultRate,
  products,
  investors,
}: {
  defaultRate: number | null;
  products: ProductOption[];
  investors: Array<{ id: string; name: string }>;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const initialState: CreateContainerFormState = { error: null, success: false };
  const [state, formAction, isPending] = useActionState(createContainerAction, initialState);

  const [name, setName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayIso);
  const [arrivalDate, setArrivalDate] = useState("");
  const [purchaseCny, setPurchaseCny] = useState("");
  const [rate, setRate] = useState(defaultRate ? String(defaultRate) : "");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [nextKey, setNextKey] = useState(2);
  const [rows, setRows] = useState<GridRow[]>([]);


  const [nextInvestmentKey, setNextInvestmentKey] = useState(2);
  const [investmentRows, setInvestmentRows] = useState<InvestmentRow[]>([]);

  const [nextExpenseKey, setNextExpenseKey] = useState(2);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productBySku = useMemo(() => new Map(products.map((p) => [p.sku, p])), [products]);
  const investorByName = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const inv of investors) {
      map.set(inv.name.trim().toLowerCase(), inv);
    }
    return map;
  }, [investors]);
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? products.filter((p) => `${p.sku} ${p.name} ${p.categoryName}`.toLowerCase().includes(q))
      : products;
    return list.slice().sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [products, search]);

  const containerItemsJson = useMemo(() => {
    const payload = rows
      .map((r) => {
        const quantity = Math.max(0, Math.floor(toNumber(r.quantity)));
        const unitPriceUSD = toNumber(r.unitPriceUSD);
        const lineTotalUSD = toNumber(r.totalAmountUSD);
        const cbm = toNumber(r.cbm);
        const kg = toNumber(r.kg);
        const totalCbm = toNumber(r.totalCbm);
        return {
          productId: r.productId,
          sizeLabel: String(r.saize ?? "").trim(),
          color: String(r.color ?? "").trim(),
          quantity,
          unitPriceUSD: unitPriceUSD > 0 ? unitPriceUSD : undefined,
          lineTotalUSD: lineTotalUSD > 0 ? lineTotalUSD : undefined,
          cbm: cbm > 0 ? cbm : undefined,
          kg: kg > 0 ? kg : undefined,
          totalCbm: totalCbm > 0 ? totalCbm : undefined,
        };
      })
      .filter((x) => x.productId && x.quantity > 0);
    return JSON.stringify(payload);
  }, [rows]);

  const investmentsJson = useMemo(() => {
    const payload = investmentRows
      .map((r) => ({
        investorId: r.investorId,
        investedAmountUSD: toNumber(r.investedAmountUSD),
        percentageShare: toNumber(r.percentageShare),
      }))
      .filter((x) => x.investorId && x.investedAmountUSD > 0);
    return JSON.stringify(payload);
  }, [investmentRows]);

  const expensesJson = useMemo(() => {
    const payload = expenseRows
      .map((r) => ({
        title: r.title,
        category: r.category,
        amountUSD: toNumber(r.amountUSD),
        description: r.description,
      }))
      .filter((x) => String(x.title ?? "").trim().length > 0 && x.amountUSD > 0);
    return JSON.stringify(payload);
  }, [expenseRows]);

  // Totals/footer removed by request.

  function updateRow(key: number, patch: Partial<GridRow>) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };

        if (patch.model !== undefined) {
          const sku = String(patch.model ?? "").trim();
          const hit = sku ? productBySku.get(sku) ?? null : null;
          if (hit) {
            next.productId = hit.id;
            if (!next.saize) next.saize = hit.size || "";
            if (!next.unitPriceUSD && hit.costPriceUSD > 0) next.unitPriceUSD = String(hit.costPriceUSD);
            if (!next.cbm && hit.cbm > 0) next.cbm = String(hit.cbm);
            if (!next.kg && hit.kg > 0) next.kg = String(hit.kg);
          }
        }

        if (patch.quantity !== undefined || patch.unitPriceUSD !== undefined) {
          if (!patch.totalAmountUSD) next.totalAmountUSD = calcLineTotal(next);
        }
        if (patch.quantity !== undefined || patch.cbm !== undefined) {
          next.totalCbm = calcTotalCbm(next);
        }
        if (patch.quantity !== undefined || patch.kg !== undefined) {
          next.nwKgs = calcNwKgs(next);
        }
        return next;
      }),
    );
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }


  function addProduct(product: ProductOption) {
    setRows((prev) => [
      ...prev,
      {
        key: nextKey,
        productId: product.id,
        model: product.sku,
        unitPriceUSD: product.costPriceUSD > 0 ? String(product.costPriceUSD) : "",
        saize: product.size || "",
        color: "",
        quantity: "1",
        totalAmountUSD: "",
        cbm: product.cbm > 0 ? String(product.cbm) : "",
        kg: product.kg > 0 ? String(product.kg) : "",
        totalCbm: "",
        nwKgs: "",
        totalAmount2: "",
      },
    ]);
    setNextKey((v) => v + 1);
  }

  function addBlankItemRow() {
    setRows((prev) => [
      ...prev,
      {
        key: nextKey,
        productId: "",
        model: "",
        unitPriceUSD: "",
        saize: "",
        color: "",
        quantity: "",
        totalAmountUSD: "",
        cbm: "",
        kg: "",
        totalCbm: "",
        nwKgs: "",
        totalAmount2: "",
      },
    ]);
    setNextKey((v) => v + 1);
  }

  function addInvestmentRow() {
    setInvestmentRows((prev) => [
      ...prev,
      { key: nextInvestmentKey, investorId: "", investorName: "", investedAmountUSD: "", percentageShare: "" },
    ]);
    setNextInvestmentKey((v) => v + 1);
  }

  function updateInvestmentRow(key: number, patch: Partial<InvestmentRow>) {
    setInvestmentRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        if (patch.investorName !== undefined) {
          const hit = investorByName.get(String(patch.investorName ?? "").trim().toLowerCase());
          if (hit) next.investorId = hit.id;
        }
        return next;
      }),
    );
  }

  function removeInvestmentRow(key: number) {
    setInvestmentRows((prev) => prev.filter((r) => r.key !== key));
  }

  function addExpenseRow() {
    setExpenseRows((prev) => [
      ...prev,
      { key: nextExpenseKey, title: "", category: "OTHER", amountUSD: "", description: "" },
    ]);
    setNextExpenseKey((v) => v + 1);
  }

  function updateExpenseRow(key: number, patch: Partial<ExpenseRow>) {
    setExpenseRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeExpenseRow(key: number) {
    setExpenseRows((prev) => prev.filter((r) => r.key !== key));
  }

  function splitClipboardTable(text: string) {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    while (lines.length && lines[lines.length - 1]?.trim() === "") lines.pop();
    return lines.map((l) => l.split("\t"));
  }

  function applyPasteToItems(startRowIndex: number, startColIndex: number, text: string) {
    const matrix = splitClipboardTable(text);
    if (!matrix.length) return;
    const pasteColumns = columns.filter((c) => c.id !== "picture").map((c) => c.id as keyof GridRow);

    setRows((prev) => {
      const next = [...prev];
      let keySeed = next.reduce((m, r) => Math.max(m, r.key), 0) + 1;
      while (next.length < startRowIndex + matrix.length) {
        next.push({
          key: keySeed++,
          productId: "",
          model: "",
          unitPriceUSD: "",
          saize: "",
          color: "",
          quantity: "",
          totalAmountUSD: "",
          cbm: "",
          kg: "",
          totalCbm: "",
          nwKgs: "",
          totalAmount2: "",
        });
      }

      for (let r = 0; r < matrix.length; r++) {
        const target = next[startRowIndex + r];
        if (!target) continue;
        const patch: Partial<GridRow> = {};
        for (let c = 0; c < matrix[r]!.length; c++) {
          const col = pasteColumns[startColIndex + c];
          if (!col) continue;
          const value = matrix[r]![c] ?? "";
          switch (col) {
            case "model":
              patch.model = value;
              break;
            case "unitPriceUSD":
              patch.unitPriceUSD = value;
              break;
            case "saize":
              patch.saize = value;
              break;
            case "color":
              patch.color = value;
              break;
            case "quantity":
              patch.quantity = value;
              break;
            case "totalAmountUSD":
              patch.totalAmountUSD = value;
              break;
            case "cbm":
              patch.cbm = value;
              break;
            case "kg":
              patch.kg = value;
              break;
            case "totalCbm":
              patch.totalCbm = value;
              break;
            case "nwKgs":
              patch.nwKgs = value;
              break;
            case "totalAmount2":
              patch.totalAmount2 = value;
              break;
            default:
              break;
          }
        }
        const merged = { ...target, ...patch };
        if (patch.model !== undefined) {
          const sku = String(patch.model ?? "").trim();
          const hit = sku ? productBySku.get(sku) ?? null : null;
          if (hit) {
            merged.productId = hit.id;
            if (!merged.saize) merged.saize = hit.size || "";
            if (!merged.unitPriceUSD && hit.costPriceUSD > 0) merged.unitPriceUSD = String(hit.costPriceUSD);
            if (!merged.cbm && hit.cbm > 0) merged.cbm = String(hit.cbm);
            if (!merged.kg && hit.kg > 0) merged.kg = String(hit.kg);
          }
        }
        if (patch.quantity !== undefined || patch.unitPriceUSD !== undefined) {
          if (!patch.totalAmountUSD) merged.totalAmountUSD = calcLineTotal(merged);
        }
        if (patch.quantity !== undefined || patch.cbm !== undefined) {
          merged.totalCbm = calcTotalCbm(merged);
        }
        if (patch.quantity !== undefined || patch.kg !== undefined) {
          merged.nwKgs = calcNwKgs(merged);
        }
        next[startRowIndex + r] = merged;
      }
      return next;
    });
  }

  function applyPasteToInvestors(startRowIndex: number, startColIndex: number, text: string) {
    const matrix = splitClipboardTable(text);
    if (!matrix.length) return;
    const cols: Array<keyof InvestmentRow> = ["investorName", "investedAmountUSD", "percentageShare"];

    setInvestmentRows((prev) => {
      const next = [...prev];
      let keySeed = next.reduce((m, r) => Math.max(m, r.key), 0) + 1;
      while (next.length < startRowIndex + matrix.length) {
        next.push({
          key: keySeed++,
          investorId: "",
          investorName: "",
          investedAmountUSD: "",
          percentageShare: "",
        });
      }

      for (let r = 0; r < matrix.length; r++) {
        const target = next[startRowIndex + r];
        if (!target) continue;
        const patch: Partial<InvestmentRow> = {};
        for (let c = 0; c < matrix[r]!.length; c++) {
          const col = cols[startColIndex + c];
          if (!col) continue;
          const value = matrix[r]![c] ?? "";
          if (col === "investorName") patch.investorName = value;
          if (col === "investedAmountUSD") patch.investedAmountUSD = value;
          if (col === "percentageShare") patch.percentageShare = value;
        }
        const merged = { ...target, ...patch };
        if (patch.investorName !== undefined) {
          const hit = investorByName.get(String(patch.investorName ?? "").trim().toLowerCase());
          if (hit) merged.investorId = hit.id;
        }
        next[startRowIndex + r] = merged;
      }
      return next;
    });
  }

  function applyPasteToExpenses(startRowIndex: number, startColIndex: number, text: string) {
    const matrix = splitClipboardTable(text);
    if (!matrix.length) return;
    const cols: Array<keyof ExpenseRow> = ["title", "category", "amountUSD", "description"];

    setExpenseRows((prev) => {
      const next = [...prev];
      let keySeed = next.reduce((m, r) => Math.max(m, r.key), 0) + 1;
      while (next.length < startRowIndex + matrix.length) {
        next.push({
          key: keySeed++,
          title: "",
          category: "OTHER",
          amountUSD: "",
          description: "",
        });
      }

      for (let r = 0; r < matrix.length; r++) {
        const target = next[startRowIndex + r];
        if (!target) continue;
        const patch: Partial<ExpenseRow> = {};
        for (let c = 0; c < matrix[r]!.length; c++) {
          const col = cols[startColIndex + c];
          if (!col) continue;
          const value = matrix[r]![c] ?? "";
          if (col === "category") {
            patch.category = value.trim().toUpperCase() as ExpenseRow["category"];
          } else if (col === "title") {
            patch.title = value;
          } else if (col === "amountUSD") {
            patch.amountUSD = value;
          } else if (col === "description") {
            patch.description = value;
          }
        }
        const merged: ExpenseRow = { ...target, ...patch };
        if (patch.category !== undefined) {
          const raw = String(patch.category ?? "").trim().toUpperCase();
          if (
            raw === "LOGISTICS" ||
            raw === "CUSTOMS" ||
            raw === "STORAGE" ||
            raw === "TRANSPORT" ||
            raw === "OTHER"
          ) {
            merged.category = raw as ExpenseRow["category"];
          } else {
            merged.category = "OTHER";
          }
        }
        next[startRowIndex + r] = merged;
      }
      return next;
    });
  }

  const columns: Array<{ id: keyof GridRow | "picture"; label: string; width: string }> = [
    { id: "model", label: "Модель (SKU)", width: "min-w-[180px]" },
    { id: "picture", label: "Фото", width: "min-w-[110px]" },
    { id: "unitPriceUSD", label: "Цена за ед. (USD)", width: "min-w-[150px]" },
    { id: "saize", label: "Размер", width: "min-w-[210px]" },
    { id: "color", label: "Цвет", width: "min-w-[200px]" },
    { id: "quantity", label: "Кол-во (шт/сет)", width: "min-w-[150px]" },
    { id: "totalAmountUSD", label: "Сумма (USD)", width: "min-w-[160px]" },
    { id: "cbm", label: "CBM", width: "min-w-[120px]" },
    { id: "kg", label: "KG", width: "min-w-[120px]" },
    { id: "totalCbm", label: "Итого CBM", width: "min-w-[140px]" },
    { id: "nwKgs", label: "Итого N.W. (KGS)", width: "min-w-[160px]" },
    { id: "totalAmount2", label: "Сумма (USD) 2", width: "min-w-[160px]" },
  ];

  const investmentColumns: Array<{ id: keyof InvestmentRow; label: string; width: string }> = [
    { id: "investorName", label: "Инвестор", width: "min-w-[280px]" },
    { id: "investedAmountUSD", label: "Вложено (USD)", width: "min-w-[180px]" },
    { id: "percentageShare", label: "% доли (необязательно)", width: "min-w-[200px]" },
  ];

  const expenseColumns: Array<{ id: keyof ExpenseRow; label: string; width: string }> = [
    { id: "title", label: "Название расхода", width: "min-w-[320px]" },
    { id: "category", label: "Категория", width: "min-w-[220px]" },
    { id: "amountUSD", label: "Сумма (USD)", width: "min-w-[180px]" },
    { id: "description", label: "Комментарий", width: "min-w-[420px]" },
  ];

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <form action={formAction} className="grid gap-3">
        <input type="hidden" name="investmentsJson" value={investmentsJson} />
        <input type="hidden" name="expensesJson" value={expensesJson} />
        <input type="hidden" name="containerItemsJson" value={containerItemsJson} />

        <div className="grid gap-2 md:grid-cols-5">
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Контейнер март 2026"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            name="purchaseDate"
            type="date"
            required
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            name="arrivalDate"
            type="date"
            value={arrivalDate}
            onChange={(e) => setArrivalDate(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            name="totalPurchaseCNY"
            type="number"
            min={0}
            step="0.01"
            required
            value={purchaseCny}
            onChange={(e) => setPurchaseCny(e.target.value)}
            placeholder="Закупка CNY"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            name="exchangeRate"
            type="number"
            min={0}
            step="0.0001"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="Курс CNY → USD"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Сохранение..." : "Сохранить"}
          </button>
        </div>

        {state.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Контейнер создан.
          </p>
        ) : null}

        </form>
      </article>

      <div className="grid min-h-0 grid-rows-[1fr_auto_auto] gap-4">
        <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Товары</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setPickerOpen(true);
                  setSearch("");
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Добавить товар
              </button>
              <button
                type="button"
                onClick={addBlankItemRow}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Пустая строка
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="min-w-[2400px]">
              <table className="w-full border-separate border-spacing-0 border border-[var(--border)] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--surface-soft)] text-slate-700">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.label}
                      className={`border-b border-r border-[var(--border)] px-2 py-2 font-semibold ${c.width}`}
                    >
                      {c.label}
                    </th>
                  ))}
                  <th className="min-w-[110px] border-b border-[var(--border)] px-2 py-2 font-semibold">—</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, rowIndex) => {
                  const product = r.productId ? productMap.get(r.productId) ?? null : null;
                  const pasteableCols = columns.filter((c) => c.id !== "picture");

                  return (
                    <tr key={r.key}>
                      {columns.map((c) => {
                        if (c.id === "picture") {
                          return (
                            <td key="picture" className="border-b border-r border-[var(--border)] px-2 py-1">
                              {product?.imagePath ? (
                                <Image
                                  src={product.imagePath}
                                  alt={product.name}
                                  width={40}
                                  height={40}
                                  className="h-10 w-10 rounded object-cover"
                                />
                              ) : (
                                <div className="h-10 w-10 rounded bg-slate-100" />
                              )}
                            </td>
                          );
                        }
                        const field = c.id as keyof GridRow;
                        const colIndex = pasteableCols.findIndex((x) => x.id === field);
                        return (
                          <td key={String(field)} className="border-b border-r border-[var(--border)] px-0">
                            <input
                              value={String(r[field] ?? "")}
                              onChange={(e) => updateRow(r.key, { [field]: e.target.value } as Partial<GridRow>)}
                              onPaste={(e) => {
                                const text = e.clipboardData.getData("text");
                                if (!text.includes("\t") && !text.includes("\n")) return;
                                e.preventDefault();
                                applyPasteToItems(rowIndex, Math.max(0, colIndex), text);
                              }}
                              className="w-full bg-white px-2.5 py-1.5 text-sm outline-none focus:bg-[#fffceb]"
                            />
                          </td>
                        );
                      })}
                      <td className="border-b border-[var(--border)] px-2 py-1">
                        <button
                          type="button"
                          onClick={() => removeRow(r.key)}
                          className="rounded border border-[var(--border)] px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!rows.length ? (
                  <tr>
                    <td className="px-3 py-10 text-center text-sm text-slate-500" colSpan={columns.length + 1}>
                      Таблица пустая. Нажмите «Добавить товар» или вставьте из Excel.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              </table>

            </div>
          </div>
        </article>

        <article className="flex max-h-[240px] min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Инвесторы</h2>
            <button
              type="button"
              onClick={addInvestmentRow}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Добавить строку
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 border border-[var(--border)] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--surface-soft)] text-slate-700">
                <tr>
                  {investmentColumns.map((c) => (
                    <th key={c.label} className={`border-b border-r border-[var(--border)] px-2 py-2 font-semibold ${c.width}`}>
                      {c.label}
                    </th>
                  ))}
                  <th className="min-w-[110px] border-b border-[var(--border)] px-2 py-2 font-semibold">—</th>
                </tr>
              </thead>
              <tbody>
                {investmentRows.map((r, rowIndex) => (
                  <tr key={r.key}>
                    {investmentColumns.map((c, colIndex) => {
                      const field = c.id;
                      if (field === "investorName") {
                        return (
                          <td key={field} className="border-b border-r border-[var(--border)] px-0">
                            <input
                              list="investor-names"
                              value={r.investorName}
                              onChange={(e) => updateInvestmentRow(r.key, { investorName: e.target.value })}
                              onPaste={(e) => {
                                const text = e.clipboardData.getData("text");
                                if (!text.includes("\t") && !text.includes("\n")) return;
                                e.preventDefault();
                                applyPasteToInvestors(rowIndex, colIndex, text);
                              }}
                              className="w-full bg-white px-2.5 py-1.5 text-sm outline-none focus:bg-[#fffceb]"
                              placeholder="Имя инвестора"
                            />
                          </td>
                        );
                      }
                      return (
                        <td key={field} className="border-b border-r border-[var(--border)] px-0">
                          <input
                            value={String(r[field] ?? "")}
                            onChange={(e) =>
                              updateInvestmentRow(r.key, { [field]: e.target.value } as Partial<InvestmentRow>)
                            }
                            onPaste={(e) => {
                              const text = e.clipboardData.getData("text");
                              if (!text.includes("\t") && !text.includes("\n")) return;
                              e.preventDefault();
                              applyPasteToInvestors(rowIndex, colIndex, text);
                            }}
                            className="w-full bg-white px-2.5 py-1.5 text-sm outline-none focus:bg-[#fffceb]"
                          />
                        </td>
                      );
                    })}
                    <td className="border-b border-[var(--border)] px-2 py-1">
                      <button
                        type="button"
                        onClick={() => removeInvestmentRow(r.key)}
                        className="rounded border border-[var(--border)] px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
                {!investmentRows.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={investmentColumns.length + 1}>
                      Нет строк. Нажмите «Добавить строку» или вставьте из Excel.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <datalist id="investor-names">
              {investors.map((inv) => (
                <option key={inv.id} value={inv.name} />
              ))}
            </datalist>
          </div>
        </article>

        <article className="flex max-h-[260px] min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Расходы</h2>
            <button
              type="button"
              onClick={addExpenseRow}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Добавить строку
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 border border-[var(--border)] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--surface-soft)] text-slate-700">
                <tr>
                  {expenseColumns.map((c) => (
                    <th key={c.label} className={`border-b border-r border-[var(--border)] px-2 py-2 font-semibold ${c.width}`}>
                      {c.label}
                    </th>
                  ))}
                  <th className="min-w-[110px] border-b border-[var(--border)] px-2 py-2 font-semibold">—</th>
                </tr>
              </thead>
              <tbody>
                {expenseRows.map((r, rowIndex) => (
                  <tr key={r.key}>
                    {expenseColumns.map((c, colIndex) => {
                      const field = c.id;
                      if (field === "category") {
                        return (
                          <td key={field} className="border-b border-r border-[var(--border)] px-0">
                            <select
                              value={r.category}
                              onChange={(e) => updateExpenseRow(r.key, { category: e.target.value as ExpenseRow["category"] })}
                              onPaste={(e) => {
                                const text = e.clipboardData.getData("text");
                                if (!text.includes("\t") && !text.includes("\n")) return;
                                e.preventDefault();
                                applyPasteToExpenses(rowIndex, colIndex, text);
                              }}
                              className="w-full bg-white px-2.5 py-1.5 text-sm outline-none focus:bg-[#fffceb]"
                            >
                              <option value="LOGISTICS">LOGISTICS</option>
                              <option value="CUSTOMS">CUSTOMS</option>
                              <option value="STORAGE">STORAGE</option>
                              <option value="TRANSPORT">TRANSPORT</option>
                              <option value="OTHER">OTHER</option>
                            </select>
                          </td>
                        );
                      }
                      return (
                        <td key={field} className="border-b border-r border-[var(--border)] px-0">
                          <input
                            value={String(r[field] ?? "")}
                            onChange={(e) => updateExpenseRow(r.key, { [field]: e.target.value } as Partial<ExpenseRow>)}
                            onPaste={(e) => {
                              const text = e.clipboardData.getData("text");
                              if (!text.includes("\t") && !text.includes("\n")) return;
                              e.preventDefault();
                              applyPasteToExpenses(rowIndex, colIndex, text);
                            }}
                            className="w-full bg-white px-2.5 py-1.5 text-sm outline-none focus:bg-[#fffceb]"
                          />
                        </td>
                      );
                    })}
                    <td className="border-b border-[var(--border)] px-2 py-1">
                      <button
                        type="button"
                        onClick={() => removeExpenseRow(r.key)}
                        className="rounded border border-[var(--border)] px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
                {!expenseRows.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={expenseColumns.length + 1}>
                      Нет строк. Нажмите «Добавить строку» или вставьте из Excel.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      {pickerOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setPickerOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-base font-semibold text-slate-900">Выберите товар</h4>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск: SKU / название / категория"
              className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <div className="mt-3 max-h-[60vh] overflow-auto rounded-xl border border-[var(--border)]">
              {filteredProducts.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => {
                    addProduct(p);
                    setPickerOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="truncate font-medium text-slate-800">
                    {p.sku} — {p.name}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{p.categoryName}</span>
                </button>
              ))}
              {!filteredProducts.length ? <p className="px-3 py-3 text-sm text-slate-500">Ничего не найдено.</p> : null}
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
