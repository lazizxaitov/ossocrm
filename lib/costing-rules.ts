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

type PurchaseInput = {
  quantity: number;
  unitPriceUsd?: number | null;
  lineTotalUsd?: number | null;
};

type CustomsOverrideInput = ProductClassifierInput & {
  manualCustomsPerUnitUsd?: number | null;
  fallbackCustomsPerUnitUsd?: number | null;
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

export function getUnitPurchaseUsd(input: PurchaseInput) {
  const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
  const unitPriceUsd = Number(input.unitPriceUsd ?? 0);
  if (Number.isFinite(unitPriceUsd) && unitPriceUsd > 0) return unitPriceUsd;
  const lineTotalUsd = Number(input.lineTotalUsd ?? 0);
  if (quantity > 0 && Number.isFinite(lineTotalUsd) && lineTotalUsd > 0) return lineTotalUsd / quantity;
  return 0;
}

export function getLinePurchaseUsd(input: PurchaseInput) {
  const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
  const lineTotalUsd = Number(input.lineTotalUsd ?? 0);
  if (Number.isFinite(lineTotalUsd) && lineTotalUsd > 0) return lineTotalUsd;
  const unitPriceUsd = Number(input.unitPriceUsd ?? 0);
  if (quantity > 0 && Number.isFinite(unitPriceUsd) && unitPriceUsd > 0) return quantity * unitPriceUsd;
  return 0;
}

export function resolveCustomsPerUnitUsd(input: CustomsOverrideInput) {
  const manualCustomsPerUnitUsd = Number(input.manualCustomsPerUnitUsd ?? 0);
  if (Number.isFinite(manualCustomsPerUnitUsd) && manualCustomsPerUnitUsd > 0) {
    return manualCustomsPerUnitUsd;
  }

  const autoCustomsPerUnitUsd = getCustomsRateUsdPerUnit(input);
  if (autoCustomsPerUnitUsd > 0) {
    return autoCustomsPerUnitUsd;
  }

  const fallbackCustomsPerUnitUsd = Number(input.fallbackCustomsPerUnitUsd ?? 0);
  return Number.isFinite(fallbackCustomsPerUnitUsd) && fallbackCustomsPerUnitUsd > 0 ? fallbackCustomsPerUnitUsd : 0;
}

export function buildCustomsFallbackPerUnitMap<TId extends string | number>(input: {
  items: Array<
    {
      id: TId;
      quantity: number;
      manualCustomsPerUnitUsd?: number | null;
    } & PurchaseInput &
      ProductClassifierInput
  >;
  totalCustomsUsd: number;
}) {
  const totalCustomsUsd = Number(input.totalCustomsUsd ?? 0);
  const fallbackMap = new Map<TId, number>();
  if (!Number.isFinite(totalCustomsUsd) || totalCustomsUsd <= 0) return fallbackMap;

  const unresolved = input.items
    .map((item) => {
      const resolved = resolveCustomsPerUnitUsd({
        categoryName: item.categoryName,
        productName: item.productName,
        sku: item.sku,
        manualCustomsPerUnitUsd: item.manualCustomsPerUnitUsd,
      });
      const quantity = Math.max(0, Math.floor(Number(item.quantity) || 0));
      if (resolved > 0 || quantity <= 0) return null;
      const basis = getLinePurchaseUsd(item) || quantity || 1;
      return { id: item.id, quantity, basis };
    })
    .filter((item): item is { id: TId; quantity: number; basis: number } => Boolean(item));

  const basisTotal = unresolved.reduce((sum, item) => sum + item.basis, 0);
  if (basisTotal <= 0) return fallbackMap;

  for (const item of unresolved) {
    const lineShare = totalCustomsUsd * (item.basis / basisTotal);
    fallbackMap.set(item.id, lineShare / item.quantity);
  }

  return fallbackMap;
}

export function calculateV2Costing(input: {
  quantity: number;
  unitPriceUsd?: number | null;
  lineTotalUsd?: number | null;
  cbmPerUnit?: number | null;
  categoryName?: string | null;
  productName?: string | null;
  sku?: string | null;
  manualCustomsPerUnitUsd?: number | null;
  fallbackCustomsPerUnitUsd?: number | null;
}) {
  const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
  const baseUnitUsd = getUnitPurchaseUsd(input);
  const baseTotalUsd = getLinePurchaseUsd(input);
  const cbmPerUnit = Number(input.cbmPerUnit ?? 0);
  const transportPerUnitUsd = Number.isFinite(cbmPerUnit) && cbmPerUnit > 0 ? cbmPerUnit * TRANSPORT_USD_PER_CBM : 0;
  const customsPerUnitUsd = resolveCustomsPerUnitUsd(input);
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
