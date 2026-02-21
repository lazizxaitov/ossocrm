"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CustomSelectOption = {
  value: string;
  label: string;
};

type CustomSelectProps = {
  name?: string;
  options: CustomSelectOption[];
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  onValueChange?: (value: string) => void;
};

export function CustomSelect({
  name,
  options,
  value,
  defaultValue,
  placeholder = "Выберите значение",
  required = false,
  disabled = false,
  className = "",
  buttonClassName = "",
  menuClassName = "",
  onValueChange,
}: CustomSelectProps) {
  const isControlled = typeof value === "string";
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedValue = isControlled ? ((value as string) ?? "") : (internalValue ?? "");

  const selectedLabel = useMemo(() => {
    const selected = options.find((option) => option.value === selectedValue);
    return selected?.label ?? placeholder;
  }, [options, placeholder, selectedValue]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
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

  function setValue(nextValue: string) {
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {name ? <input type="hidden" name={name} value={selectedValue} required={required} /> : null}
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 ${buttonClassName}`}
      >
        <span className={selectedValue ? "text-slate-800" : "text-slate-500"}>{selectedLabel}</span>
        <span className={`text-xs text-slate-500 transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open ? (
        <div className={`absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--border)] bg-white p-1 shadow-[0_10px_24px_rgba(15,23,42,0.10)] ${menuClassName}`}>
          {options.map((option) => {
            const active = option.value === selectedValue;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setValue(option.value)}
                className={`block w-full rounded-md px-2 py-2 text-left text-sm transition ${
                  active ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
