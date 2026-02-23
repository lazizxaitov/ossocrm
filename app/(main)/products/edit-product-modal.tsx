"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { deleteProductAction, updateProductAction } from "@/app/(main)/products/actions";
import { CustomConfirmDialog } from "@/components/custom-confirm-dialog";
import { CustomSelect } from "@/components/custom-select";

type ProductCategoryItem = {
  id: string;
  name: string;
};

type ProductSizeItem = {
  id: string;
  name: string;
};

type EditProductModalProps = {
  product: {
    id: string;
    name: string;
    size: string;
    color: string | null;
    description: string | null;
    imagePath: string | null;
    costPriceUSD: number;
    cbm: number | null;
    kg: number | null;
    basePriceUSD: number;
    categoryId: string | null;
  };
  categories: ProductCategoryItem[];
  existingSizes: ProductSizeItem[];
  showFinance: boolean;
  canDelete: boolean;
};

export function EditProductModal({ product, categories, existingSizes, showFinance, canDelete }: EditProductModalProps) {
  const [open, setOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(product.categoryId ?? "");
  const [selectedSize, setSelectedSize] = useState(product.size);

  const categoryOptions = useMemo(
    () => [{ value: "", label: "Без категории" }, ...categories.map((category) => ({ value: category.id, label: category.name }))],
    [categories],
  );

  const sizeOptions = useMemo(() => {
    const base = existingSizes.map((size) => ({ value: size.name, label: size.name }));
    if (!base.some((option) => option.value === product.size)) {
      base.unshift({ value: product.size, label: product.size });
    }
    return base;
  }, [existingSizes, product.size]);

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    setError("");
    try {
      await updateProductAction(formData);
      setOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось сохранить товар.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeletePending(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("id", product.id);
      await deleteProductAction(formData);
      setConfirmDeleteOpen(false);
      setOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось удалить товар.");
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Изменить
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4" onClick={() => !saving && setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Изменение товара</h3>
            <form action={handleSubmit} className="mt-4 grid gap-2">
              <input type="hidden" name="id" value={product.id} />
              <input type="hidden" name="currentImagePath" value={product.imagePath ?? ""} />

              <input
                name="name"
                defaultValue={product.name}
                required
                placeholder="Название"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <CustomSelect
                value={selectedCategoryId}
                onValueChange={setSelectedCategoryId}
                placeholder="Категория"
                options={categoryOptions}
              />
              <input type="hidden" name="categoryId" value={selectedCategoryId} />

              <CustomSelect
                value={selectedSize}
                onValueChange={setSelectedSize}
                placeholder="Размер"
                options={sizeOptions}
              />
              <input type="hidden" name="size" value={selectedSize} />

              <input
                name="color"
                defaultValue={product.color ?? ""}
                placeholder="Цвет (необязательно)"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              {showFinance ? (
                <>
                  <input
                    name="costPriceUSD"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    defaultValue={product.costPriceUSD}
                    placeholder="Цена себестоимости (USD)"
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                  <input
                    name="cbm"
                    type="number"
                    min="0"
                    step="0.0001"
                    defaultValue={product.cbm ?? ""}
                    placeholder="CBM (необязательно)"
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                  <input
                    name="kg"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={product.kg ?? ""}
                    placeholder="KG (необязательно)"
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                  <input
                    name="salePriceUSD"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    defaultValue={product.basePriceUSD}
                    placeholder="Цена продажи (USD)"
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                </>
              ) : (
                <>
                  <input type="hidden" name="costPriceUSD" value={String(product.costPriceUSD)} />
                  <input type="hidden" name="cbm" value={String(product.cbm ?? "")} />
                  <input type="hidden" name="kg" value={String(product.kg ?? "")} />
                  <input type="hidden" name="salePriceUSD" value={String(product.basePriceUSD)} />
                </>
              )}

              <textarea
                name="description"
                defaultValue={product.description ?? ""}
                placeholder="Описание (необязательно)"
                className="min-h-20 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              {product.imagePath ? (
                <Image src={product.imagePath} alt={product.name} width={96} height={96}
                  className="h-24 w-24 rounded-lg border border-[var(--border)] object-cover"
                />
              ) : null}

              <label className="grid gap-1 text-xs text-slate-600">
                Новое фото (одно, необязательно)
                <input
                  name="image"
                  type="file"
                  accept="image/*"
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-2.5 file:py-1.5 file:text-xs file:font-medium"
                />
              </label>

              {error ? <p className="text-xs text-rose-600">{error}</p> : null}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving || deletePending || !selectedSize.trim()}
                  className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Сохранение..." : "Сохранить"}
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(true)}
                    disabled={saving || deletePending}
                    className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Удалить
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={saving || deletePending}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <CustomConfirmDialog
        open={confirmDeleteOpen}
        title="Удаление товара"
        message={`Удалить товар \"${product.name}\"? Действие необратимо.`}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        danger
        pending={deletePending}
        onCancel={() => !deletePending && setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}


