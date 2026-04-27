"use client";

import Image from "next/image";
import { useActionState, useMemo, useRef, useState } from "react";
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
  percentageShare: string;
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

type ExcelDraftRow = {
  key: number;
  include: boolean;
  sku: string;
  name: string;
  size: string;
  color: string;
  quantity: string;
  unitPriceUSD: string;
  salePriceUSD: string;
  cbm: string;
  kg: string;
  imageFile: File | null;
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
  const [localProducts, setLocalProducts] = useState<ProductOption[]>(() => products);
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const [importPending, setImportPending] = useState(false);
  const [importError, setImportError] = useState("");
  const [excelPreviewOpen, setExcelPreviewOpen] = useState(false);
  const [excelPreviewCloseConfirmOpen, setExcelPreviewCloseConfirmOpen] = useState(false);
  const [excelDraftRows, setExcelDraftRows] = useState<ExcelDraftRow[]>([]);
  const [excelDraftNextKey, setExcelDraftNextKey] = useState(1);

  const [investorNextKey, setInvestorNextKey] = useState(2);
  const [investorRows, setInvestorRows] = useState<InvestorRow[]>([{ key: 1, investorId: "", investedAmountUSD: "", percentageShare: "" }]);

  const [itemNextKey, setItemNextKey] = useState(2);
  const [editingPriceForKey, setEditingPriceForKey] = useState<number | null>(null);
  const [editingDetailsForKey, setEditingDetailsForKey] = useState<number | null>(null);
  const [itemRows, setItemRows] = useState<ItemRow[]>([]);
  const [isItemsDropActive, setIsItemsDropActive] = useState(false);

  const [purchaseCny, setPurchaseCny] = useState("");
  const [rate, setRate] = useState(defaultRate ? String(defaultRate) : "");
  const [arrivalDate, setArrivalDate] = useState("");
  const purchaseCnyNumber = Number(purchaseCny || 0);
  const rateNumber = Number(rate || 0);
  const purchaseUsdFromCurrency = purchaseCnyNumber * rateNumber;
  const investmentsPayload = useMemo(
    () =>
      investorRows
        .map((row) => ({
          investorId: row.investorId,
          investedAmountUSD: Number(row.investedAmountUSD || 0),
          percentageShare: Number(row.percentageShare || 0),
        }))
        .filter((row) => row.investorId && row.investedAmountUSD > 0),
    [investorRows],
  );
  const productMap = useMemo(() => new Map(localProducts.map((product) => [product.id, product])), [localProducts]);

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
  const expectedInvestmentsUsd = totalPurchaseUsd;
  const diff = investedTotal - expectedInvestmentsUsd;
  const hasMismatch = Math.abs(diff) >= 0.01;
  const editingDetailsRow = editingDetailsForKey === null ? null : itemRows.find((row) => row.key === editingDetailsForKey) ?? null;
  const editingPriceRow = editingPriceForKey === null ? null : itemRows.find((row) => row.key === editingPriceForKey) ?? null;

	  const groupedProducts = useMemo(() => {
	    const normalizedSearch = search.trim().toLowerCase();
	    const map = new Map<string, ProductOption[]>();
	    const filtered = localProducts.filter((product) => {
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
	  }, [localProducts, search]);

  function updateInvestorRow(key: number, patch: Partial<InvestorRow>) {
    setInvestorRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addInvestorRow() {
    setInvestorRows((prev) => [...prev, { key: investorNextKey, investorId: "", investedAmountUSD: "", percentageShare: "" }]);
    setInvestorNextKey((value) => value + 1);
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

  function openExcelPicker() {
    if (importPending) return;
    setImportError("");
    excelInputRef.current?.click();
  }

  function requestCloseExcelPreview() {
    setExcelPreviewCloseConfirmOpen(true);
  }

  function closeExcelPreview() {
    setExcelPreviewCloseConfirmOpen(false);
    setExcelPreviewOpen(false);
    setExcelDraftRows([]);
    setExcelDraftNextKey(1);
  }

  function updateExcelDraftRow(key: number, patch: Partial<ExcelDraftRow>) {
    setExcelDraftRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeExcelDraftRow(key: number) {
    setExcelDraftRows((prev) => prev.filter((row) => row.key !== key));
  }

  async function parseExcelToDraft(file: File) {
    setImportPending(true);
    setImportError("");

    try {
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());

      const normalizeText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
      const cellValue = (value: unknown) => {
        if (!value) return null;
        if (typeof value === "object" && value !== null) {
          if ("result" in value) return (value as { result: unknown }).result ?? null;
          if ("text" in value) return (value as { text: unknown }).text ?? null;
          if ("richText" in value) {
            const parts = (value as { richText: Array<{ text: string }> }).richText ?? [];
            return parts.map((p) => p.text).join("");
          }
        }
        return value;
      };
      const toNumberSafe = (value: unknown) => {
        const raw = cellValue(value);
        if (typeof raw === "number" && Number.isFinite(raw)) return raw;
        const n = Number(normalizeText(raw).replace(",", "."));
        return Number.isFinite(n) ? n : 0;
      };

      const looksLikeImportSheet = (ws: (typeof wb.worksheets)[number]) => {
        const headerCell = ws.getRow(3).getCell(2).value;
        const header = normalizeText(cellValue(headerCell)).toLowerCase();
        return header.includes("model");
      };

      const ws = wb.worksheets.find(looksLikeImportSheet) ?? wb.worksheets[0];
      if (!ws) throw new Error("Лист Excel не найден.");

      const imageByRow = new Map<number, File>();
      for (const ref of ws.getImages()) {
        const imageId = typeof ref.imageId === "number" ? ref.imageId : Number(ref.imageId);
        const img = wb.getImage(Number.isFinite(imageId) ? imageId : (ref.imageId as unknown as number)) as {
          extension?: string;
          buffer?: Uint8Array | ArrayBuffer;
        };
        const rowIndex = (ref.range?.tl?.nativeRow ?? 0) + 1;
        const ext = String(img.extension ?? "png").toLowerCase();
        const mime =
          ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "webp"
              ? "image/webp"
              : ext === "gif"
                ? "image/gif"
                : "image/png";

        const buf = img.buffer;
        if (!buf) continue;
        const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
        // Some environments type this as Uint8Array<SharedArrayBuffer>; force a plain ArrayBuffer-backed view.
        const safeBytes = new Uint8Array(bytes.byteLength);
        safeBytes.set(bytes);
        const fileName = `excel-${rowIndex}.${ext === "jpeg" ? "jpg" : ext}`;
        imageByRow.set(rowIndex, new File([safeBytes], fileName, { type: mime }));
      }

      type ParsedRow = {
        sku: string;
        name: string;
        size: string;
        color: string;
        quantity: number;
        unitPriceUSD: number;
        salePriceUSD: number;
        cbm: number;
        kg: number;
        imageFile?: File | null;
      };

      const parsed: ParsedRow[] = [];
      let emptyStreak = 0;
      for (let r = 4; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);

        const skuPrimary = normalizeText(cellValue(row.getCell(5).value));
        const skuFallback = normalizeText(cellValue(row.getCell(2).value));
        const sku = skuPrimary || skuFallback;

        if (!sku) {
          emptyStreak += 1;
          if (emptyStreak >= 15) break;
          continue;
        }
        emptyStreak = 0;

        const brand = normalizeText(cellValue(row.getCell(4).value));
        const size = normalizeText(cellValue(row.getCell(8).value)) || "Без размера";
        const color = normalizeText(cellValue(row.getCell(9).value));
        const quantity = Math.max(0, Math.floor(toNumberSafe(row.getCell(10).value)));
        const unitPriceUSD = toNumberSafe(row.getCell(7).value);
        const salePriceUSD = toNumberSafe(row.getCell(43).value) || unitPriceUSD;
        const cbm = toNumberSafe(row.getCell(12).value);
        const kg = toNumberSafe(row.getCell(13).value);
        const name = normalizeText(skuPrimary || skuFallback) || sku;
        const decoratedName = brand ? `${brand} ${name}` : name;

        if (!quantity || !unitPriceUSD) continue;

        parsed.push({
          sku,
          name: decoratedName,
          size,
          color,
          quantity,
          unitPriceUSD,
          salePriceUSD,
          cbm,
          kg,
          imageFile: imageByRow.get(r) ?? null,
        });
      }

      if (parsed.length === 0) {
        throw new Error("Не нашли строки товаров (проверьте формат файла).");
      }

      const draft: ExcelDraftRow[] = [];
      let nextKey = excelDraftNextKey;
      for (const row of parsed) {
        draft.push({
          key: nextKey,
          include: true,
          sku: row.sku,
          name: row.name,
          size: row.size,
          color: row.color,
          quantity: String(row.quantity),
          unitPriceUSD: row.unitPriceUSD > 0 ? String(row.unitPriceUSD) : "",
          salePriceUSD: row.salePriceUSD > 0 ? String(row.salePriceUSD) : "",
          cbm: row.cbm > 0 ? String(row.cbm) : "",
          kg: row.kg > 0 ? String(row.kg) : "",
          imageFile: row.imageFile ?? null,
        });
        nextKey += 1;
      }

      setExcelDraftRows(draft);
      setExcelDraftNextKey(nextKey);
      setExcelPreviewOpen(true);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Ошибка импорта Excel.");
    } finally {
      setImportPending(false);
    }
  }

  async function confirmExcelImport() {
    setImportPending(true);
    setImportError("");

    try {
      const cleaned = excelDraftRows
        .filter((row) => row.include)
        .map((row) => ({
          sku: row.sku.trim(),
          name: row.name.trim(),
          size: row.size.trim() || "Без размера",
          color: row.color.trim(),
          quantity: Math.floor(toNumber(row.quantity)),
          unitPriceUSD: toNumber(row.unitPriceUSD),
          salePriceUSD: toNumber(row.salePriceUSD),
          cbm: toNumber(row.cbm),
          kg: toNumber(row.kg),
          imageFile: row.imageFile,
        }))
        .filter((row) => row.sku && row.name && row.quantity > 0 && row.unitPriceUSD > 0);

      if (cleaned.length === 0) {
        throw new Error("Нет товаров для импорта (проверьте SKU/название/кол-во/цену).");
      }

      const form = new FormData();
      const rowsForServer = cleaned.map((row, idx) => {
        const imageKey = row.imageFile ? `img_${idx}_${row.sku}` : null;
        if (imageKey && row.imageFile) {
          form.set(imageKey, row.imageFile);
        }
        return {
          sku: row.sku,
          name: row.name,
          size: row.size,
          color: row.color || null,
          costPriceUSD: row.unitPriceUSD,
          cbm: row.cbm > 0 ? row.cbm : null,
          kg: row.kg > 0 ? row.kg : null,
          salePriceUSD: row.salePriceUSD > 0 ? row.salePriceUSD : row.unitPriceUSD,
          imageKey,
        };
      });
      form.set("rowsJson", JSON.stringify(rowsForServer));

      const response = await fetch("/api/products/import-from-excel", { method: "POST", body: form });
      const data = (await response.json()) as
        | {
            ok: true;
            products: Array<{
              id: string;
              sku: string;
              name: string;
              size: string;
              color: string | null;
              imagePath: string | null;
              costPriceUSD: number;
              cbm: number | null;
              kg: number | null;
              basePriceUSD: number;
            }>;
          }
        | { ok: false; error: string };

      if (!response.ok || !data.ok) {
        throw new Error((data as { ok: false; error: string }).error || "Не удалось импортировать товары.");
      }

      const imported = data.products;
      const bySku = new Map(imported.map((p) => [p.sku, p]));

      setLocalProducts((prev) => {
        const next = [...prev];
        const indexBySku = new Map(next.map((p, i) => [p.sku, i]));
        for (const p of imported) {
          const idx = indexBySku.get(p.sku);
          const mapped: ProductOption = {
            id: p.id,
            sku: p.sku,
            name: p.name,
            size: p.size,
            imagePath: p.imagePath,
            costPriceUSD: p.costPriceUSD,
            cbm: p.cbm ?? 0,
            kg: p.kg ?? 0,
            basePriceUSD: p.basePriceUSD,
            categoryName: "Без категории",
          };
          if (idx === undefined) {
            next.push(mapped);
            indexBySku.set(p.sku, next.length - 1);
          } else {
            next[idx] = { ...next[idx], ...mapped };
          }
        }
        return next;
      });

      setItemRows(() => {
        const next: ItemRow[] = [];
        let key = 1;
        for (const row of cleaned) {
          const product = bySku.get(row.sku);
          if (!product) continue;
          const item: ItemRow = {
            key,
            productId: product.id,
            sizeLabel: row.size,
            color: row.color,
            quantity: String(row.quantity),
            unitPriceUSD: row.unitPriceUSD > 0 ? String(row.unitPriceUSD) : "",
            salePriceUSD: row.salePriceUSD > 0 ? String(row.salePriceUSD) : "",
            lineTotalUSD: "",
            cbm: row.cbm > 0 ? String(row.cbm) : "",
            kg: row.kg > 0 ? String(row.kg) : "",
            totalCbm: "",
          };
          item.totalCbm = recalcTotalCbm(item);
          next.push(item);
          key += 1;
        }
        setItemNextKey(key);
        return next;
      });

      setExcelPreviewOpen(false);
      setExcelDraftRows([]);
      setItemsModalOpen(true);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Ошибка импорта Excel.");
    } finally {
      setImportPending(false);
    }
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
              Заполните закупку, товары и инвесторов.
            </p>

            <form action={formAction} className="mt-4 grid gap-3">
              <div className="grid gap-2 md:grid-cols-5">
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
                  placeholder="Курс CNY → USD"
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
              <p className="text-xs text-slate-500">
                Курс можно оставить пустым: система возьмет актуальный курс из настроек валюты.
              </p>

	              <div className="rounded-xl border border-[var(--border)] p-3">
	                <div className="mb-2 flex items-center justify-between gap-2">
	                  <p className="text-sm font-medium text-slate-800">Товары контейнера</p>
	                  <div className="flex items-center gap-2">
	                    <button
	                      type="button"
	                      onClick={() => setItemsModalOpen(true)}
	                      className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
	                    >
	                      Добавить товар
	                    </button>
	                    <button
	                      type="button"
	                      onClick={openExcelPicker}
	                      disabled={importPending}
	                      className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
	                    >
	                      {importPending ? "Импорт..." : "Импорт из Excel"}
	                    </button>
	                    <input
	                      ref={excelInputRef}
	                      type="file"
	                      accept=".xlsx"
	                      className="hidden"
	                      onChange={(event) => {
	                        const file = event.target.files?.[0];
	                        event.target.value = "";
	                        if (file) void parseExcelToDraft(file);
	                      }}
	                    />
	                  </div>
	                </div>
	                <p className="text-xs text-slate-500">
	                  Добавлено позиций: <span className="font-semibold text-slate-700">{itemRows.length}</span>
	                </p>
	                {importError ? (
	                  <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
	                    {importError}
	                  </p>
	                ) : null}
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
                        className="md:col-span-6"
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
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.percentageShare ?? ""}
                        onChange={(event) => updateInvestorRow(row.key, { percentageShare: event.target.value })}
                        placeholder="Процент % (необязательно)"
                        className="md:col-span-3 rounded border border-[var(--border)] px-2 py-2 text-sm"
                      />
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
          setItemsModalOpen(false);
          setExcelPreviewOpen(false);
          setExcelPreviewCloseConfirmOpen(false);
          setExcelDraftRows([]);
          setImportError("");
          setOpen(false);
        }}
      />

      <CustomConfirmDialog
        open={excelPreviewCloseConfirmOpen}
        title="Закрыть импорт Excel"
        message="Список импортируемых товаров будет потерян. Закрыть окно?"
        confirmLabel="Закрыть"
        cancelLabel="Остаться"
        danger
        pending={importPending}
        onCancel={() => setExcelPreviewCloseConfirmOpen(false)}
        onConfirm={closeExcelPreview}
      />

      {excelPreviewOpen ? (
        <div className="fixed inset-0 z-[70] bg-slate-900/50 p-4" onClick={requestCloseExcelPreview}>
          <div
            className="mx-auto flex max-h-[95vh] w-full max-w-6xl flex-col overflow-auto rounded-2xl bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-base font-semibold text-slate-900">Импорт товаров из Excel</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Проверьте список, измените данные или удалите строки перед добавлением в контейнер.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={requestCloseExcelPreview}
                  disabled={importPending}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => void confirmExcelImport()}
                  disabled={importPending}
                  className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {importPending ? "Импорт..." : "Подтвердить"}
                </button>
              </div>
            </div>

            {importError ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {importError}
              </p>
            ) : null}

            <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--surface-soft)] text-slate-600">
                  <tr>
                    <th className="px-2 py-2 font-medium">+</th>
                    <th className="px-2 py-2 font-medium">SKU</th>
                    <th className="px-2 py-2 font-medium">Название</th>
                    <th className="px-2 py-2 font-medium">Размер</th>
                    <th className="px-2 py-2 font-medium">Цвет</th>
                    <th className="px-2 py-2 font-medium">QTY</th>
                    <th className="px-2 py-2 font-medium">Цена</th>
                    <th className="px-2 py-2 font-medium">Продажа</th>
                    <th className="px-2 py-2 font-medium">CBM</th>
                    <th className="px-2 py-2 font-medium">KG</th>
                    <th className="px-2 py-2 font-medium">Фото</th>
                    <th className="px-2 py-2 font-medium">Удалить</th>
                  </tr>
                </thead>
                <tbody>
                  {excelDraftRows.map((row) => (
                    <tr key={row.key} className="border-t border-[var(--border)] align-top">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={(e) => updateExcelDraftRow(row.key, { include: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.sku}
                          onChange={(e) => updateExcelDraftRow(row.key, { sku: e.target.value })}
                          className="w-28 rounded border border-[var(--border)] px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.name}
                          onChange={(e) => updateExcelDraftRow(row.key, { name: e.target.value })}
                          className="w-64 rounded border border-[var(--border)] px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.size}
                          onChange={(e) => updateExcelDraftRow(row.key, { size: e.target.value })}
                          className="w-32 rounded border border-[var(--border)] px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.color}
                          onChange={(e) => updateExcelDraftRow(row.key, { color: e.target.value })}
                          className="w-32 rounded border border-[var(--border)] px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.quantity}
                          onChange={(e) => updateExcelDraftRow(row.key, { quantity: e.target.value })}
                          type="number"
                          min={0}
                          step={1}
                          className="w-20 rounded border border-[var(--border)] px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.unitPriceUSD}
                          onChange={(e) => updateExcelDraftRow(row.key, { unitPriceUSD: e.target.value })}
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-24 rounded border border-[var(--border)] px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.salePriceUSD}
                          onChange={(e) => updateExcelDraftRow(row.key, { salePriceUSD: e.target.value })}
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-24 rounded border border-[var(--border)] px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.cbm}
                          onChange={(e) => updateExcelDraftRow(row.key, { cbm: e.target.value })}
                          type="number"
                          min={0}
                          step="0.0001"
                          className="w-24 rounded border border-[var(--border)] px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.kg}
                          onChange={(e) => updateExcelDraftRow(row.key, { kg: e.target.value })}
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-24 rounded border border-[var(--border)] px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-2 text-slate-700">{row.imageFile ? "есть" : "—"}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => removeExcelDraftRow(row.key)}
                          className="rounded border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                        >
                          X
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!excelDraftRows.length ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-slate-500" colSpan={12}>
                        Нет строк для импорта.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {itemsModalOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-900/50" onClick={requestCloseMainModal}>
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
	                    const productName = localProducts.find((product) => product.id === row.productId)?.name ?? "";
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
