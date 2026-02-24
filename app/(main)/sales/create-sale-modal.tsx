"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createSaleAction, type CreateSaleState } from "@/app/(main)/sales/actions";
import { CustomConfirmDialog } from "@/components/custom-confirm-dialog";
import { CustomDateInput } from "@/components/custom-date-input";
import { CustomSelect } from "@/components/custom-select";

type ClientOption = {
  id: string;
  name: string;
};

type StockOption = {
  containerItemId: string;
  productId: string;
  productName: string;
  sku: string;
  containerName: string;
  categoryName?: string | null;
  imagePath?: string | null;
  quantity: number;
  costPerUnitUSD: number;
  basePriceUSD: number;
};

type Row = {
  key: number;
  containerItemId: string;
  quantity: string;
  salePricePerUnitUSD: string;
};

type CreateSaleModalProps = {
  clients: ClientOption[];
  stock: StockOption[];
  triggerLabel?: string;
  modalTitle?: string;
  itemsModalTitle?: string;
  itemSearchPlaceholder?: string;
  enableDragDrop?: boolean;
  vanityBuilder?: boolean;
};

type SaleMode = "IMMEDIATE" | "DEBT" | "CONSIGNMENT";
type BuilderSlot = "SINK" | "VANITY" | "ACCESSORY";
type BuilderListMode = "PLUMBING" | "VANITIES" | "ACCESSORIES";

