"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

export type ResizableColumn = {
  id: string;
  label: string;
  defaultWidth: number;
};

export function useResizableColumns(storageKey: string, columns: ResizableColumn[]) {
  const defaults = useMemo(
    () => Object.fromEntries(columns.map((column) => [column.id, column.defaultWidth])) as Record<string, number>,
    [columns],
  );
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return defaults;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Record<string, number>;
      return {
        ...defaults,
        ...Object.fromEntries(
          Object.entries(parsed).filter(([id, width]) => Number.isFinite(width) && width >= 80 && defaults[id]),
        ),
      };
    } catch {
      return defaults;
    }
  });
  const resizeRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(widths));
  }, [storageKey, widths]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const active = resizeRef.current;
      if (!active) return;
      const delta = event.clientX - active.startX;
      setWidths((prev) => ({
        ...prev,
        [active.id]: Math.max(80, Math.round(active.startWidth + delta)),
      }));
    }

    function handleMouseUp() {
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const totalWidth = useMemo(
    () => columns.reduce((sum, column) => sum + (widths[column.id] ?? column.defaultWidth), 0),
    [columns, widths],
  );

  function startResize(id: string, event: ReactMouseEvent<HTMLSpanElement>) {
    resizeRef.current = {
      id,
      startX: event.clientX,
      startWidth: widths[id] ?? defaults[id] ?? 120,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function getWidth(id: string) {
    return widths[id] ?? defaults[id] ?? 120;
  }

  function setColumnWidth(id: string, width: number) {
    setWidths((prev) => ({
      ...prev,
      [id]: Math.max(80, Math.round(width)),
    }));
  }

  function resetWidths() {
    setWidths(defaults);
  }

  return { getWidth, totalWidth, startResize, setColumnWidth, resetWidths };
}

export function ResizableHeaderCell({
  label,
  width,
  onResizeStart,
  onAutoSize,
  className = "",
}: {
  label: string;
  width: number;
  onResizeStart: (event: ReactMouseEvent<HTMLSpanElement>) => void;
  onAutoSize?: () => void;
  className?: string;
}) {
  return (
    <th
      className={`relative border-b-2 border-r border-slate-400 bg-white px-3 py-4 text-center text-[15px] font-semibold ${className}`}
      style={{ width, minWidth: width }}
    >
      <span className="block pr-3">{label}</span>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Изменить ширину колонки ${label}`}
        onMouseDown={onResizeStart}
        onDoubleClick={onAutoSize}
        className="absolute right-0 top-0 h-full w-3 cursor-col-resize select-none"
      >
        <span className="absolute right-1 top-0 h-full w-px bg-slate-300" />
      </span>
    </th>
  );
}
