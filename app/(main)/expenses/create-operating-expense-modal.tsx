"use client";

import { useState } from "react";
import { createOperatingExpenseAction } from "@/app/(main)/expenses/actions";
import { CustomConfirmDialog } from "@/components/custom-confirm-dialog";
import { CustomSelect } from "@/components/custom-select";

type InvestorOption = {
  id: string;
  name: string;
};

type CreateOperatingExpenseModalProps = {
  investors: InvestorOption[];
};

function nowLocalDateTimeValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

export function CreateOperatingExpenseModal({ investors }: CreateOperatingExpenseModalProps) {
  const [open, setOpen] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [investorId, setInvestorId] = useState("");

  function requestClose() {
    setConfirmCloseOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Добавить расход
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={requestClose}>
          <div className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Новый расход</h3>
            <p className="mt-1 text-xs text-slate-500">Электричество, газ, зарплаты и другие операционные расходы.</p>

            <form action={createOperatingExpenseAction} className="mt-4 grid gap-2">
              <label className="text-xs text-slate-600">Название расхода</label>
              <input
                name="title"
                required
                placeholder="Например: Электричество за март"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Дата и время</label>
              <input
                name="spentAt"
                type="datetime-local"
                defaultValue={nowLocalDateTimeValue()}
                required
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">Сумма (USD)</label>
              <input
                name="amountUSD"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="Сумма расхода"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />

              <label className="text-xs text-slate-600">За счёт инвестора</label>
              <CustomSelect
                name="investorId"
                required
                value={investorId}
                onValueChange={setInvestorId}
                placeholder="Выберите инвестора"
                options={investors.map((investor) => ({ value: investor.id, label: investor.name }))}
              />

              <div className="mt-1 flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={requestClose}
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
        title="Закрыть добавление расхода"
        message="Данные формы будут потеряны. Закрыть окно?"
        confirmLabel="Закрыть"
        cancelLabel="Остаться"
        danger
        onCancel={() => setConfirmCloseOpen(false)}
        onConfirm={() => {
          setConfirmCloseOpen(false);
          setOpen(false);
        }}
      />
    </>
  );
}
