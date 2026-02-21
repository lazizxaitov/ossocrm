"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/login/actions";

const initialState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="grid gap-4 rounded-2xl border border-[var(--border)] bg-white p-6">
      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="login">
          Логин
        </label>
        <input
          id="login"
          name="login"
          type="text"
          autoComplete="username"
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          placeholder="admin"
          required
        />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="password">
          Пароль
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          placeholder="••••••••"
          required
        />
      </div>

      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="submit"
          name="entryPoint"
          value="system"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          Вход в систему
        </button>
        <button
          type="submit"
          name="entryPoint"
          value="warehouse"
          disabled={pending}
          className="rounded-lg border border-[var(--accent)] bg-white px-4 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft)] disabled:opacity-60"
        >
          Вход в склад
        </button>
      </div>
    </form>
  );
}
