export const TRANSPORT_USD_PER_CBM = 85.714653;

export const COSTING_RULE_MODES = {
  LEGACY: "LEGACY",
  CATEGORY_BASED_V2: "CATEGORY_BASED_V2",
} as const;

export type CostingRuleMode = (typeof COSTING_RULE_MODES)[keyof typeof COSTING_RULE_MODES];

type ProductClassifierInput = {
  categoryName?: string | null;
  productName?: string | null;
  sku?: string | null;
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function resolveCostingRuleMode(raw: string | null | undefined): CostingRuleMode {
  return raw === COSTING_RULE_MODES.CATEGORY_BASED_V2
    ? COSTING_RULE_MODES.CATEGORY_BASED_V2
    : COSTING_RULE_MODES.LEGACY;
}

export function getCustomsRateUsdPerUnit(input: ProductClassifierInput) {
  const haystack = [input.categoryName, input.productName, input.sku]
    .map(normalizeText)
    .join(" | ");

  if (!haystack) return 0;
  if (haystack.includes("sifon") || haystack.includes("сифон")) return 0.82;
  if (haystack.includes("smesitel") || haystack.includes("смесител") || haystack.includes("mixer")) return 1.47;
  if (haystack.includes("unitaz") || haystack.includes("унитаз") || haystack.includes("toilet")) return 18.81;
  if (haystack.includes("rakovina") || haystack.includes("раковин") || haystack.includes("sink") || haystack.includes("washbasin")) return 6.65;
  return 0;
}

export function getUnitPurchaseUsd(input: {
  quantity: number;
  unitPriceUsd?: number | null;
  lineTotalUsd?: number | null;
}) {
  const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
  const unitPriceUsd = Number(input.unitPriceUsd ?? 0);
  if (Number.isFinite(unitPriceUsd) && unitPriceUsd > 0) return unitPriceUsd;
  const lineTotalUsd = Number(input.lineTotalUsd ?? 0);
  if (quantity > 0 && Number.isFinite(lineTotalUsd) && lineTotalUsd > 0) return lineTotalUsd / quantity;
  return 0;
}

export function getLinePurchaseUsd(input: {
  quantity: number;
  unitPriceUsd?: number | null;
  lineTotalUsd?: number | null;
}) {
  const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
  const lineTotalUsd = Number(input.lineTotalUsd ?? 0);
  if (Number.isFinite(lineTotalUsd) && lineTotalUsd > 0) return lineTotalUsd;
  const unitPriceUsd = Number(input.unitPriceUsd ?? 0);
  if (quantity > 0 && Number.isFinite(unitPriceUsd) && unitPriceUsd > 0) return quantity * unitPriceUsd;
  return 0;
}

export function calculateV2Costing(input: {
  quantity: number;
  unitPriceUsd?: number | null;
  lineTotalUsd?: number | null;
  cbmPerUnit?: number | null;
  categoryName?: string | null;
  productName?: string | null;
  sku?: string | null;
}) {
  const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
  const baseUnitUsd = getUnitPurchaseUsd(input);
  const baseTotalUsd = getLinePurchaseUsd(input);
  const cbmPerUnit = Number(input.cbmPerUnit ?? 0);
  const transportPerUnitUsd = Number.isFinite(cbmPerUnit) && cbmPerUnit > 0 ? cbmPerUnit * TRANSPORT_USD_PER_CBM : 0;
  const customsPerUnitUsd = getCustomsRateUsdPerUnit(input);
  const extraPerUnitUsd = transportPerUnitUsd + customsPerUnitUsd;
  const totalTransportUsd = quantity > 0 ? transportPerUnitUsd * quantity : 0;
  const totalCustomsUsd = quantity > 0 ? customsPerUnitUsd * quantity : 0;
  const finalUnitCostUsd = baseUnitUsd + extraPerUnitUsd;
  const finalTotalCostUsd = quantity > 0 ? finalUnitCostUsd * quantity : baseTotalUsd;

  return {
    quantity,
    baseUnitUsd,
    baseTotalUsd,
    transportPerUnitUsd,
    customsPerUnitUsd,
    extraPerUnitUsd,
    totalTransportUsd,
    totalCustomsUsd,
    finalUnitCostUsd,
    finalTotalCostUsd,
  };
}
