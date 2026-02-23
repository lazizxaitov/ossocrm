"use client";

import { useMemo, useState } from "react";
import { createProductAction } from "@/app/(main)/products/actions";
import { CustomSelect } from "@/components/custom-select";

type ProductSizeItem = {
  id: string;
  name: string;
};

type ProductCategoryItem = {
  id: string;
  name: string;
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

export function CreateProductModal({ existingSizes, categories }: CreateProductModalProps) {
  const [open, setOpen] = useState(false);
  const [sizeMiniModalOpen, setSizeMiniModalOpen] = useState(false);
  const [sizesModalOpen, setSizesModalOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const [localSizes, setLocalSizes] = useState(existingSizes);

  const [newSizeName, setNewSizeName] = useState("");
  const [sizeError, setSizeError] = useState("");
  const [sizeSaving, setSizeSaving] = useState(false);

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
    () => categories.map((category) => ({ value: category.id, label: category.name })),
    [categories],
  );

  function upsertLocalSize(size: ProductSizeItem) {
    setLocalSizes((prev) => {
      const withoutCurrent = prev.filter((item) => item.id !== size.id);
      return [...withoutCurrent, size].sort((a, b) => a.name.localeCompare(b.name, "ru"));
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
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
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
