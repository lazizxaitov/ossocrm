"use client";

import { useMemo, useState } from "react";
import { closeCurrentMonthAction } from "@/app/(main)/dashboard/actions";
import type { MonthCloseChecklistItem } from "@/lib/dashboard";

type MonthCloseModalProps = {
  checklist: MonthCloseChecklistItem[];
  period: {
    month: number;
    year: number;
    status: "OPEN" | "LOCKED";
  };
};

export function MonthCloseModal({ checklist, period }: MonthCloseModalProps) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const hasIssues = useMemo(() => checklist.some((item) => !item.ok), [checklist]);
  const allChecked = useMemo(
    () => checklist.every((item) => checked[item.key] === true),
    [checklist, checked],
  );
  const canSubmit = period.status === "OPEN" && !hasIssues && allChecked;
  const periodLabel = `${String(period.month).padStart(2, "0")}.${period.year}`;

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Закрытие месяца</h3>
          {period.status === "LOCKED" ? (
            <p className="text-sm text-emerald-700">
              Статус: месяц {periodLabel} закрыт. Доступен только просмотр и отчеты.
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Статус: месяц {periodLabel} открыт. Перед закрытием подтвердите 4 пункта чек-листа.
            </p>
          )}
        </div>
        {period.status === "OPEN" ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Закрыть текущий месяц
          </button>
        ) : (
          <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            Месяц закрыт
          </span>
        )}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className="text-lg font-semibold text-slate-900">Подтверждение закрытия месяца</h4>
            <p className="mt-1 text-sm text-slate-600">
              Отметьте все пункты. Если есть ошибки, сначала исправьте причины.
            </p>

            <form action={closeCurrentMonthAction} className="mt-3 grid gap-3">
              <div className="grid gap-2">
                {checklist.map((item) => (
                  <label
                    key={item.key}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      item.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-red-200 bg-red-50 text-red-800"
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        name={`confirm_${item.key}`}
                        className="mt-0.5"
                        disabled={!item.ok}
                        checked={checked[item.key] ?? false}
                        onChange={(event) =>
                          setChecked((prev) => ({ ...prev, [item.key]: event.target.checked }))
                        }
                      />
                      <span>
                        <span className="font-medium">{item.label}</span>
                        {!item.ok && item.reason ? (
                          <span className="mt-1 block text-xs">{item.reason}</span>
                        ) : null}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {hasIssues ? (
                <p className="text-sm font-medium text-red-700">
                  Месяц нельзя закрыть: исправьте красные пункты.
                </p>
              ) : !allChecked ? (
                <p className="text-sm text-amber-700">Подтвердите все пункты чек-листа.</p>
              ) : (
                <p className="text-sm text-emerald-700">Проверки пройдены. Можно закрывать месяц.</p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={`rounded-lg px-3 py-2 text-sm font-medium text-white ${
                    canSubmit ? "bg-slate-900 hover:opacity-90" : "cursor-not-allowed bg-slate-400"
                  }`}
                >
                  Подтвердить закрытие
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </article>
  );
}
