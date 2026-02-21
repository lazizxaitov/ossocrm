"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  resolveDiscrepancySessionAction,
  type ResolveDiscrepancyState,
} from "@/app/(main)/inventory-sessions/actions";

type HistoryEvent = {
  timestamp: number;
  at: string;
  action: string;
  details: string;
};

type DiscrepancyRow = {
  productId: string;
  productName: string;
  sku: string;
  containerName: string;
  systemQuantity: number;
  actualQuantity: number;
  difference: number;
};

type DiscrepancyDetailsModalProps = {
  sessionId: string;
  rows: DiscrepancyRow[];
  productHistories: Record<string, HistoryEvent[]>;
  canResolve: boolean;
};

const INITIAL_RESOLVE_STATE: ResolveDiscrepancyState = {
  error: null,
  success: null,
  code: null,
};

function possibleReason(difference: number) {
  if (difference < 0) {
    return "Недостача: возможны ошибка подсчета, пересорт или потеря товара.";
  }
  return "Излишек: возможны неучтенный приход, ошибка прошлой инвентаризации или дублирование учета.";
}

export function DiscrepancyDetailsModal({
  sessionId,
  rows,
  productHistories,
  canResolve,
}: DiscrepancyDetailsModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expandedHistoryKey, setExpandedHistoryKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [resolveState, setResolveState] = useState<ResolveDiscrepancyState>(INITIAL_RESOLVE_STATE);

  function onResolve() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", sessionId);
      const next = await resolveDiscrepancySessionAction(INITIAL_RESOLVE_STATE, formData);
      setResolveState(next);
      if (!next.error) {
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setResolveState(INITIAL_RESOLVE_STATE);
          setOpen(true);
        }}
        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Причина расхождения
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-4xl rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Причины расхождений</h3>
            <p className="mt-1 text-xs text-slate-500">Список товаров с несовпадением и возможной причиной.</p>

            <div className="mt-4 max-h-[60vh] overflow-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--surface-soft)] text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Товар</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Контейнер</th>
                    <th className="px-3 py-2 font-medium">Количество</th>
                    <th className="px-3 py-2 font-medium">Возможная причина</th>
                    <th className="px-3 py-2 font-medium">История</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const history = productHistories[row.productId] ?? [];
                    const rowKey = `${row.productId}-${row.containerName}-${index}`;
                    const isExpanded = expandedHistoryKey === rowKey;

                    return (
                      <Fragment key={rowKey}>
                        <tr className="border-t border-[var(--border)] align-top">
                          <td className="px-3 py-2 text-slate-800">{row.productName}</td>
                          <td className="px-3 py-2 text-slate-700">{row.sku}</td>
                          <td className="px-3 py-2 text-slate-700">{row.containerName}</td>
                          <td className="px-3 py-2 text-slate-700">
                            База: {row.systemQuantity}, Факт: {row.actualQuantity}, Разница: {row.difference > 0 ? `+${row.difference}` : row.difference}
                          </td>
                          <td className="px-3 py-2 text-slate-700">{possibleReason(row.difference)}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setExpandedHistoryKey((prev) => (prev === rowKey ? null : rowKey))}
                              className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              История
                            </button>
                          </td>
                        </tr>

                        {isExpanded ? (
                          <tr className="border-t border-[var(--border)] bg-slate-50/60">
                            <td colSpan={6} className="px-3 py-3">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Действия с товаром за текущий месяц
                              </p>
                              <div className="space-y-1">
                                {history.length ? (
                                  history.map((event, eventIndex) => (
                                    <div
                                      key={`${rowKey}-event-${eventIndex}`}
                                      className="rounded-md border border-[var(--border)] bg-white px-2 py-2 text-xs text-slate-700"
                                    >
                                      <span className="font-medium text-slate-900">{event.at}</span>
                                      {" | "}
                                      <span className="font-medium">{event.action}</span>
                                      {" | "}
                                      <span>{event.details}</span>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-slate-500">История по товару за текущий месяц не найдена.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                        Деталей по расхождениям нет.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2">
                {canResolve ? (
                  <button
                    type="button"
                    onClick={onResolve}
                    disabled={pending}
                    className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending ? "Сохранение..." : "Расхождения решено"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Закрыть
                </button>
              </div>
              {resolveState.error ? <p className="mt-2 text-xs text-rose-700">{resolveState.error}</p> : null}
              {resolveState.success ? (
                <p className="mt-2 text-xs text-emerald-700">
                  {resolveState.success} Новый код: <span className="font-semibold">{resolveState.code}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
