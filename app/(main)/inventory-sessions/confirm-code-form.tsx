"use client";

import { useActionState } from "react";
import {
  confirmInventoryCodeAction,
  type ConfirmCodeState,
} from "@/app/(main)/inventory-sessions/actions";

export function ConfirmCodeForm() {
  const initialState: ConfirmCodeState = { error: null, success: null };
  const [state, action, pending] = useActionState(confirmInventoryCodeAction, initialState);

  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white p-4">
      <div>
        <p className="text-sm font-medium text-slate-800">Подтверждение по коду</p>
        <p className="text-xs text-slate-500">
          Введите код, который склад показал после инвентаризации. Код действует 10 минут.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          name="code"
          required
          maxLength={3}
          pattern="\d{3}"
          placeholder="482"
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] sm:max-w-[180px]"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          Подтвердить код
        </button>
      </div>
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
    </form>
  );
}
