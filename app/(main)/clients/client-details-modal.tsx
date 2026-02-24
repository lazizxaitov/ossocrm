"use client";

import { useState } from "react";

type ClientDetailsModalProps = {
  name: string;
  company: string | null;
  inn: string | null;
  phone: string | null;
  address: string | null;
  comment: string | null;
  creditLimitLabel: string;
  totalPurchasesLabel: string;
  totalPaidLabel: string;
  totalDebtLabel: string;
  purchasesCount: number;
};

export function ClientDetailsModal(props: ClientDetailsModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Подробнее
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <article className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">{props.name}</h3>
            <p className="mt-1 text-xs text-slate-500">Карточка клиента и сводная статистика.</p>
            <div className="mt-4 grid gap-2 text-sm">
              <p><span className="text-slate-500">Компания:</span> {props.company || "—"}</p>
              <p><span className="text-slate-500">ИНН:</span> {props.inn || "—"}</p>
              <p><span className="text-slate-500">Телефон:</span> {props.phone || "—"}</p>
              <p><span className="text-slate-500">Адрес:</span> {props.address || "—"}</p>
              <p><span className="text-slate-500">Комментарий:</span> {props.comment || "—"}</p>
              <p><span className="text-slate-500">Кредитный лимит:</span> {props.creditLimitLabel}</p>
            </div>
            <div className="mt-4 grid gap-2 rounded-xl border border-[var(--border)] bg-slate-50 p-3 text-sm">
              <p><span className="text-slate-500">Покупок:</span> {props.purchasesCount}</p>
              <p><span className="text-slate-500">На сумму:</span> {props.totalPurchasesLabel}</p>
              <p><span className="text-slate-500">Оплачено:</span> {props.totalPaidLabel}</p>
              <p><span className="text-slate-500">Текущий долг:</span> {props.totalDebtLabel}</p>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </>
  );
}

