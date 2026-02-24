"use client";

import { useState } from "react";
import { updateClientAction } from "@/app/(main)/clients/actions";

type EditClientModalProps = {
  id: string;
  name: string;
  company: string | null;
  inn: string | null;
  phone: string | null;
  address: string | null;
  comment: string | null;
  creditLimitUSD: number;
};

export function EditClientModal(props: EditClientModalProps) {
  const [open, setOpen] = useState(false);

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
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <article className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Изменить клиента</h3>
            <p className="mt-1 text-xs text-slate-500">Обновите данные клиента.</p>
            <form action={updateClientAction} className="mt-4 grid gap-2">
              <input type="hidden" name="id" value={props.id} />
              <label className="text-xs text-slate-600">Имя клиента</label>
              <input name="name" required defaultValue={props.name} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" />
              <label className="text-xs text-slate-600">Компания (необязательно)</label>
              <input name="company" defaultValue={props.company ?? ""} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" />
              <label className="text-xs text-slate-600">ИНН (необязательно)</label>
              <input name="inn" defaultValue={props.inn ?? ""} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" />
              <label className="text-xs text-slate-600">Телефон</label>
              <input name="phone" defaultValue={props.phone ?? ""} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" />
              <label className="text-xs text-slate-600">Кредитный лимит (USD, необязательно)</label>
              <input
                name="creditLimitUSD"
                type="number"
                min="0"
                step="0.01"
                defaultValue={props.creditLimitUSD || ""}
                placeholder="Кредитный лимит USD"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
              <label className="text-xs text-slate-600">Адрес (необязательно)</label>
              <textarea name="address" defaultValue={props.address ?? ""} className="min-h-20 rounded-lg border border-[var(--border)] px-3 py-2 text-sm" />
              <label className="text-xs text-slate-600">Комментарий (необязательно)</label>
              <textarea name="comment" defaultValue={props.comment ?? ""} className="min-h-20 rounded-lg border border-[var(--border)] px-3 py-2 text-sm" />
              <div className="mt-1 flex gap-2">
                <button type="submit" className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90">
                  Сохранить
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
          </article>
        </div>
      ) : null}
    </>
  );
}

