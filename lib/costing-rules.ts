export const TRANSPORT_USD_PER_CBM = 85.714653;
export const DEFAULT_CUSTOMS_RAKOVINA_USD = 6.65;
export const DEFAULT_CUSTOMS_UNITAZ_USD = 18.81;
export const DEFAULT_CUSTOMS_SIFON_USD = 0.82;
export const DEFAULT_CUSTOMS_SMESITEL_USD = 1.47;
export const DEFAULT_CUSTOMS_OYNA_USD = 0;

export type CostingConfig = {
  transportUsdPerCbm: number;
  customsRakovinaUsd: number;
  customsUnitazUsd: number;
  customsSifonUsd: number;
  customsSmesitelUsd: number;
  customsOynaUsd: number;
};

export const DEFAULT_COSTING_CONFIG: CostingConfig = {
  transportUsdPerCbm: TRANSPORT_USD_PER_CBM,
  customsRakovinaUsd: DEFAULT_CUSTOMS_RAKOVINA_USD,
  customsUnitazUsd: DEFAULT_CUSTOMS_UNITAZ_USD,
  customsSifonUsd: DEFAULT_CUSTOMS_SIFON_USD,
  customsSmesitelUsd: DEFAULT_CUSTOMS_SMESITEL_USD,
  customsOynaUsd: DEFAULT_CUSTOMS_OYNA_USD,
};

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
  costingConfig?: Partial<CostingConfig> | null;
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

function toPositiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function resolveCostingConfig(config?: Partial<CostingConfig> | null): CostingConfig {
  return {
    transportUsdPerCbm: toPositiveNumber(config?.transportUsdPerCbm, DEFAULT_COSTING_CONFIG.transportUsdPerCbm),
    customsRakovinaUsd: toPositiveNumber(config?.customsRakovinaUsd, DEFAULT_COSTING_CONFIG.customsRakovinaUsd),
    customsUnitazUsd: toPositiveNumber(config?.customsUnitazUsd, DEFAULT_COSTING_CONFIG.customsUnitazUsd),
    customsSifonUsd: toPositiveNumber(config?.customsSifonUsd, DEFAULT_COSTING_CONFIG.customsSifonUsd),
    customsSmesitelUsd: toPositiveNumber(config?.customsSmesitelUsd, DEFAULT_COSTING_CONFIG.customsSmesitelUsd),
    customsOynaUsd: toPositiveNumber(config?.customsOynaUsd, DEFAULT_COSTING_CONFIG.customsOynaUsd),
  };
}

export function getCostingConfigFromControl(control: Partial<CostingConfig> | null | undefined): CostingConfig {
  return resolveCostingConfig(control);
}

export function getCustomsRateUsdPerUnit(input: ProductClassifierInput, config?: Partial<CostingConfig> | null) {
  const haystack = [input.categoryName, input.productName, input.sku]
    .map(normalizeText)
    .join(" | ");
  const resolved = resolveCostingConfig(config);

  if (!haystack) return 0;
  if (haystack.includes("sifon") || haystack.includes("сифон")) return resolved.customsSifonUsd;
  if (haystack.includes("smesitel") || haystack.includes("смесител") || haystack.includes("mixer")) return resolved.customsSmesitelUsd;
  if (haystack.includes("unitaz") || haystack.includes("унитаз") || haystack.includes("toilet")) return resolved.customsUnitazUsd;
  if (haystack.includes("rakovina") || haystack.includes("раковин") || haystack.includes("sink") || haystack.includes("washbasin")) return resolved.customsRakovinaUsd;
  if (haystack.includes("oyna") || haystack.includes("mirror") || haystack.includes("зеркал")) return resolved.customsOynaUsd;
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

  const autoCustomsPerUnitUsd = getCustomsRateUsdPerUnit(input, input.costingConfig);
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
  costingConfig?: Partial<CostingConfig> | null;
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
        costingConfig: input.costingConfig,
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
  costingConfig?: Partial<CostingConfig> | null;
}) {
  const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
  const baseUnitUsd = getUnitPurchaseUsd(input);
  const baseTotalUsd = getLinePurchaseUsd(input);
  const cbmPerUnit = Number(input.cbmPerUnit ?? 0);
  const costingConfig = resolveCostingConfig(input.costingConfig);
  const transportPerUnitUsd = Number.isFinite(cbmPerUnit) && cbmPerUnit > 0 ? cbmPerUnit * costingConfig.transportUsdPerCbm : 0;
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
