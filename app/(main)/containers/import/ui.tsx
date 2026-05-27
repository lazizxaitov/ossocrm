"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import {
  importContainerFromExcelAction,
  previewContainerFromExcelAction,
  quickCreateProductsAction,
  quickCreateInvestorsAction,
  type ImportContainerFormState,
  type PreviewImportContainerFormState,
  type QuickCreateProductsFormState,
  type QuickCreateInvestorsFormState,
} from "@/app/(main)/containers/actions";

export function ImportContainerFromExcelPage({ defaultRate }: { defaultRate: number | null }) {
  const initialState: ImportContainerFormState = { error: null, success: false, warnings: [], containerId: null, unknownSkus: [] };
  const [state, formAction, isPending] = useActionState(importContainerFromExcelAction, initialState);

  const previewInitial: PreviewImportContainerFormState = {
    error: null,
    success: false,
    warnings: [],
    preview: null,
    unknownSkus: [],
    missingInvestors: [],
  };
  const [previewState, previewAction, isPreviewPending] = useActionState(previewContainerFromExcelAction, previewInitial);

  const quickCreateInitial: QuickCreateProductsFormState = { error: null, success: false, createdCount: 0 };
  const [quickCreateState, quickCreateAction, isQuickCreatePending] = useActionState(
    quickCreateProductsAction,
    quickCreateInitial,
  );

  const quickCreateInvestorsInitial: QuickCreateInvestorsFormState = { error: null, success: false, createdCount: 0 };
  const [quickCreateInvestorsState, quickCreateInvestorsActionState, isQuickCreateInvestorsPending] = useActionState(
    quickCreateInvestorsAction,
    quickCreateInvestorsInitial,
  );

  const [name, setName] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [rateOverride, setRateOverride] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isTriggeringPreview, startPreviewTransition] = useTransition();
  const [draft, setDraft] = useState<PreviewImportContainerFormState["preview"]>(null);
  const [editItemIdx, setEditItemIdx] = useState<number | null>(null);
  const [editExpenseIdx, setEditExpenseIdx] = useState<number | null>(null);
  const [editInvestmentIdx, setEditInvestmentIdx] = useState<number | null>(null);
  const [showAddProducts, setShowAddProducts] = useState(false);
  const [missingProductsDraft, setMissingProductsDraft] = useState<Array<{ sku: string; name: string; basePriceUSD: string }>>([]);
  const [showAddInvestors, setShowAddInvestors] = useState(false);
  const [missingInvestorsDraft, setMissingInvestorsDraft] = useState<Array<{ name: string }>>([]);

  const canShowDefaultRate = defaultRate && Number.isFinite(defaultRate);
  const hint = useMemo(() => {
    if (!canShowDefaultRate) return "";
    return `Если в Excel нет курса, будет использован курс по умолчанию: ${Number(defaultRate).toFixed(4)}`;
  }, [canShowDefaultRate, defaultRate]);

  useEffect(() => {
    if (previewState.preview) {
      // Copy preview into editable draft.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(structuredClone(previewState.preview));
    }
  }, [previewState.preview]);

  useEffect(() => {
    if (state.containerId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPreviewModalOpen(false);
    }
  }, [state.containerId]);

  function buildFormData(file: File, extra?: { skipUnknown?: boolean }) {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("name", name);
    fd.set("arrivalDate", arrivalDate);
    fd.set("exchangeRateOverride", rateOverride);
    if (draft) {
      fd.set(
        "overridesJson",
        JSON.stringify({
          items: draft.items.map((r) => ({
            sku: r.sku,
            productId: r.productId,
            quantity: r.quantity,
            unitPriceUSD: r.unitPriceUSD,
            lineTotalUSD: r.lineTotalUSD,
            sizeLabel: r.sizeLabel,
            color: r.color,
            cbm: r.cbm,
            kg: r.kg,
            totalCbm: r.totalCbm,
          })),
          expenses: draft.expenses,
          investments: draft.investments,
        }),
      );
    }
    if (extra?.skipUnknown) fd.set("skipUnknown", "1");
    return fd;
  }

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <form action={formAction} className="grid gap-4">
        <div className="grid gap-2 md:grid-cols-3">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-slate-700">Название (необязательно)</span>
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: KONTEYNER 9"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-slate-700">Дата прибытия (необязательно)</span>
            <input
              name="arrivalDate"
              type="date"
              value={arrivalDate}
              onChange={(e) => setArrivalDate(e.target.value)}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-slate-700">Курс CNY → USD (override)</span>
            <input
              name="exchangeRateOverride"
              type="number"
              step="0.0001"
              min="0.0001"
              value={rateOverride}
              onChange={(e) => setRateOverride(e.target.value)}
              placeholder={canShowDefaultRate ? String(defaultRate) : "0.14"}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="grid gap-1">
          <span className="text-sm font-medium text-slate-700">Excel файл</span>
          <input
            name="file"
            type="file"
            accept=".xlsx"
            required
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setSelectedFile(file);
              if (!file) return;
              setIsPreviewModalOpen(true);
              startPreviewTransition(() => {
                previewAction(buildFormData(file));
              });
            }}
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
          />
          {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isPreviewPending || !selectedFile}
            onClick={() => {
              if (!selectedFile) return;
              setIsPreviewModalOpen(true);
              startPreviewTransition(() => {
                previewAction(buildFormData(selectedFile));
              });
            }}
            className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isPreviewPending ? "Предпросмотр..." : "Предпросмотр"}
          </button>
          <button
            type="button"
            disabled={isPending || !selectedFile}
            onClick={() => {
              if (!selectedFile) return;
              formAction(buildFormData(selectedFile));
            }}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Импорт..." : "Создать из Excel"}
          </button>
          <button
            type="button"
            disabled={isPending || !selectedFile}
            onClick={() => {
              if (!selectedFile) return;
              formAction(buildFormData(selectedFile, { skipUnknown: true }));
            }}
            className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Создать без отсутствующих товаров
          </button>
          {state.containerId ? (
            <a
              href={`/containers/${state.containerId}`}
              className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Открыть контейнер
            </a>
          ) : null}
        </div>

        {previewState.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {previewState.error}
          </p>
        ) : null}

        {/* preview moved to modal on file select */}

        {previewState.unknownSkus?.length || state.unknownSkus?.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold">В Excel есть товары, которых нет в базе (SKU)</div>
            <div className="mt-1 text-xs text-amber-800">
              Можно добавить их сейчас или создать контейнер без них.
            </div>
            <div className="mt-2 max-h-32 overflow-auto rounded border border-amber-200 bg-white p-2 text-xs text-slate-900">
              {(previewState.unknownSkus?.length ? previewState.unknownSkus : state.unknownSkus ?? []).join(", ")}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const skus = previewState.unknownSkus?.length ? previewState.unknownSkus : state.unknownSkus ?? [];
                  setMissingProductsDraft(skus.map((sku) => ({ sku, name: sku, basePriceUSD: "0" })));
                  setShowAddProducts(true);
                }}
                className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-medium text-white hover:opacity-90"
              >
                Добавить товары
              </button>
              <span className="text-xs text-amber-800">или нажмите «Создать без отсутствующих товаров».</span>
            </div>
          </div>
        ) : null}

        {state.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>
        ) : null}

        {state.success ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Контейнер создан из Excel.
          </p>
        ) : null}

        {state.warnings?.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <div className="font-medium">Предупреждения:</div>
            <ul className="mt-1 list-disc pl-5">
              {state.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </form>

      {showAddProducts ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--border)] bg-white p-4 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">Добавить товары (SKU)</div>
              <button
                type="button"
                onClick={() => setShowAddProducts(false)}
                className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>

            <form
              action={quickCreateAction}
              className="mt-3 grid gap-3"
              onSubmit={() => {
                // noop, server action handles it
              }}
            >
              <input type="hidden" name="rowsJson" value={JSON.stringify(missingProductsDraft)} />

              <div className="max-h-[50vh] overflow-auto rounded-lg border border-[var(--border)]">
                <table className="w-full border-separate border-spacing-0 text-left text-xs">
                  <thead className="sticky top-0 bg-white text-slate-600">
                    <tr>
                      <th className="border-b border-[var(--border)] px-2 py-2 font-medium">SKU</th>
                      <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Название</th>
                      <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Base цена USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingProductsDraft.map((row, idx) => (
                      <tr key={row.sku} className="text-slate-800">
                        <td className="border-b border-[var(--border)] px-2 py-1.5">{row.sku}</td>
                        <td className="border-b border-[var(--border)] px-2 py-1.5">
                          <input
                            value={row.name}
                            onChange={(e) => {
                              const next = [...missingProductsDraft];
                              next[idx] = { ...next[idx]!, name: e.target.value };
                              setMissingProductsDraft(next);
                            }}
                            className="w-full rounded border border-[var(--border)] px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="border-b border-[var(--border)] px-2 py-1.5">
                          <input
                            value={row.basePriceUSD}
                            onChange={(e) => {
                              const next = [...missingProductsDraft];
                              next[idx] = { ...next[idx]!, basePriceUSD: e.target.value };
                              setMissingProductsDraft(next);
                            }}
                            inputMode="decimal"
                            className="w-28 rounded border border-[var(--border)] px-2 py-1 text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={isQuickCreatePending}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isQuickCreatePending ? "Сохранение..." : "Сохранить товары"}
                </button>
                {quickCreateState.success ? (
                  <span className="text-xs text-emerald-700">
                    Готово: добавлено {quickCreateState.createdCount}. Нажмите «Предпросмотр» снова.
                  </span>
                ) : null}
                {quickCreateState.error ? (
                  <span className="text-xs text-red-700">{quickCreateState.error}</span>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showAddInvestors ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-white p-4 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">Добавить инвесторов</div>
              <button
                type="button"
                onClick={() => setShowAddInvestors(false)}
                className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>

            <form action={quickCreateInvestorsActionState} className="mt-3 grid gap-3">
              <input type="hidden" name="rowsJson" value={JSON.stringify(missingInvestorsDraft)} />

              <div className="max-h-[50vh] overflow-auto rounded-lg border border-[var(--border)]">
                <table className="w-full border-separate border-spacing-0 text-left text-xs">
                  <thead className="sticky top-0 bg-white text-slate-600">
                    <tr>
                      <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Имя инвестора</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingInvestorsDraft.map((row, idx) => (
                      <tr key={`${row.name}-${idx}`} className="text-slate-800">
                        <td className="border-b border-[var(--border)] px-2 py-1.5">
                          <input
                            value={row.name}
                            onChange={(e) => {
                              const next = [...missingInvestorsDraft];
                              next[idx] = { name: e.target.value };
                              setMissingInvestorsDraft(next);
                            }}
                            className="w-full rounded border border-[var(--border)] px-2 py-1 text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={isQuickCreateInvestorsPending}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isQuickCreateInvestorsPending ? "Сохранение..." : "Сохранить инвесторов"}
                </button>
                {quickCreateInvestorsState.success ? (
                  <span className="text-xs text-emerald-700">
                    Готово: добавлено {quickCreateInvestorsState.createdCount}. Нажмите «Предпросмотр» снова.
                  </span>
                ) : null}
                {quickCreateInvestorsState.error ? (
                  <span className="text-xs text-red-700">{quickCreateInvestorsState.error}</span>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isPreviewModalOpen ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsPreviewModalOpen(false);
          }}
        >
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-lg">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">Предпросмотр импорта</div>
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>

            <div className="grid max-h-[75vh] min-h-0 gap-3 overflow-auto p-4">
              {isPreviewPending || isTriggeringPreview ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-slate-700">
                  Предпросмотр...
                </div>
              ) : null}

              {previewState.error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {previewState.error}
                </div>
              ) : null}

              {previewState.warnings?.length ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">Предупреждения:</div>
                    {previewState.missingInvestors?.length ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMissingInvestorsDraft(previewState.missingInvestors!.map((n) => ({ name: n })));
                          setShowAddInvestors(true);
                        }}
                        className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
                      >
                        Добавить инвесторов
                      </button>
                    ) : null}
                  </div>
                  <ul className="mt-1 list-disc pl-5">
                    {previewState.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {draft ? (
                <div className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
                  <div className="grid gap-1 text-sm text-slate-800 md:grid-cols-2">
                    <div>
                      <span className="font-medium">Контейнер:</span> {draft.containerName}
                    </div>
                    <div>
                      <span className="font-medium">Дата закупки:</span>{" "}
                      {new Date(draft.purchaseDateISO).toLocaleDateString("ru-RU")}
                    </div>
                    <div>
                      <span className="font-medium">Курс CNY → USD:</span> {draft.exchangeRate.toFixed(4)}
                    </div>
                    <div>
                      <span className="font-medium">Закупка:</span>{" "}
                      {draft.totalPurchaseCNY.toFixed(2)} CNY / {draft.totalPurchaseUSD.toFixed(2)} USD
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <div className="text-sm font-semibold text-slate-900">Товары ({draft.items.length})</div>
                    <div className="max-h-[320px] overflow-auto rounded-lg border border-[var(--border)] bg-white">
                      <table className="w-full border-separate border-spacing-0 text-left text-xs">
                        <thead className="sticky top-0 bg-white text-slate-600">
                          <tr>
                            <th className="border-b border-[var(--border)] px-2 py-2 font-medium">SKU</th>
                            <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Название</th>
                            <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Кол-во</th>
                            <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Цена</th>
                            <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Сумма</th>
                            <th className="border-b border-[var(--border)] px-2 py-2 font-medium">CBM</th>
                            <th className="border-b border-[var(--border)] px-2 py-2 font-medium">KG</th>
                            <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Действие</th>
                          </tr>
                        </thead>
                        <tbody>
                          {draft.items.map((row, idx) => (
                            <tr key={`${row.productId}-${idx}`} className="text-slate-800">
                              <td className="border-b border-[var(--border)] px-2 py-1.5">{row.sku}</td>
                              <td className="border-b border-[var(--border)] px-2 py-1.5">{row.productName}</td>
                              <td className="border-b border-[var(--border)] px-2 py-1.5">
                                {editItemIdx === idx ? (
                                  <input
                                    value={String(row.quantity)}
                                    onChange={(e) => {
                                      const next = structuredClone(draft);
                                      next.items[idx]!.quantity = Math.max(0, Math.floor(Number(e.target.value || 0)));
                                      setDraft(next);
                                    }}
                                    inputMode="numeric"
                                    className="w-20 rounded border border-[var(--border)] px-2 py-1 text-xs"
                                  />
                                ) : (
                                  row.quantity
                                )}
                              </td>
                              <td className="border-b border-[var(--border)] px-2 py-1.5">
                                {editItemIdx === idx ? (
                                  <input
                                    value={row.unitPriceUSD === null ? "" : String(row.unitPriceUSD)}
                                    onChange={(e) => {
                                      const next = structuredClone(draft);
                                      const v = e.target.value.trim();
                                      next.items[idx]!.unitPriceUSD = v ? Number(v) : null;
                                      setDraft(next);
                                    }}
                                    inputMode="decimal"
                                    className="w-24 rounded border border-[var(--border)] px-2 py-1 text-xs"
                                  />
                                ) : row.unitPriceUSD !== null ? (
                                  row.unitPriceUSD.toFixed(2)
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="border-b border-[var(--border)] px-2 py-1.5">
                                {editItemIdx === idx ? (
                                  <input
                                    value={row.lineTotalUSD === null ? "" : String(row.lineTotalUSD)}
                                    onChange={(e) => {
                                      const next = structuredClone(draft);
                                      const v = e.target.value.trim();
                                      next.items[idx]!.lineTotalUSD = v ? Number(v) : null;
                                      setDraft(next);
                                    }}
                                    inputMode="decimal"
                                    className="w-24 rounded border border-[var(--border)] px-2 py-1 text-xs"
                                  />
                                ) : row.lineTotalUSD !== null ? (
                                  row.lineTotalUSD.toFixed(2)
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="border-b border-[var(--border)] px-2 py-1.5">
                                {row.totalCbm !== null ? row.totalCbm.toFixed(4) : "—"}
                              </td>
                              <td className="border-b border-[var(--border)] px-2 py-1.5">
                                {row.kg !== null ? row.kg.toFixed(3) : "—"}
                              </td>
                              <td className="border-b border-[var(--border)] px-2 py-1.5">
                                <button
                                  type="button"
                                  onClick={() => setEditItemIdx((prev) => (prev === idx ? null : idx))}
                                  className="rounded border border-[var(--border)] bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  {editItemIdx === idx ? "Готово" : "Изменить"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {draft.expenses.length ? (
                    <div className="grid gap-2">
                      <div className="text-sm font-semibold text-slate-900">
                        Расходы ({draft.expenses.length})
                      </div>
                      <div className="overflow-auto rounded-lg border border-[var(--border)] bg-white">
                        <table className="w-full border-separate border-spacing-0 text-left text-xs">
                          <thead className="bg-white text-slate-600">
                            <tr>
                              <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Название</th>
                              <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Категория</th>
                              <th className="border-b border-[var(--border)] px-2 py-2 font-medium">USD</th>
                              <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Действие</th>
                            </tr>
                          </thead>
                          <tbody>
                            {draft.expenses.map((e, idx) => (
                              <tr key={idx} className="text-slate-800">
                                <td className="border-b border-[var(--border)] px-2 py-1.5">{e.title}</td>
                                <td className="border-b border-[var(--border)] px-2 py-1.5">{e.category}</td>
                                <td className="border-b border-[var(--border)] px-2 py-1.5">
                                  {editExpenseIdx === idx ? (
                                    <input
                                      value={String(e.amountUSD)}
                                      onChange={(ev) => {
                                        const next = structuredClone(draft);
                                        next.expenses[idx]!.amountUSD = Number(ev.target.value || 0);
                                        setDraft(next);
                                      }}
                                      inputMode="decimal"
                                      className="w-28 rounded border border-[var(--border)] px-2 py-1 text-xs"
                                    />
                                  ) : (
                                    e.amountUSD.toFixed(2)
                                  )}
                                </td>
                                <td className="border-b border-[var(--border)] px-2 py-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditExpenseIdx((prev) => (prev === idx ? null : idx))}
                                    className="rounded border border-[var(--border)] bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    {editExpenseIdx === idx ? "Готово" : "Изменить"}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {draft.investments.length ? (
                    <div className="grid gap-2">
                      <div className="text-sm font-semibold text-slate-900">
                        Инвесторы ({draft.investments.length})
                      </div>
                      <div className="overflow-auto rounded-lg border border-[var(--border)] bg-white">
                        <table className="w-full border-separate border-spacing-0 text-left text-xs">
                          <thead className="bg-white text-slate-600">
                            <tr>
                              <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Инвестор</th>
                              <th className="border-b border-[var(--border)] px-2 py-2 font-medium">USD</th>
                              <th className="border-b border-[var(--border)] px-2 py-2 font-medium">%</th>
                              <th className="border-b border-[var(--border)] px-2 py-2 font-medium">Действие</th>
                            </tr>
                          </thead>
                          <tbody>
                            {draft.investments.map((inv, idx) => {
                              const total = draft.investments.reduce((s, r) => s + (Number(r.investedAmountUSD) || 0), 0);
                              const manualSum = draft.investments.reduce(
                                (s, r) => s + (r.isManualShare && Number(r.percentageShare) > 0 ? Number(r.percentageShare) : 0),
                                0,
                              );
                              const autoTotalAmount = draft.investments.reduce(
                                (s, r) => s + (!r.isManualShare || !(Number(r.percentageShare) > 0) ? (Number(r.investedAmountUSD) || 0) : 0),
                                0,
                              );
                              const isManual = inv.isManualShare && Number(inv.percentageShare) > 0;
                              const pct =
                                isManual
                                  ? Number(inv.percentageShare)
                                  : manualSum > 0
                                    ? (() => {
                                        const remaining = Math.max(0, 100 - manualSum);
                                        const denom = autoTotalAmount > 0 ? autoTotalAmount : 0;
                                        if (denom <= 0) return 0;
                                        return ((Number(inv.investedAmountUSD) || 0) / denom) * remaining;
                                      })()
                                    : total > 0
                                      ? ((Number(inv.investedAmountUSD) || 0) / total) * 100
                                      : 0;
                              const isMissing = (previewState.missingInvestors ?? []).includes(inv.investorName);
                              return (
                              <tr key={idx} className="text-slate-800">
                                <td className="border-b border-[var(--border)] px-2 py-1.5">{inv.investorName}</td>
                                <td className="border-b border-[var(--border)] px-2 py-1.5">
                                  {editInvestmentIdx === idx ? (
                                    <input
                                      value={inv.investedAmountUSD ? String(inv.investedAmountUSD) : ""}
                                      onChange={(ev) => {
                                        const next = structuredClone(draft);
                                        next.investments[idx]!.investedAmountUSD = Number(ev.target.value || 0);
                                        setDraft(next);
                                      }}
                                      inputMode="decimal"
                                      className="w-28 rounded border border-[var(--border)] px-2 py-1 text-xs"
                                    />
                                  ) : (
                                    <span className={isMissing && inv.investedAmountUSD === 0 ? "text-orange-700" : undefined}>
                                      {inv.investedAmountUSD ? inv.investedAmountUSD.toFixed(2) : isMissing ? "—" : "0.00"}
                                    </span>
                                  )}
                                </td>
                                <td className="border-b border-[var(--border)] px-2 py-1.5 text-slate-600">
                                  {editInvestmentIdx === idx ? (
                                    <input
                                      value={isManual ? String(inv.percentageShare) : ""}
                                      onChange={(ev) => {
                                        const raw = ev.target.value;
                                        const next = structuredClone(draft);
                                        if (!raw.trim()) {
                                          next.investments[idx]!.percentageShare = 0;
                                          next.investments[idx]!.isManualShare = false;
                                        } else {
                                          const v = Number(raw);
                                          next.investments[idx]!.percentageShare = Number.isFinite(v) ? v : 0;
                                          next.investments[idx]!.isManualShare = Number.isFinite(v) && v > 0;
                                        }
                                        setDraft(next);
                                      }}
                                      inputMode="decimal"
                                      placeholder="auto"
                                      className="w-20 rounded border border-[var(--border)] px-2 py-1 text-xs"
                                    />
                                  ) : (
                                    <span className={isManual ? "text-slate-900" : undefined}>
                                      {pct > 0 ? pct.toFixed(2) : "—"}
                                    </span>
                                  )}
                                </td>
                                <td className="border-b border-[var(--border)] px-2 py-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditInvestmentIdx((prev) => (prev === idx ? null : idx))}
                                    className="rounded border border-[var(--border)] bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    {editInvestmentIdx === idx ? "Готово" : "Изменить"}
                                  </button>
                                </td>
                              </tr>
                            )})}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!selectedFile ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-slate-700">
                  Выберите Excel файл.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
