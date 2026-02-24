"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type CustomDateInputProps = {
  name: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
};

function parseDate(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isInRange(value: string, min?: string, max?: string) {
  if (!value) return true;
  if (min && value < min) return false;
  if (max && value > max) return false;
  return true;
}

const WEEK_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function CustomDateInput({
  name,
  value,
  defaultValue = "",
  onValueChange,
  placeholder = "Выберите дату",
  className = "",
  disabled = false,
  required = false,
  min,
  max,
}: CustomDateInputProps) {
  const isControlled = typeof value === "string";
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = isControlled ? ((value as string) ?? "") : (internalValue ?? "");
  const selectedDate = parseDate(selectedValue);

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(
    monthStart(selectedDate ?? new Date()),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  useEffect(() => {
    if (!isControlled) {
      setInternalValue(defaultValue ?? "");
    }
  }, [defaultValue, isControlled]);

  function recalcPopupPosition() {
    const anchor = buttonRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const popupWidth = 280;
    const popupHeight = 320;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, viewportWidth - popupWidth - 8),
    );
    const showAbove = rect.bottom + 6 + popupHeight > viewportHeight - 8;
    const top = showAbove
      ? Math.max(8, rect.top - popupHeight - 6)
      : rect.bottom + 6;
    setPopupPos({ top, left });
  }

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const inInput = rootRef.current?.contains(target);
      const inPopup = popupRef.current?.contains(target);
      if (!inInput && !inPopup) {
        setOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    recalcPopupPosition();

    function onViewportChange() {
      recalcPopupPosition();
    }

    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open]);

  const label = useMemo(() => {
    if (!selectedDate) return placeholder;
    return selectedDate.toLocaleDateString("ru-RU");
  }, [placeholder, selectedDate]);

  const days = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const lastDate = new Date(year, month + 1, 0).getDate();

    const items: Array<{ key: string; iso: string | null; day: number | null }> =
      [];
    for (let i = 0; i < offset; i += 1) {
      items.push({ key: `empty-${i}`, iso: null, day: null });
    }
    for (let d = 1; d <= lastDate; d += 1) {
      const iso = toIsoDate(new Date(year, month, d));
      items.push({ key: iso, iso, day: d });
    }
    return items;
  }, [viewMonth]);

  function setValue(nextValue: string) {
    if (nextValue && !isInRange(nextValue, min, max)) return;
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
    setOpen(false);
  }

  function prevMonth() {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function nextMonth() {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  const monthTitle = viewMonth.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input type="hidden" name={name} value={selectedValue} required={required} />
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            requestAnimationFrame(() => recalcPopupPosition());
          }
        }}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
      >
        <span className={selectedDate ? "text-slate-800" : "text-slate-500"}>{label}</span>
        <span className={`text-xs text-slate-500 transition ${open ? "rotate-180" : ""}`}>▼</span>
      </button>

      {open
        ? createPortal(
            <div
              ref={popupRef}
              data-custom-date-popup="true"
              style={{ top: popupPos.top, left: popupPos.left }}
              className="osso-date-popup fixed z-[120] w-[280px] rounded-xl border border-[var(--border)] bg-white p-2 shadow-[0_12px_28px_rgba(15,23,42,0.12)]"
            >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              className="rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              Назад
            </button>
            <p className="text-sm font-medium capitalize text-slate-800">{monthTitle}</p>
            <button
              type="button"
              onClick={nextMonth}
              className="rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              Вперед
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-500">
            {WEEK_DAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((item) => {
              if (!item.iso || !item.day) {
                return <span key={item.key} className="h-8" />;
              }
              const active = item.iso === selectedValue;
              const blocked = !isInRange(item.iso, min, max);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setValue(item.iso as string)}
                  disabled={blocked}
                  className={`h-8 rounded-md text-xs transition ${
                    active
                      ? "bg-[var(--accent)] text-white"
                      : blocked
                        ? "cursor-not-allowed text-slate-300"
                        : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {item.day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2">
            <button
              type="button"
              onClick={() => setValue(toIsoDate(new Date()))}
              className="rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              Сегодня
            </button>
            <button
              type="button"
              onClick={() => setValue("")}
              className="rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              Очистить
            </button>
          </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
