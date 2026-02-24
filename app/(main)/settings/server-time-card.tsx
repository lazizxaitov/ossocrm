"use client";

import { useMemo, useState } from "react";
import { CustomSelect } from "@/components/custom-select";
import { updateServerDateTimeAction } from "@/app/(main)/settings/actions";

type ServerTimeCardProps = {
  serverNowLabel: string;
  systemNowLabel: string;
  serverTimeAuto: boolean;
  serverTimeZone: string;
  manualDateTimeValue: string;
  canManage: boolean;
};

const TIME_ZONE_OPTIONS = [
  { value: "UTC", label: "UTC" },
  { value: "Europe/Moscow", label: "Москва (UTC+3)" },
  { value: "Asia/Almaty", label: "Алматы (UTC+5)" },
  { value: "Asia/Tashkent", label: "Ташкент (UTC+5)" },
  { value: "Asia/Dubai", label: "Дубай (UTC+4)" },
  { value: "Europe/Berlin", label: "Берлин (UTC+1/UTC+2)" },
  { value: "America/New_York", label: "Нью-Йорк (UTC-5/UTC-4)" },
];

export function ServerTimeCard({
  serverNowLabel,
  systemNowLabel,
  serverTimeAuto,
  serverTimeZone,
  manualDateTimeValue,
  canManage,
}: ServerTimeCardProps) {
  const [autoMode, setAutoMode] = useState(serverTimeAuto);
  const helperText = useMemo(
    () =>
      autoMode
        ? "Автоматический режим по часовому поясу."
        : "Ручной режим: введите дату и время.",
    [autoMode],
  );

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <h3 className="text-base font-semibold text-slate-900">Дата и время сервера</h3>
      <p className="mt-1 text-sm text-slate-600">
        Текущее серверное время: <span className="font-medium text-slate-800">{serverNowLabel}</span>
      </p>
      <p className="mt-1 text-sm text-slate-600">
        Время в системе: <span className="font-medium text-slate-800">{systemNowLabel}</span>
      </p>

      <form action={updateServerDateTimeAction} className="mt-3 grid gap-2">
        <label className="flex items-center gap-2 rounded border border-[var(--border)] px-3 py-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="serverTimeAuto"
            defaultChecked={serverTimeAuto}
            disabled={!canManage}
            onChange={(event) => setAutoMode(event.target.checked)}
          />
          Автонастройка времени
        </label>

        <CustomSelect
          name="serverTimeZone"
          defaultValue={serverTimeZone}
          disabled={!canManage}
          options={TIME_ZONE_OPTIONS}
        />

        <input
          name="manualDateTime"
          type="datetime-local"
          defaultValue={manualDateTimeValue}
          disabled={autoMode || !canManage}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
        />

        <p className="text-xs text-slate-500">{helperText}</p>

        {canManage ? (
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Сохранить дату и время
          </button>
        ) : (
          <p className="text-sm font-medium text-slate-600">
            Изменение даты и времени доступно только суперадминистратору.
          </p>
        )}
      </form>
    </article>
  );
}
