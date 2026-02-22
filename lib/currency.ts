export function formatUsd(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function toNumber(value: number | string | FormDataEntryValue | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : NaN;
}