function toNumber(value: string) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function OverflowMarquee({ text }: { text: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    function measure() {
      const box = boxRef.current;
      const label = textRef.current;
      if (!box || !label) return;
      setOverflowing(label.scrollWidth > box.clientWidth + 4);
    }

    measure();
    const observer = new ResizeObserver(measure);
    if (boxRef.current) observer.observe(boxRef.current);
    if (textRef.current) observer.observe(textRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [text]);

  return (
    <div
      ref={boxRef}
      title={text}
      className={`overflow-hidden whitespace-nowrap ${overflowing ? "osso-marquee-active" : ""}`}
    >
      <span ref={textRef} className="osso-marquee-track">
        {text}
      </span>
    </div>
  );
}

export function CreateSaleModal({
  clients,
  stock,
  triggerLabel = "Создать продажу",
  modalTitle = "Новая продажа",
  itemsModalTitle = "Добавление товаров в продажу",
  itemSearchPlaceholder = "Поиск по товару / SKU / контейнеру",
  enableDragDrop = true,
  vanityBuilder = false,
}: CreateSaleModalProps) {
  const initialState: CreateSaleState = { error: null, success: null };
  const [state, formAction, pending] = useActionState(createSaleAction, initialState);
  const [open, setOpen] = useState(false);
  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState("");
  const [saleMode, setSaleMode] = useState<SaleMode>("IMMEDIATE");
  const [submitError, setSubmitError] = useState("");
  const [paidNowInput, setPaidNowInput] = useState("");
  const [dueDateValue, setDueDateValue] = useState("");
  const rowKeyRef = useRef(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [isDropActive, setIsDropActive] = useState(false);
  const [builderDropSlot, setBuilderDropSlot] = useState<BuilderSlot | null>(null);
  const [editingPriceForKey, setEditingPriceForKey] = useState<number | null>(null);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [builderListMode, setBuilderListMode] = useState<BuilderListMode>("PLUMBING");

  const stockMap = useMemo(() => new Map(stock.map((item) => [item.containerItemId, item])), [stock]);
  const isVanityItem = (item: StockOption) => item.categoryName === "Тумбы";
  const isAccessoryItem = (item: StockOption) =>
    item.categoryName === "Аксессуары" || item.productName.toLowerCase().includes("аксессуар");
  const resolveBuilderSlot = (item: StockOption): BuilderSlot =>
    isVanityItem(item) ? "VANITY" : isAccessoryItem(item) ? "ACCESSORY" : "SINK";

  const groupedStock = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const map = new Map<string, StockOption[]>();

    const filtered = stock.filter((item) => {
      if (!normalizedSearch) return true;
      const hay = `${item.productName} ${item.sku} ${item.containerName} ${item.categoryName ?? ""}`.toLowerCase();
      return hay.includes(normalizedSearch);
    });

    for (const item of filtered) {
      const key = item.containerName || "Без контейнера";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }

    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [search, stock]);

  const builderLeftList = useMemo(
    () => stock.filter((item) => !isVanityItem(item) && !isAccessoryItem(item)).filter((item) => {
      const normalizedSearch = search.trim().toLowerCase();
      if (!normalizedSearch) return true;
      const hay = `${item.productName} ${item.sku} ${item.containerName}`.toLowerCase();
      return hay.includes(normalizedSearch);
    }),
    [search, stock],
  );

  const builderVanities = useMemo(
    () =>
      stock.filter((item) => isVanityItem(item)).filter((item) => {
        const normalizedSearch = search.trim().toLowerCase();
        if (!normalizedSearch) return true;
        const hay = `${item.productName} ${item.sku} ${item.containerName}`.toLowerCase();
        return hay.includes(normalizedSearch);
      }),
    [search, stock],
  );

  const builderAccessories = useMemo(
    () =>
      stock.filter((item) => isAccessoryItem(item)).filter((item) => {
        const normalizedSearch = search.trim().toLowerCase();
        if (!normalizedSearch) return true;
        const hay = `${item.productName} ${item.sku} ${item.containerName}`.toLowerCase();
        return hay.includes(normalizedSearch);
      }),
    [search, stock],
  );

  const builderListItems = useMemo(() => {
    if (builderListMode === "VANITIES") return builderVanities;
    if (builderListMode === "ACCESSORIES") return builderAccessories;
    return builderLeftList;
  }, [builderAccessories, builderLeftList, builderListMode, builderVanities]);

  const itemsPayload = useMemo(
    () =>
      rows
        .map((row) => {
          const quantity = Math.floor(toNumber(row.quantity));
          const salePricePerUnitUSD = toNumber(row.salePricePerUnitUSD);
          return {
            containerItemId: row.containerItemId,
            quantity,
            salePricePerUnitUSD,
          };
        })
        .filter((row) => row.containerItemId && row.quantity > 0 && row.salePricePerUnitUSD > 0),
    [rows],
  );

  const total = useMemo(() => itemsPayload.reduce((sum, row) => sum + row.quantity * row.salePricePerUnitUSD, 0), [itemsPayload]);
  const totalsByCategory = useMemo(() => {
    const result = { plumbing: 0, vanity: 0, accessory: 0 };
    for (const row of itemsPayload) {
      const source = stockMap.get(row.containerItemId);
      if (!source) continue;
      const line = row.quantity * row.salePricePerUnitUSD;
      if (isVanityItem(source)) {
        result.vanity += line;
      } else if (isAccessoryItem(source)) {
        result.accessory += line;
      } else {
        result.plumbing += line;
      }
    }
    return result;
  }, [itemsPayload, stockMap]);
  const paidNowNumber = useMemo(() => Math.max(0, toNumber(paidNowInput)), [paidNowInput]);
  const debtPreview = useMemo(() => Math.max(0, total - Math.min(total, paidNowNumber)), [paidNowNumber, total]);

  const editingPriceRow = editingPriceForKey === null ? null : rows.find((row) => row.key === editingPriceForKey) ?? null;
  const builderSinkRow = rows.find((row) => {
    const item = stockMap.get(row.containerItemId);
    return item ? !isVanityItem(item) && !isAccessoryItem(item) : false;
  });
  const builderVanityRow = rows.find((row) => {
    const item = stockMap.get(row.containerItemId);
    return item ? isVanityItem(item) : false;
  });
  const builderAccessoryRow = rows.find((row) => {
    const item = stockMap.get(row.containerItemId);
    return item ? isAccessoryItem(item) : false;
  });
  const builderAccessoryRows = rows.filter((row) => {
    const item = stockMap.get(row.containerItemId);
    return item ? isAccessoryItem(item) : false;
  });
  const hasUnsavedDraft =
    Boolean(clientId.trim()) ||
    saleMode !== "IMMEDIATE" ||
    rows.length > 0 ||
    Boolean(search.trim()) ||
    Boolean(paidNowInput.trim()) ||
    Boolean(dueDateValue.trim()) ||
    Boolean(submitError.trim()) ||
    Boolean(state.error) ||
    Boolean(state.success);

  function resetDraft() {
    setSearch("");
    setClientId("");
    setSaleMode("IMMEDIATE");
    setSubmitError("");
    setPaidNowInput("");
    setDueDateValue("");
    setRows([]);
    rowKeyRef.current = 1;
    setItemsModalOpen(false);
    setIsDropActive(false);
    setEditingPriceForKey(null);
    setBuilderListMode("PLUMBING");
  }

  function closeMainModalWithConfirm() {
    if (hasUnsavedDraft) {
      setConfirmCloseOpen(true);
      return;
    }
    resetDraft();
    setOpen(false);
  }

  function confirmCloseWithoutSave() {
    setConfirmCloseOpen(false);
    resetDraft();
    setOpen(false);
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        if (patch.containerItemId) {
          const selected = stockMap.get(patch.containerItemId);
          if (selected && !String(next.salePricePerUnitUSD ?? "").trim()) {
            next.salePricePerUnitUSD = String(selected.basePriceUSD);
          }
        }
        return next;
      }),
    );
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  function getNextRowKey() {
    const key = rowKeyRef.current;
    rowKeyRef.current += 1;
    return key;
  }

  function addStockToSale(item: StockOption) {
    if (vanityBuilder) {
      assignBuilderSlot(resolveBuilderSlot(item), item);
      return;
    }

    setRows((prev) => {
      const existing = prev.find((row) => row.containerItemId === item.containerItemId);
      if (existing) {
        return prev.map((row) =>
          row.containerItemId === item.containerItemId
            ? { ...row, quantity: String(Math.max(1, Math.floor(toNumber(row.quantity))) + 1) }
            : row,
        );
      }

      return [
        ...prev,
        {
          key: getNextRowKey(),
          containerItemId: item.containerItemId,
          quantity: "1",
          salePricePerUnitUSD: item.basePriceUSD > 0 ? String(item.basePriceUSD) : "",
        },
      ];
    });
  }

  function handleDropStock(containerItemId: string) {
    const item = stockMap.get(containerItemId);
    if (!item) return;
    addStockToSale(item);
  }

  function assignBuilderSlot(slot: BuilderSlot, item: StockOption) {
    const itemSlot = resolveBuilderSlot(item);
    if (itemSlot !== slot) return;

    setRows((prev) => {
      if (slot === "ACCESSORY") {
        const existing = prev.find((row) => row.containerItemId === item.containerItemId);
        if (existing) {
          return prev.map((row) =>
            row.containerItemId === item.containerItemId
              ? { ...row, quantity: String(Math.max(1, Math.floor(toNumber(row.quantity))) + 1) }
              : row,
          );
        }
        return [
          ...prev,
          {
            key: getNextRowKey(),
            containerItemId: item.containerItemId,
            quantity: "1",
            salePricePerUnitUSD: item.basePriceUSD > 0 ? String(item.basePriceUSD) : "",
          },
        ];
      }

      const next = prev.filter((row) => {
        const selected = stockMap.get(row.containerItemId);
        if (!selected) return true;
        return resolveBuilderSlot(selected) !== slot;
      });

      const existing = prev.find((row) => row.containerItemId === item.containerItemId);
      if (existing) {
        return [
          ...next.filter((row) => row.containerItemId !== existing.containerItemId),
          { ...existing, quantity: existing.quantity || "1" },
        ];
      }

      return [
        ...next,
        {
          key: getNextRowKey(),
          containerItemId: item.containerItemId,
          quantity: "1",
          salePricePerUnitUSD: item.basePriceUSD > 0 ? String(item.basePriceUSD) : "",
        },
      ];
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        {triggerLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={closeMainModalWithConfirm}>
          <div className="max-h-[95vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">{modalTitle}</h3>
            <p className="text-sm text-slate-600">Счет генерируется автоматически и не редактируется.</p>

            <form
              action={formAction}
              onSubmit={(event) => {
                if (!clientId) {
                  event.preventDefault();
                  setSubmitError("Выберите клиента.");
                  return;
                }
                if (!itemsPayload.length) {
                  event.preventDefault();
                  setSubmitError("Добавьте минимум один товар в продажу.");
                  return;
                }
                if (saleMode === "DEBT" && paidNowNumber > total) {
                  event.preventDefault();
                  setSubmitError("Сумма 'Оплачено сейчас' не может быть больше итога продажи.");
                  return;
                }
                setSubmitError("");
              }}
              className="mt-4 grid gap-3"
            >
              <div className="grid gap-2">
                <CustomSelect
                  name="clientId"
                  required
                  value={clientId}
                  onValueChange={(value) => {
                    setClientId(value);
                    if (submitError) setSubmitError("");
                  }}
                  placeholder="Выберите клиента"
                  options={clients.map((client) => ({ value: client.id, label: client.name }))}
                />
                <input type="hidden" name="saleMode" value={saleMode} />
                <div className="grid gap-2 md:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setSaleMode("IMMEDIATE")}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      saleMode === "IMMEDIATE"
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--border)] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Оплата сразу
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaleMode("DEBT")}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      saleMode === "DEBT"
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--border)] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    В долг
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaleMode("CONSIGNMENT")}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      saleMode === "CONSIGNMENT"
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--border)] text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    В реализацию
                  </button>
                </div>

                {saleMode === "IMMEDIATE" ? (
                  <input
                    name="paidNow"
                    type="number"
                    min="0"
                    step="0.01"
                    value={paidNowInput}
                    onChange={(event) => setPaidNowInput(event.target.value)}
                    placeholder="Сумма оплаты (USD)"
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                ) : null}

                {saleMode === "DEBT" ? (
                  <>
                    <input
                      name="paidNow"
                      type="number"
                      min="0"
                      step="0.01"
                      value={paidNowInput}
                      onChange={(event) => setPaidNowInput(event.target.value)}
                      placeholder="Оплачено сейчас (необязательно)"
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    />
                    <CustomDateInput name="dueDate" value={dueDateValue} onValueChange={setDueDateValue} placeholder="Срок оплаты" />
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Оплачено сейчас: <span className="font-semibold">${Math.min(total, paidNowNumber).toFixed(2)}</span> ·
                      В долг уйдет: <span className="font-semibold">${debtPreview.toFixed(2)}</span>
                    </p>
                  </>
                ) : null}

                {saleMode === "CONSIGNMENT" ? (
                  <CustomDateInput name="dueDate" value={dueDateValue} onValueChange={setDueDateValue} placeholder="Срок реализации" />
                ) : null}
              </div>

              <div className="rounded-xl border border-[var(--border)] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">Товары продажи</p>
                  <button
                    type="button"
                    onClick={() => setItemsModalOpen(true)}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Добавить товары
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Добавлено позиций: <span className="font-semibold text-slate-700">{rows.length}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Валидных строк к отправке: <span className="font-semibold text-slate-700">{itemsPayload.length}</span>
                </p>
              </div>

              <input type="hidden" name="itemsJson" value={JSON.stringify(itemsPayload)} />

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">
                <div className="grid gap-0.5">
                  <p className="font-medium text-slate-800">Итого: ${total.toFixed(2)}</p>
                  <p className="text-xs text-slate-600">Сантехника: ${totalsByCategory.plumbing.toFixed(2)}</p>
                  <p className="text-xs text-slate-600">Тумбы: ${totalsByCategory.vanity.toFixed(2)}</p>
                  {totalsByCategory.accessory > 0 ? (
                    <p className="text-xs text-slate-600">Аксессуары: ${totalsByCategory.accessory.toFixed(2)}</p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending ? "Сохранение..." : "Сохранить продажу"}
                  </button>
                  <button
                    type="button"
                    onClick={closeMainModalWithConfirm}
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                </div>
              </div>
              {submitError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {submitError}
                </p>
              ) : null}
              {state.error ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {state.error}
                </p>
              ) : null}
              {state.success ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {state.success}
                </p>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}
      <CustomConfirmDialog
        open={confirmCloseOpen}
        title="Закрыть без сохранения"
        message="Все введенные данные будут удалены. Продолжить?"
        confirmLabel="Закрыть"
        cancelLabel="Остаться"
        danger
        onCancel={() => setConfirmCloseOpen(false)}
        onConfirm={confirmCloseWithoutSave}
      />

      {itemsModalOpen ? (
        <div className="fixed inset-0 z-[55] bg-slate-900/50" onClick={() => setItemsModalOpen(false)}>
          <div className="flex h-full w-full flex-col bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h4 className="text-base font-semibold text-slate-900">{itemsModalTitle}</h4>
            <div
              className={`mt-3 grid min-h-0 flex-1 gap-3 ${
                vanityBuilder
                  ? "lg:grid-cols-[340px_minmax(520px,1fr)]"
                  : "lg:grid-cols-[380px_1fr]"
              }`}
            >
              <section className="flex min-h-0 flex-col rounded-xl border border-[var(--border)] p-3">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={itemSearchPlaceholder}
                  className="mb-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                {vanityBuilder ? (
                  <div className="mb-2 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setBuilderListMode("PLUMBING")}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
                        builderListMode === "PLUMBING"
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "border-[var(--border)] text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Сантехника
                    </button>
                    <button
                      type="button"
                      onClick={() => setBuilderListMode("VANITIES")}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
                        builderListMode === "VANITIES"
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "border-[var(--border)] text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Тумбы
                    </button>
                    <button
                      type="button"
                      onClick={() => setBuilderListMode("ACCESSORIES")}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
                        builderListMode === "ACCESSORIES"
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "border-[var(--border)] text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Аксессуары
                    </button>
                  </div>
                ) : null}

                <div className="min-h-0 flex-1 space-y-2 overflow-auto">
                  {(vanityBuilder
                    ? [[
                        builderListMode === "PLUMBING"
                          ? "Сантехника"
                          : builderListMode === "VANITIES"
                            ? "Тумбы"
                            : "Аксессуары",
                        builderListItems,
                      ] as [string, StockOption[]]]
                    : groupedStock
                  ).map(([containerName, list]) => (
                    <div key={containerName} className="rounded-lg border border-[var(--border)] p-2">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{containerName}</p>
                      <div className="space-y-1">
                        {list.map((item) => (
                          <button
                            key={item.containerItemId}
                            type="button"
                            onClick={() => addStockToSale(item)}
                            draggable={enableDragDrop || vanityBuilder}
                            onDragStart={(event) => {
                              if (!enableDragDrop && !vanityBuilder) return;
                              event.dataTransfer.effectAllowed = "copy";
                              event.dataTransfer.setData("text/plain", item.containerItemId);
                            }}
                            className="w-full rounded-md border border-transparent px-2 py-1.5 text-left text-sm text-slate-700 hover:border-[var(--border)] hover:bg-slate-50"
                          >
                            <p className="font-medium">{item.productName}</p>
                            <p className="text-xs text-slate-500">{item.sku} · Остаток: {item.quantity}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {vanityBuilder && builderListItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-5 text-center text-sm text-slate-500">
                      Слева нет доступных товаров.
                    </div>
                  ) : null}
                </div>
              </section>

              <section
                onDragEnter={(event) => {
                  if (!enableDragDrop) return;
                  event.preventDefault();
                  setIsDropActive(true);
                }}
                onDragOver={(event) => {
                  if (!enableDragDrop) return;
                  event.preventDefault();
                  if (!isDropActive) setIsDropActive(true);
                }}
                onDragLeave={() => {
                  if (!enableDragDrop) return;
                  setIsDropActive(false);
                }}
                onDrop={(event) => {
                  if (!enableDragDrop) return;
                  event.preventDefault();
                  setIsDropActive(false);
                  const containerItemId = event.dataTransfer.getData("text/plain");
                  handleDropStock(containerItemId);
                }}
                className={`flex min-h-0 flex-col rounded-xl border p-3 transition-colors ${
                  enableDragDrop && isDropActive ? "border-[var(--accent)] bg-slate-50" : "border-[var(--border)]"
                }`}
              >
                {vanityBuilder ? (
                  <div className="mb-3 rounded-xl border border-[var(--border)] bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Конструктор</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { slot: "SINK", title: "Верхний квадрат (раковина)", row: builderSinkRow, empty: "Перетащите раковину" },
                        { slot: "VANITY", title: "Нижний квадрат (тумба)", row: builderVanityRow, empty: "Перетащите тумбу" },
                        {
                          slot: "ACCESSORY",
                          title: "Квадрат аксессуаров",
                          row: builderAccessoryRow,
                          empty: "Перетащите аксессуар",
                        },
                      ] as const).map((block) => (
                        <div key={block.slot} className="grid gap-1.5">
                          <p className="text-[11px] font-medium text-slate-600">{block.title}</p>
                          <div
                            onDragEnter={(event) => {
                              event.preventDefault();
                              setBuilderDropSlot(block.slot);
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                              setBuilderDropSlot(block.slot);
                            }}
                            onDragLeave={() => setBuilderDropSlot((prev) => (prev === block.slot ? null : prev))}
                            onDrop={(event) => {
                              event.preventDefault();
                              setBuilderDropSlot(null);
                              const containerItemId = event.dataTransfer.getData("text/plain");
                              const selected = stockMap.get(containerItemId);
                              if (!selected) return;
                              assignBuilderSlot(block.slot, selected);
                            }}
                            className={`mx-auto flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed bg-white p-2 text-center sm:h-28 sm:w-28 ${
                              builderDropSlot === block.slot
                                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                                : "border-[var(--border)]"
                            }`}
                          >
                            {block.row ? (
                              (() => {
                                const selected = stockMap.get(block.row.containerItemId);
                                if (!selected) return <p className="text-sm font-medium text-slate-800">—</p>;
                                return (
                                  <div className="flex flex-col items-center gap-1.5">
                                    {selected.imagePath ? (
                                      <Image
                                        src={selected.imagePath}
                                        alt={selected.productName}
                                        width={56}
                                        height={56}
                                        className="h-14 w-14 rounded-md border border-[var(--border)] object-cover"
                                      />
                                    ) : null}
                                    <p className="line-clamp-2 max-w-[90%] text-xs font-medium text-slate-800">{selected.productName}</p>
                                    {block.slot === "ACCESSORY" && builderAccessoryRows.length > 1 ? (
                                      <p className="text-[10px] text-slate-500">+{builderAccessoryRows.length - 1} шт.</p>
                                    ) : null}
                                  </div>
                                );
                              })()
                            ) : (
                              <p className="line-clamp-2 max-w-[90%] text-sm font-medium text-slate-800">{block.empty}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <p className="mb-2 text-sm font-medium text-slate-800">Добавленные товары</p>
                <div className="mb-2 hidden grid-cols-[minmax(160px,2fr)_minmax(130px,1.2fr)_70px_96px_76px] gap-1.5 px-1 text-[11px] font-medium text-slate-500 md:grid">
                  <p>Товар</p>
                  <p>Контейнер</p>
                  <p>Количество (QTY)</p>
                  <p>Цена</p>
                  <p>Удалить</p>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-auto">
                  {rows.map((row) => {
                    const selected = stockMap.get(row.containerItemId);
                    const quantity = Math.max(0, Math.floor(toNumber(row.quantity)));
                    const salePrice = toNumber(row.salePricePerUnitUSD);
                    const isBelowCost = selected ? salePrice > 0 && salePrice < selected.costPerUnitUSD : false;
                    const isOverStock = selected ? quantity > selected.quantity : false;

                    return (
                      <div key={row.key} className="rounded-lg border border-[var(--border)] bg-white p-2">
                        <div className="grid items-center gap-1.5 md:grid-cols-[minmax(160px,2fr)_minmax(130px,1.2fr)_70px_96px_76px]">
                          <div className="rounded border border-[var(--border)] bg-slate-50 px-2 py-2 text-sm text-slate-700">
                            {selected ? selected.productName : "—"}
                          </div>
                          <div className="rounded border border-[var(--border)] bg-slate-50 px-2 py-2 text-sm text-slate-700">
                            <OverflowMarquee text={selected ? selected.containerName : "—"} />
                          </div>
                          <input
                            value={row.quantity}
                            onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                            type="number"
                            min={1}
                            step={1}
                            placeholder="QTY"
                            className="h-10 w-16 appearance-none rounded border border-[var(--border)] px-1.5 text-[11px] text-slate-700"
                          />
                          <button
                            type="button"
                            onClick={() => setEditingPriceForKey(row.key)}
                            className="h-10 min-w-0 rounded border border-[var(--border)] px-1 text-[10px] font-medium leading-tight text-slate-700 hover:bg-slate-50"
                          >
                            Изм. цену
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(row.key)}
                            className="h-10 min-w-0 rounded border border-rose-300 px-1 text-[10px] font-medium leading-tight text-rose-700 hover:bg-rose-50"
                          >
                            Удалить
                          </button>
                        </div>

                        {selected ? (
                          <p className="mt-1 text-xs text-slate-500">
                            SKU: {selected.sku} | Себестоимость: ${selected.costPerUnitUSD.toFixed(4)} | Доступно: {selected.quantity}
                            {isBelowCost ? <span className="ml-2 font-semibold text-orange-700">Внимание: цена ниже себестоимости</span> : null}
                            {isOverStock ? <span className="ml-2 font-semibold text-rose-700">Ошибка: количество больше остатка</span> : null}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}

                  {!rows.length ? (
                    <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-6 text-center text-sm text-slate-500">
                      {enableDragDrop ? "Выберите товары слева или перетащите их сюда." : "Выберите товары слева для добавления."}
                    </div>
                  ) : null}
                </div>
              </section>

            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
              <div className="rounded-lg bg-slate-100 px-3 py-1 text-sm text-slate-700">
                <p>
                  Товаров: <span className="font-semibold">{rows.length}</span> | Итого: <span className="font-semibold">${total.toFixed(2)}</span>
                </p>
                <p className="text-xs">
                  Сантехника: <span className="font-semibold">${totalsByCategory.plumbing.toFixed(2)}</span> | Тумбы:{" "}
                  <span className="font-semibold">${totalsByCategory.vanity.toFixed(2)}</span>
                  {totalsByCategory.accessory > 0 ? (
                    <>
                      {" "}
                      | Аксессуары: <span className="font-semibold">${totalsByCategory.accessory.toFixed(2)}</span>
                    </>
                  ) : null}
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

      {editingPriceRow ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4" onClick={() => setEditingPriceForKey(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-sm font-semibold text-slate-900">Изменить цену продажи</p>
            <label className="mt-3 grid gap-1 text-xs text-slate-600">
              Цена продажи за ед. (USD)
              <input
                value={editingPriceRow.salePricePerUnitUSD}
                onChange={(event) => updateRow(editingPriceRow.key, { salePricePerUnitUSD: event.target.value })}
                type="number"
                min={0}
                step="0.01"
                placeholder="USD"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
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
    </>
  );
}
