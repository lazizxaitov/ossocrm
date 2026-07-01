"use client";

import { useState, useTransition } from "react";
import { resetBusinessDataAction } from "@/app/(main)/settings/actions";

export function ResetBusinessDataCard() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirmWord = "СБРОС";
  const canSubmit = confirmation.trim().toUpperCase() === confirmWord;

  function handleReset() {
    if (!canSubmit || pending) return;

    startTransition(async () => {
      try {
        setError(null);
        setSuccess(null);
        await resetBusinessDataAction();
        setOpen(false);
        setConfirmation("");
        setSuccess("Все данные кроме пользователей удалены.");
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Не удалось сбросить данные.");
      }
    });
  }

  return (
    <article className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
      <h3 className="text-base font-semibold text-slate-900">Сброс данных</h3>
      <p className="mt-1 text-sm text-slate-700">
        Удаляет товары, контейнеры, продажи, клиентов, инвесторов, расходы, склад и остальные рабочие данные.
        Пользователи и настройки входа сохраняются.
      </p>
      <p className="mt-1 text-xs text-rose-700">Действие необратимо. Перед сбросом лучше скачать backup.</p>

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setSuccess(null);
            setOpen(true);
          }}
          className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white hover:bg-rose-800"
        >
          Сбросить данные
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4" onClick={() => !pending && setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h4 className="text-base font-semibold text-slate-900">Подтвердите сброс</h4>
            <p className="mt-2 text-sm text-slate-700">
              Введите <span className="font-semibold">{confirmWord}</span>, чтобы удалить все данные кроме пользователей.
            </p>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={confirmWord}
              className="mt-4 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!canSubmit || pending}
                onClick={handleReset}
                className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Сброс..." : "Удалить данные"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
