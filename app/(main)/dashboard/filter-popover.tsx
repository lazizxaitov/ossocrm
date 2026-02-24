"use client";

import { useEffect, useRef, useState } from "react";
import { CustomDateInput } from "@/components/custom-date-input";
import { CustomSelect } from "@/components/custom-select";
import type { DashboardRangeKey } from "@/lib/dashboard";

type ContainerOption = {
  id: string;
  name: string;
};

type DashboardFilterPopoverProps = {
  range: DashboardRangeKey;
  from?: string;
  to?: string;
  containerId?: string;
  containers: ContainerOption[];
};

export function DashboardFilterPopover({
  range,
  from,
  to,
  containerId,
  containers,
}: DashboardFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      const target = event.target as Element | null;
      const inDatePopup = target?.closest(".osso-date-popup,[data-custom-date-popup='true']");
      if (inDatePopup) return;
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative w-full md:w-auto">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex cursor-pointer items-center rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Фильтр
      </button>
      {open ? (
        <div className="mt-2 rounded-xl border border-[var(--border)] bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)] md:absolute md:right-0 md:mt-3 md:w-[560px]">
          <form className="grid gap-2 md:grid-cols-5">
            <CustomSelect
              name="range"
              defaultValue={range}
              options={[
                { value: "today", label: "Сегодня" },
                { value: "7d", label: "7 дней" },
                { value: "month", label: "Месяц" },
                { value: "custom", label: "Произвольный период" },
              ]}
            />
            <CustomDateInput name="from" defaultValue={from ?? ""} placeholder="Дата от" />
            <CustomDateInput name="to" defaultValue={to ?? ""} placeholder="Дата до" />
            <CustomSelect
              name="containerId"
              defaultValue={containerId ?? "all"}
              options={[
                { value: "all", label: "По всем контейнерам" },
                ...containers.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Применить
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
