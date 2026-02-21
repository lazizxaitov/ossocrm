"use client";

import { useEffect, useMemo, useState } from "react";

type InventoryRow = {
  containerItemId: string;
  productId: string;
  productName: string;
  sku: string;
  containerId: string;
  containerName: string;
  containerStatus: string;
};

type SubmitResult = {
  sessionId: string;
  code: string | null;
  status: "PENDING" | "DISCREPANCY" | "CONFIRMED";
  discrepancyCount: number;
  shortage: Array<{
    productName: string;
    sku: string;
    containerName: string;
    systemQuantity: number;
    actualQuantity: number;
    difference: number;
  }>;
  excess: Array<{
    productName: string;
    sku: string;
    containerName: string;
    systemQuantity: number;
    actualQuantity: number;
    difference: number;
  }>;
};

type SubmitPayload = {
  title?: string;
  items: Array<{
    containerItemId: string;
    actualQuantity: number;
  }>;
};

export function InventoryClient() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [actual, setActual] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.productName.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        row.containerName.toLowerCase().includes(q),
    );
  }, [rows, search]);

  useEffect(() => {
    let cancelled = false;
    async function loadRows() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/warehouse/inventory", { cache: "no-store" });
        const data = (await res.json()) as { rows?: InventoryRow[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить данные.");
        if (!cancelled) {
          const loadedRows = data.rows ?? [];
          setRows(loadedRows);
          setActual((prev) => {
            const next = { ...prev };
            for (const row of loadedRows) {
              if (typeof next[row.containerItemId] !== "string") {
                next[row.containerItemId] = "";
              }
            }
            return next;
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка загрузки.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadRows();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitInventory() {
    setError(null);
    setMessage(null);
    setResult(null);

    const normalizedItems = rows.map((row) => {
      const value = actual[row.containerItemId];
      return {
        containerItemId: row.containerItemId,
        actualQuantity: Number(value),
      };
    });

    if (normalizedItems.some((row) => !Number.isFinite(row.actualQuantity) || row.actualQuantity < 0)) {
      setError("Заполните фактическое количество для всех позиций (число от 0).");
      return;
    }

    const payload: SubmitPayload = {
      title: title.trim() || undefined,
      items: normalizedItems,
    };

    if (!navigator.onLine) {
      setError("Нет подключения к интернету. Инвентаризация работает только онлайн.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/warehouse/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as SubmitResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить инвентаризацию.");

      setResult(data);
      if (data.status === "DISCREPANCY") {
        setError("Количество не совпадает с базой. Код не выдан. Отправьте расхождения администратору.");
      } else {
        setMessage(`Ваш код: ${data.code}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения. Попробуйте еще раз.");
    } finally {
      setSubmitting(false);
    }
  }

  async function sendToAdmin() {
    if (!result?.sessionId) return;
    setError(null);
    const res = await fetch("/api/warehouse/inventory/send-to-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: result.sessionId }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      setError(data.error ?? "Не удалось отправить администратору.");
      return;
    }
    setMessage("Расхождения отправлены администратору.");
  }

  return (
    <div className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <div className="grid gap-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Название сессии (необязательно)"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по товару, SKU или контейнеру"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
      </article>

      <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-800">Позиций для подсчета: {filteredRows.length}</p>
          <button
            type="button"
            onClick={() => void submitInventory()}
            disabled={loading || submitting || !rows.length}
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Сохранение..." : "Готово"}
          </button>
        </div>

        {message ? <p className="mb-2 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mb-2 text-sm text-red-700">{error}</p> : null}

        {loading ? <p className="text-sm text-slate-500">Загрузка...</p> : null}

        <div className="space-y-2">
          {filteredRows.map((row) => (
            <div key={row.containerItemId} className="rounded-xl border border-[var(--border)] px-3 py-2">
              <p className="text-sm font-medium text-slate-800">{row.productName}</p>
              <p className="text-xs text-slate-500">SKU: {row.sku} | Контейнер: {row.containerName}</p>
              <div className="mt-2">
                <label className="text-xs text-slate-600">Фактическое количество</label>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={actual[row.containerItemId] ?? ""}
                  onChange={(event) =>
                    setActual((prev) => ({
                      ...prev,
                      [row.containerItemId]: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
          ))}
          {!loading && !filteredRows.length ? <p className="text-sm text-slate-500">Нет позиций по текущему фильтру.</p> : null}
        </div>
      </article>

      {result ? (
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <h3 className="text-base font-semibold text-slate-900">Результат проверки</h3>
          <p className="mt-1 text-sm text-slate-700">Код подтверждения показан один раз после отправки.</p>
          <p className="text-sm text-slate-700">Расхождения: {result.discrepancyCount}</p>

          {result.discrepancyCount > 0 ? (
            <div className="mt-3 grid gap-3">
              <div>
                <p className="mb-1 text-sm font-medium text-red-700">Недостача</p>
                <div className="space-y-1">
                  {result.shortage.map((row) => (
                    <div key={`${row.sku}-${row.containerName}`} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
                      {row.productName} ({row.sku}) | Контейнер: {row.containerName}
                    </div>
                  ))}
                  {!result.shortage.length ? <p className="text-xs text-slate-500">Нет</p> : null}
                </div>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium text-amber-700">Излишек</p>
                <div className="space-y-1">
                  {result.excess.map((row) => (
                    <div key={`${row.sku}-${row.containerName}`} className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {row.productName} ({row.sku}) | Контейнер: {row.containerName}
                    </div>
                  ))}
                  {!result.excess.length ? <p className="text-xs text-slate-500">Нет</p> : null}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void sendToAdmin()}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Отправить администратору
                </button>
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Отменить
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => void sendToAdmin()}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Отправить код администратору
              </button>
            </div>
          )}
        </article>
      ) : null}
    </div>
  );
}
