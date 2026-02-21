"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionRole } from "@/lib/session-token";

type QuickActionsFabProps = {
  role: SessionRole;
};

type QuickAction = {
  href: string;
  label: string;
  roles: SessionRole[];
};

const ACTIONS: QuickAction[] = [
  {
    href: "/sales",
    label: "Новая продажа",
    roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"],
  },
  {
    href: "/products",
    label: "Создать товар",
    roles: ["SUPER_ADMIN", "ADMIN"],
  },
  {
    href: "/containers",
    label: "Создать контейнер",
    roles: ["SUPER_ADMIN", "ADMIN"],
  },
  {
    href: "/sales",
    label: "Погасить долг",
    roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"],
  },
  {
    href: "/clients",
    label: "Добавить клиента",
    roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"],
  },
  {
    href: "/inventory-sessions",
    label: "Проверить инвентаризацию",
    roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"],
  },
];

export function QuickActionsFab({ role }: QuickActionsFabProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const actions = useMemo(
    () => ACTIONS.filter((action) => action.roles.includes(role)),
    [role],
  );

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  if (!actions.length) return null;

  return (
    <div ref={rootRef} className="fixed bottom-7 right-7 z-40">
      {open ? (
        <div className="absolute bottom-[calc(100%+8px)] right-0 w-64 rounded-xl border border-[var(--border)] bg-white p-2 shadow-[0_14px_30px_rgba(15,23,42,0.16)]">
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Быстрые действия
          </p>
          <div className="grid gap-1">
            {actions.map((action) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={action.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="grid h-14 w-14 place-items-center rounded-full bg-[var(--accent)] text-white shadow-[0_12px_24px_rgba(20,93,160,0.35)] transition hover:opacity-90"
        aria-expanded={open}
        title="Быстрые действия"
      >
        <span aria-hidden="true" className="text-xl leading-none">+</span>
      </button>
    </div>
  );
}
