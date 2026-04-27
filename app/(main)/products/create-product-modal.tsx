"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createProductAction } from "@/app/(main)/products/actions";
import { CustomConfirmDialog } from "@/components/custom-confirm-dialog";
import { CustomSelect } from "@/components/custom-select";

type ProductSizeItem = {
  id: string;
  name: string;
};

type ProductCategoryItem = {
  id: string;
  name: string;
  description?: string | null;
};

type CreateProductModalProps = {
  existingSizes: ProductSizeItem[];
  categories: ProductCategoryItem[];
};

type SizeApiResponse = {
  ok?: boolean;
  size?: ProductSizeItem;
  sizes?: ProductSizeItem[];
  error?: string;
};

type ExcelDraftProductRow = {
  key: number;
  include: boolean;
  sku: string;
  name: string;
  categoryId: string;
  size: string;
  color: string;
  costPriceUSD: string;
  cbm: string;
  kg: string;
  salePriceUSD: string;
  imageFile: File | null;
};

export function CreateProductModal({ existingSizes, categories }: CreateProductModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [sizeMiniModalOpen, setSizeMiniModalOpen] = useState(false);
  const [categoryMiniModalOpen, setCategoryMiniModalOpen] = useState(false);
  const [sizesModalOpen, setSizesModalOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const [localSizes, setLocalSizes] = useState(existingSizes);
  const [localCategories, setLocalCategories] = useState(categories);

  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const [importPending, setImportPending] = useState(false);
  const [importError, setImportError] = useState("");
  const [excelPreviewOpen, setExcelPreviewOpen] = useState(false);
  const [excelPreviewCloseConfirmOpen, setExcelPreviewCloseConfirmOpen] = useState(false);
  const [excelDraftRows, setExcelDraftRows] = useState<ExcelDraftProductRow[]>([]);
  const [excelDraftNextKey, setExcelDraftNextKey] = useState(1);
  const [excelDefaultCategoryId, setExcelDefaultCategoryId] = useState("");

  const [newSizeName, setNewSizeName] = useState("");
  const [sizeError, setSizeError] = useState("");
  const [sizeSaving, setSizeSaving] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);

  const [managerNewSize, setManagerNewSize] = useState("");
  const [managerError, setManagerError] = useState("");
  const [managerSaving, setManagerSaving] = useState(false);

  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");

  const sizeOptions = useMemo(
    () => localSizes.map((size) => ({ value: size.name, label: size.name })),
    [localSizes],
  );
  const categoryOptions = useMemo(
    () => [{ value: "", label: "Без категории" }, ...localCategories.map((category) => ({ value: category.id, label: category.name }))],
    [localCategories],
  );

  function upsertLocalSize(size: ProductSizeItem) {
    setLocalSizes((prev) => {
      const withoutCurrent = prev.filter((item) => item.id !== size.id);
      return [...withoutCurrent, size].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    });
  }

  function upsertLocalCategory(category: ProductCategoryItem) {
    setLocalCategories((prev) => {
      const withoutCurrent = prev.filter((item) => item.id !== category.id);
      return [...withoutCurrent, category].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    });
  }

  async function createSize(name: string, onSuccess?: (created: ProductSizeItem) => void) {
    const trimmed = name.trim();
    if (!trimmed) {
      return { ok: false, error: "Введите название размера." } as const;
    }

    const response = await fetch("/api/product-sizes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });

    const data = (await response.json()) as SizeApiResponse;
    if (!response.ok || !data.size) {
      return { ok: false, error: data.error ?? "Не удалось сохранить размер." } as const;
    }

    upsertLocalSize(data.size);
    onSuccess?.(data.size);
    return { ok: true } as const;
  }

  async function createCategory(onSuccess?: (created: ProductCategoryItem) => void) {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      setCategoryError("Введите название категории.");
      return { ok: false } as const;
    }

    const response = await fetch("/api/product-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmedName, description: newCategoryDescription.trim() }),
    });

    const data = (await response.json()) as { ok?: boolean; category?: ProductCategoryItem; error?: string };
    if (!response.ok || !data.ok || !data.category) {
      setCategoryError(data.error ?? "Не удалось сохранить категорию.");
      return { ok: false } as const;
    }

    upsertLocalCategory(data.category);
    onSuccess?.(data.category);
    return { ok: true } as const;
  }

  async function createCategoryFromMiniModal() {
    setCategorySaving(true);
    setCategoryError("");
    try {
      const result = await createCategory((created) => {
        setSelectedCategoryId(created.id);
        setExcelDefaultCategoryId(created.id);
        setNewCategoryName("");
        setNewCategoryDescription("");
        setCategoryMiniModalOpen(false);
      });
      if (!result.ok) return;
    } catch {
      setCategoryError("Ошибка сети. Попробуйте снова.");
    } finally {
      setCategorySaving(false);
    }
  }

  async function createSizeFromMiniModal() {
    setSizeSaving(true);
    setSizeError("");
    try {
      const result = await createSize(newSizeName, (created) => {
        setSelectedSize(created.name);
        setNewSizeName("");
        setSizeMiniModalOpen(false);
      });
      if (!result.ok) {
        setSizeError(result.error);
      }
    } catch {
      setSizeError("Ошибка сети. Попробуйте снова.");
    } finally {
      setSizeSaving(false);
    }
  }

  async function createSizeFromManager() {
    setManagerSaving(true);
    setManagerError("");
    try {
      const result = await createSize(managerNewSize, () => {
        setManagerNewSize("");
      });
      if (!result.ok) {
        setManagerError(result.error);
      }
    } catch {
      setManagerError("Ошибка сети. Попробуйте снова.");
    } finally {
      setManagerSaving(false);
    }
  }

  async function saveSizeEdit() {
    if (!editingId || !editingName.trim()) {
      setManagerError("Введите название размера.");
      return;
    }

    setManagerSaving(true);
    setManagerError("");
    try {
      const response = await fetch("/api/product-sizes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, name: editingName.trim() }),
      });
      const data = (await response.json()) as SizeApiResponse;
      if (!response.ok || !data.size) {
        setManagerError(data.error ?? "Не удалось изменить размер.");
        return;
      }

      const previous = localSizes.find((item) => item.id === editingId);
      upsertLocalSize(data.size);
      if (previous?.name === selectedSize) {
        setSelectedSize(data.size.name);
      }
      setEditingId("");
      setEditingName("");
    } catch {
      setManagerError("Ошибка сети. Попробуйте снова.");
    } finally {
      setManagerSaving(false);
    }
  }

  async function deleteSize(id: string) {
    setManagerSaving(true);
    setManagerError("");
    try {
      const target = localSizes.find((item) => item.id === id);
      const response = await fetch("/api/product-sizes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await response.json()) as SizeApiResponse;
      if (!response.ok) {
        setManagerError(data.error ?? "Не удалось удалить размер.");
        return;
      }

      setLocalSizes((prev) => prev.filter((item) => item.id !== id));
      if (target?.name === selectedSize) {
        setSelectedSize("");
      }
    } catch {
      setManagerError("Ошибка сети. Попробуйте снова.");
    } finally {
      setManagerSaving(false);
    }
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
    setExcelDefaultCategoryId("");
    setImportError("");
  }

  function updateExcelDraftRow(key: number, patch: Partial<ExcelDraftProductRow>) {
    setExcelDraftRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeExcelDraftRow(key: number) {
    setExcelDraftRows((prev) => prev.filter((row) => row.key !== key));
  }

  function applyDefaultCategoryToDraft() {
    setExcelDraftRows((prev) => prev.map((row) => ({ ...row, categoryId: excelDefaultCategoryId })));
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
        const safeBytes = new Uint8Array(bytes.byteLength);
        safeBytes.set(bytes);
        const fileName = `excel-${rowIndex}.${ext === "jpeg" ? "jpg" : ext}`;
        imageByRow.set(rowIndex, new File([safeBytes], fileName, { type: mime }));
      }

      const draft: ExcelDraftProductRow[] = [];
      let nextKey = excelDraftNextKey;
      let emptyStreak = 0;
      const defaultCategoryId = selectedCategoryId;
      setExcelDefaultCategoryId(defaultCategoryId);

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
        const costPriceUSD = toNumberSafe(row.getCell(7).value);
        const cbm = toNumberSafe(row.getCell(12).value);
        const kg = toNumberSafe(row.getCell(13).value);
        const salePriceUSD = toNumberSafe(row.getCell(43).value) || costPriceUSD;
        const name = brand ? `${brand} ${sku}` : sku;

        if (!costPriceUSD || !salePriceUSD) continue;

        draft.push({
          key: nextKey,
          include: true,
          sku,
          name,
          categoryId: defaultCategoryId,
          size,
          color,
          costPriceUSD: String(costPriceUSD),
          cbm: cbm > 0 ? String(cbm) : "",
          kg: kg > 0 ? String(kg) : "",
          salePriceUSD: String(salePriceUSD),
          imageFile: imageByRow.get(r) ?? null,
        });
        nextKey += 1;
      }

      if (!draft.length) throw new Error("Не нашли строки товаров (проверьте формат файла).");

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
      const toNumber = (value: string) => {
        const normalized = String(value ?? "").trim().replace(",", ".");
        const n = Number(normalized);
        return Number.isFinite(n) ? n : 0;
      };

      const cleaned = excelDraftRows
        .filter((row) => row.include)
        .map((row) => ({
          sku: row.sku.trim(),
          name: row.name.trim(),
          categoryId: row.categoryId.trim(),
          size: row.size.trim() || "Без размера",
          color: row.color.trim(),
          costPriceUSD: toNumber(row.costPriceUSD),
          cbm: toNumber(row.cbm),
          kg: toNumber(row.kg),
          salePriceUSD: toNumber(row.salePriceUSD),
          imageFile: row.imageFile,
        }))
        .filter((row) => row.sku && row.name && row.costPriceUSD > 0 && row.salePriceUSD > 0);

      if (!cleaned.length) {
        throw new Error("Нет товаров для импорта (проверьте SKU/название/цены).");
      }

      const form = new FormData();
      const rowsForServer = cleaned.map((row, idx) => {
        const imageKey = row.imageFile ? `img_${idx}_${row.sku}` : null;
        if (imageKey && row.imageFile) form.set(imageKey, row.imageFile);
        return {
          sku: row.sku,
          name: row.name,
          categoryId: row.categoryId || null,
          size: row.size,
          color: row.color || null,
          costPriceUSD: row.costPriceUSD,
          cbm: row.cbm > 0 ? row.cbm : null,
          kg: row.kg > 0 ? row.kg : null,
          salePriceUSD: row.salePriceUSD,
          imageKey,
        };
      });
      form.set("rowsJson", JSON.stringify(rowsForServer));

      const response = await fetch("/api/products/import-from-excel", { method: "POST", body: form });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Не удалось импортировать товары.");
      }

      closeExcelPreview();
      setOpen(false);
      setConfirmCloseOpen(false);
      router.refresh();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Ошибка импорта Excel.");
    } finally {
      setImportPending(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Добавить товар
        </button>
        <button
          type="button"
          onClick={openExcelPicker}
          disabled={importPending}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
        <button
          type="button"
          onClick={() => {
            setManagerError("");
            setSizesModalOpen(true);
          }}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Размеры
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={requestCloseMainModal}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Новый товар</h3>
            <p className="mt-1 text-xs text-slate-500">Укажите параметры модели товара для каталога.</p>

            <form action={createProductAction} className="mt-4 grid gap-2">
              <input
                name="name"
                required
                placeholder="Название"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <CustomSelect
                  value={selectedCategoryId}
                  onValueChange={setSelectedCategoryId}
                  placeholder="Категория (необязательно)"
                  options={categoryOptions}
                />
                <button
                  type="button"
                  onClick={() => {
                    setCategoryError("");
                    setNewCategoryName("");
                    setNewCategoryDescription("");
                    setCategoryMiniModalOpen(true);
                  }}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  title="Добавить новую категорию"
                >
                  +
                </button>
              </div>

              <input type="hidden" name="categoryId" value={selectedCategoryId} />

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <CustomSelect
                  value={selectedSize}
                  onValueChange={setSelectedSize}
                  placeholder="Размер"
                  options={sizeOptions}
                />
                <button
                  type="button"
                  onClick={() => {
                    setSizeError("");
                    setNewSizeName("");
                    setSizeMiniModalOpen(true);
                  }}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  title="Добавить новый размер"
                >
                  +
                </button>
              </div>

              <input type="hidden" name="size" value={selectedSize} />

              <input
                name="color"
                placeholder="Цвет (необязательно)"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <input
                name="costPriceUSD"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="Цена себестоимости (USD)"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <input
                name="cbm"
                type="number"
                min="0"
                step="0.0001"
                placeholder="CBM (необязательно)"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <input
                name="kg"
                type="number"
                min="0"
                step="0.01"
                placeholder="KG (необязательно)"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <input
                name="salePriceUSD"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="Цена продажи (USD)"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <textarea
                name="description"
                placeholder="Описание (необязательно)"
                className="min-h-20 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="grid gap-1 text-xs text-slate-600">
                Фото товара (одно)
                <input
                  name="image"
                  type="file"
                  accept="image/*"
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-2.5 file:py-1.5 file:text-xs file:font-medium"
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!selectedSize.trim()}
                  className={`rounded-lg px-3 py-2 text-sm font-medium text-white ${
                    selectedSize.trim() ? "bg-[var(--accent)] hover:opacity-90" : "cursor-not-allowed bg-slate-400"
                  }`}
                >
                  Создать
                </button>
                <button
                  type="button"
                  onClick={requestCloseMainModal}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <CustomConfirmDialog
        open={confirmCloseOpen}
        title="Закрыть создание товара"
        message="Данные формы будут потеряны. Закрыть окно?"
        confirmLabel="Закрыть"
        cancelLabel="Остаться"
        danger
	        onCancel={() => setConfirmCloseOpen(false)}
	        onConfirm={() => {
	          setConfirmCloseOpen(false);
	          setExcelPreviewOpen(false);
	          setExcelPreviewCloseConfirmOpen(false);
	          setExcelDraftRows([]);
            setExcelDefaultCategoryId("");
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
	                  Проверьте список, измените данные или удалите строки перед созданием товаров.
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

              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <CustomSelect
                  value={excelDefaultCategoryId}
                  onValueChange={setExcelDefaultCategoryId}
                  placeholder="Категория по умолчанию"
                  options={categoryOptions}
                />
                <button
                  type="button"
                  onClick={applyDefaultCategoryToDraft}
                  disabled={importPending}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Применить ко всем
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCategoryError("");
                    setNewCategoryName("");
                    setNewCategoryDescription("");
                    setCategoryMiniModalOpen(true);
                  }}
                  disabled={importPending}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Новая категория
                </button>
              </div>

	            {importError ? (
	              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
	                {importError}
	              </p>
	            ) : null}

	            <div className="mt-3 max-h-[70vh] overflow-auto rounded-xl border border-[var(--border)]">
	              <table className="min-w-[1300px] w-full text-left text-xs">
	                <thead className="bg-[var(--surface-soft)] text-slate-600">
	                  <tr>
	                    <th className="px-2 py-2 font-medium">+</th>
	                    <th className="px-2 py-2 font-medium">SKU</th>
	                    <th className="px-2 py-2 font-medium">Название</th>
	                    <th className="px-2 py-2 font-medium">Категория</th>
	                    <th className="px-2 py-2 font-medium">Размер</th>
	                    <th className="px-2 py-2 font-medium">Цвет</th>
	                    <th className="px-2 py-2 font-medium">Себестоимость</th>
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
	                        <select
	                          value={row.categoryId}
	                          onChange={(e) => updateExcelDraftRow(row.key, { categoryId: e.target.value })}
	                          className="w-44 rounded border border-[var(--border)] bg-white px-2 py-1"
	                        >
	                          {categoryOptions.map((opt) => (
	                            <option key={opt.value} value={opt.value}>
	                              {opt.label}
	                            </option>
	                          ))}
	                        </select>
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
	                          value={row.costPriceUSD}
	                          onChange={(e) => updateExcelDraftRow(row.key, { costPriceUSD: e.target.value })}
	                          type="number"
	                          min={0}
	                          step="0.01"
	                          className="w-28 rounded border border-[var(--border)] px-2 py-1"
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

	      {sizeMiniModalOpen ? (
	        <div
	          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4"
          onClick={() => {
            if (!sizeSaving) {
              setSizeMiniModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h4 className="text-sm font-semibold text-slate-900">Новый размер</h4>
            <p className="mt-1 text-xs text-slate-500">Размер сохранится в базе и сразу появится в списке.</p>
            <input
              value={newSizeName}
              onChange={(event) => setNewSizeName(event.target.value)}
              placeholder="Например: M, 42, 200x120"
              className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              autoFocus
            />
            {sizeError ? <p className="mt-2 text-xs text-rose-600">{sizeError}</p> : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={createSizeFromMiniModal}
                disabled={sizeSaving}
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sizeSaving ? "Сохранение..." : "Сохранить"}
              </button>
              <button
                type="button"
                onClick={() => setSizeMiniModalOpen(false)}
                disabled={sizeSaving}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {categoryMiniModalOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4"
          onClick={() => {
            if (!categorySaving) {
              setCategoryMiniModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h4 className="text-sm font-semibold text-slate-900">Новая категория</h4>
            <p className="mt-1 text-xs text-slate-500">Категория сохранится в базе и сразу появится в списке.</p>
            <input
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="Название категории"
              className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              autoFocus
            />
            <textarea
              value={newCategoryDescription}
              onChange={(event) => setNewCategoryDescription(event.target.value)}
              placeholder="Описание (необязательно)"
              className="mt-2 min-h-20 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            {categoryError ? <p className="mt-2 text-xs text-rose-600">{categoryError}</p> : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={createCategoryFromMiniModal}
                disabled={categorySaving}
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {categorySaving ? "Сохранение..." : "Сохранить"}
              </button>
              <button
                type="button"
                onClick={() => setCategoryMiniModalOpen(false)}
                disabled={categorySaving}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sizesModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4" onClick={() => !managerSaving && setSizesModalOpen(false)}>
          <div
            className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className="text-base font-semibold text-slate-900">Размеры товаров</h4>
            <p className="mt-1 text-xs text-slate-500">Можно добавить, изменить или удалить размер.</p>

            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={managerNewSize}
                onChange={(event) => setManagerNewSize(event.target.value)}
                placeholder="Новый размер"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={createSizeFromManager}
                disabled={managerSaving}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Добавить
              </button>
            </div>

            <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-[var(--border)]">
              {!localSizes.length ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">Размеры пока не добавлены.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--surface-soft)] text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Размер</th>
                      <th className="px-3 py-2 font-medium">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localSizes.map((size) => (
                      <tr key={size.id} className="border-t border-[var(--border)] align-top">
                        <td className="px-3 py-2">
                          {editingId === size.id ? (
                            <input
                              value={editingName}
                              onChange={(event) => setEditingName(event.target.value)}
                              className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5"
                            />
                          ) : (
                            <span className="text-slate-800">{size.name}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            {editingId === size.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={saveSizeEdit}
                                  disabled={managerSaving}
                                  className="rounded-md bg-[var(--accent)] px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Сохранить
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingId("");
                                    setEditingName("");
                                  }}
                                  disabled={managerSaving}
                                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Отмена
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingId(size.id);
                                    setEditingName(size.name);
                                    setManagerError("");
                                  }}
                                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  Изменить
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteSize(size.id)}
                                  disabled={managerSaving}
                                  className="rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Удалить
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {managerError ? <p className="mt-3 text-xs text-rose-600">{managerError}</p> : null}

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setSizesModalOpen(false)}
                disabled={managerSaving}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
