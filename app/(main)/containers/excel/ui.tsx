"use client";

import Image from "next/image";
import { useActionState, useMemo, useRef, useState } from "react";
import { createContainerAction, type CreateContainerFormState } from "@/app/(main)/containers/actions";
import {
  buildCustomsFallbackPerUnitMap,
  calculateV2Costing,
  COSTING_RULE_MODES,
  getCostingConfigFromControl,
  resolveCostingRuleMode,
  type CostingConfig,
} from "@/lib/costing-rules";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  size: string;
  imagePath?: string | null;
  costPriceUSD: number;
  cbm: number;
  kg: number;
  basePriceUSD: number;
  categoryName: string;
};

type GridRow = {
  key: number;
  productId: string;
  factoryName: string;
  localName: string;
  priceCNY: string;
  saize: string;
  color: string;
  quantity: string;
  totalAmountCNY: string;
  cbm: string;
  kg: string;
  totalCbm: string;
  nwKgs: string;
  exchangeRate: string;
  totalAmountUSD: string;
  manualCustomsPerUnitUSD: string;
};

type InvestmentRow = {
  key: number;
  investorId: string;
  investorName: string;
  investedAmountUSD: string;
  percentageShare: string;
};

type ExpenseRow = {
  key: number;
  title: string;
  category: "LOGISTICS" | "CUSTOMS" | "STORAGE" | "TRANSPORT" | "OTHER";
  amountUSD: string;
  description: string;
};


function toNumber(raw: string) {
  const normalized = String(raw ?? "").trim().replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function normalizeExchangeRateToUsd(raw: string | number) {
  const rate = typeof raw === "number" ? raw : toNumber(raw);
  if (!(rate > 0)) return 0;
  return rate > 1 ? 1 / rate : rate;
}

function convertCnyToUsd(amountCny: number, rateRaw: string | number) {
  const rate = normalizeExchangeRateToUsd(rateRaw);
  if (!(amountCny > 0) || !(rate > 0)) return 0;
  return amountCny * rate;
}

function convertUsdToCny(amountUsd: number, rateRaw: string | number) {
  const rate = normalizeExchangeRateToUsd(rateRaw);
  if (!(amountUsd > 0) || !(rate > 0)) return 0;
  return amountUsd / rate;
}

function calcTotalCbm(row: Pick<GridRow, "quantity" | "cbm">) {
  const q = Math.max(0, Math.floor(toNumber(row.quantity)));
  const cbm = toNumber(row.cbm);
  if (q > 0 && cbm > 0) return String(Number((q * cbm).toFixed(4)));
  return "";
}

function calcNwKgs(row: Pick<GridRow, "quantity" | "kg">) {
  const q = Math.max(0, Math.floor(toNumber(row.quantity)));
  const kg = toNumber(row.kg);
  if (q > 0 && kg > 0) return String(Number((q * kg).toFixed(3)));
  return "";
}

function calcTotalAmountCny(row: Pick<GridRow, "quantity" | "priceCNY">) {
  const q = Math.max(0, Math.floor(toNumber(row.quantity)));
  const unit = toNumber(row.priceCNY);
  if (q > 0 && unit > 0) return String(Number((q * unit).toFixed(2)));
  return "";
}

function calcLineTotalUsd(row: Pick<GridRow, "quantity" | "priceCNY" | "totalAmountCNY" | "exchangeRate">) {
  const totalCny = toNumber(row.totalAmountCNY) || toNumber(calcTotalAmountCny(row));
  const totalUsd = convertCnyToUsd(totalCny, row.exchangeRate);
  if (totalUsd > 0) return String(Number(totalUsd.toFixed(2)));
  return "";
}

function getWorksheetCellText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (typeof value === "object") {
    const candidate = value as { text?: string; result?: string | number; richText?: Array<{ text?: string }> };
    if (typeof candidate.text === "string") return candidate.text.trim();
    if (typeof candidate.result === "string" || typeof candidate.result === "number") return String(candidate.result).trim();
    if (Array.isArray(candidate.richText)) return candidate.richText.map((item) => item.text ?? "").join("").trim();
  }
  return "";
}

function normalizeHeader(raw: string) {
  return raw.toLowerCase().replace(/\s+/g, " ").replace(/[`'"]/g, "").trim();
}

function getWorksheetCellNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null) {
    const candidate = value as { result?: string | number; text?: string };
    if (typeof candidate.result === "number") return candidate.result;
    if (typeof candidate.result === "string") {
      const parsed = toNumber(candidate.result);
      if (Number.isFinite(parsed) && parsed !== 0) return parsed;
    }
    if (typeof candidate.text === "string") {
      const parsed = toNumber(candidate.text);
      if (Number.isFinite(parsed) && parsed !== 0) return parsed;
    }
  }
  const parsed = toNumber(getWorksheetCellText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function classifyExpenseCategory(title: string): ExpenseRow["category"] {
  const normalized = normalizeHeader(title);
  if (
    normalized.includes("растам") ||
    normalized.includes("custom") ||
    normalized.includes("cert") ||
    normalized.includes("серт") ||
    normalized.includes("оформ")
  ) {
    return "CUSTOMS";
  }
  if (normalized.includes("склад") || normalized.includes("хранен")) return "STORAGE";
  if (
    normalized.includes("транспорт") ||
    normalized.includes("transport") ||
    normalized.includes("достав") ||
    normalized.includes("автопер") ||
    normalized.includes("yo'lga")
  ) {
    return "TRANSPORT";
  }
  return "OTHER";
}

function formatSheetValue(value: number, digits = 2) {
  if (!Number.isFinite(value) || value === 0) return "—";
  return value.toFixed(digits);
}

function getDefaultContainerName() {
  const now = new Date();
  const month = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(now);
  return `Контейнер ${month} ${now.getFullYear()}`;
}

function getContainerSheetName(name: string) {
  const cleaned = String(name ?? "")
    .trim()
    .replace(/[\\/*?:[\]]/g, " ")
    .replace(/\s+/g, " ");
  return (cleaned || getDefaultContainerName()).slice(0, 31);
}

function getAverageColumnLabel(mode: string) {
  return mode === COSTING_RULE_MODES.CATEGORY_BASED_V2 ? "YO'L GA 1 SHT" : "ortacha birlik";
}

function getLogisticsColumnLabel(mode: string) {
  return mode === COSTING_RULE_MODES.CATEGORY_BASED_V2
    ? "YO'L + RASTAMOJKA 1 SHT"
    : "YOLGA VA Rastamojka ortacha birligi";
}

function getCustomsFormulaForExcel(rowNumber: number) {
  return `IF(OR(ISNUMBER(SEARCH("sifon",A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("сифон",A${rowNumber}&" "&B${rowNumber}))),V$4,IF(OR(ISNUMBER(SEARCH("smesitel",A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("смес",A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("mixer",A${rowNumber}&" "&B${rowNumber}))),W$4,IF(OR(ISNUMBER(SEARCH("unitaz",A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("унитаз",A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("toilet",A${rowNumber}&" "&B${rowNumber}))),U$4,IF(OR(ISNUMBER(SEARCH("rakovina",A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("раков",A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("sink",A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("washbasin",A${rowNumber}&" "&B${rowNumber}))),T$4,IF(OR(ISNUMBER(SEARCH("oyna",A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("mirror",A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("зеркал",A${rowNumber}&" "&B${rowNumber}))),X$4,0)))))`;
}

function computeRowMetrics({
  row,
  product,
  costingRuleMode,
  totalRoadExpenses,
  totalCustomsExpenses,
  totalProductUsd,
  manualCustomsPerUnitUsd,
  fallbackCustomsPerUnitUsd,
  costingConfig,
}: {
  row: GridRow;
  product: ProductOption | null;
  costingRuleMode: string;
  totalRoadExpenses: number;
  totalCustomsExpenses: number;
  totalProductUsd: number;
  manualCustomsPerUnitUsd?: number | null;
  fallbackCustomsPerUnitUsd?: number | null;
  costingConfig?: Partial<CostingConfig> | null;
}) {
  const quantity = Math.max(0, Math.floor(toNumber(row.quantity)));
  const baseUnitUsd =
    toNumber(row.priceCNY) > 0 && normalizeExchangeRateToUsd(row.exchangeRate) > 0
      ? convertCnyToUsd(toNumber(row.priceCNY), row.exchangeRate)
      : (product?.costPriceUSD ?? 0);
  const baseTotalUsd = toNumber(row.totalAmountUSD) || toNumber(calcLineTotalUsd(row));
  const baseTotalCny = toNumber(row.totalAmountCNY) || toNumber(calcTotalAmountCny(row));

  if (costingRuleMode === COSTING_RULE_MODES.CATEGORY_BASED_V2) {
    const metrics = calculateV2Costing({
      quantity,
      unitPriceUsd: baseUnitUsd,
      lineTotalUsd: baseTotalUsd,
      cbmPerUnit: toNumber(row.cbm) || product?.cbm || 0,
      categoryName: product?.categoryName,
      productName: row.localName || product?.name,
      sku: row.factoryName || product?.sku,
      manualCustomsPerUnitUsd,
      fallbackCustomsPerUnitUsd,
      costingConfig,
    });
    return {
      quantity,
      unitUsdValue: metrics.baseUnitUsd,
      productTotalValue: metrics.baseTotalUsd,
      productTotalCnyValue: baseTotalCny,
      salePriceUsdValue: product?.basePriceUSD ?? 0,
      saleTotalUsdValue: quantity > 0 && (product?.basePriceUSD ?? 0) > 0 ? (product?.basePriceUSD ?? 0) * quantity : 0,
      averagePercentValue: metrics.transportPerUnitUsd,
      logisticsAverageValue: metrics.extraPerUnitUsd,
      perUnitTotalValue: metrics.finalUnitCostUsd,
      grandTotalValue: metrics.finalTotalCostUsd,
      totalTransportUsd: metrics.totalTransportUsd,
      totalCustomsUsd: metrics.totalCustomsUsd,
    };
  }

  const totalLogisticsAndCustoms = totalRoadExpenses + totalCustomsExpenses;
  const averagePercentValue = totalProductUsd > 0 ? (baseTotalUsd / totalProductUsd) * 100 : 0;
  const totalTransportUsd = totalRoadExpenses > 0 ? (totalRoadExpenses * averagePercentValue) / 100 : 0;
  const totalCustomsUsd = totalCustomsExpenses > 0 ? (totalCustomsExpenses * averagePercentValue) / 100 : 0;
  const logisticsAverageValue = totalLogisticsAndCustoms > 0 ? (totalLogisticsAndCustoms * averagePercentValue) / 100 : 0;
  const grandTotalValue = baseTotalUsd + logisticsAverageValue;
  const perUnitTotalValue = quantity > 0 ? grandTotalValue / quantity : 0;
  return {
    quantity,
    unitUsdValue: baseUnitUsd,
    productTotalValue: baseTotalUsd,
    productTotalCnyValue: baseTotalCny,
    salePriceUsdValue: product?.basePriceUSD ?? 0,
    saleTotalUsdValue: quantity > 0 && (product?.basePriceUSD ?? 0) > 0 ? (product?.basePriceUSD ?? 0) * quantity : 0,
    averagePercentValue,
    logisticsAverageValue,
    perUnitTotalValue,
    grandTotalValue,
    totalTransportUsd,
    totalCustomsUsd,
  };
}

export function CreateContainerExcelPage({
  defaultRate,
  products,
  investors,
  costingRuleMode,
  costingConfig,
}: {
  defaultRate: number | null;
  products: ProductOption[];
  investors: Array<{ id: string; name: string }>;
  costingRuleMode: string;
  costingConfig?: Partial<CostingConfig>;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const initialState: CreateContainerFormState = { error: null, success: false };
  const [state, formAction, isPending] = useActionState(createContainerAction, initialState);

  const [name, setName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayIso);
  const [arrivalDate, setArrivalDate] = useState("");
  const [purchaseCny, setPurchaseCny] = useState("");
  const [rate, setRate] = useState(defaultRate ? String(defaultRate) : "");
  const [overallCustomsUSD, setOverallCustomsUSD] = useState("");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<ProductOption | null>(null);
  const [pendingQuantity, setPendingQuantity] = useState("1");
  const [search, setSearch] = useState("");
  const [nextKey, setNextKey] = useState(2);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [excelBusy, setExcelBusy] = useState(false);
  const [excelMessage, setExcelMessage] = useState<string | null>(null);
  const excelInputRef = useRef<HTMLInputElement | null>(null);


  const [nextInvestmentKey, setNextInvestmentKey] = useState(2);
  const [investmentRows, setInvestmentRows] = useState<InvestmentRow[]>([]);

  const [nextExpenseKey, setNextExpenseKey] = useState(2);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const activeCostingRuleMode = resolveCostingRuleMode(costingRuleMode);
  const resolvedCostingConfig = useMemo(() => getCostingConfigFromControl(costingConfig), [costingConfig]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productBySku = useMemo(() => new Map(products.map((p) => [p.sku.trim().toLowerCase(), p])), [products]);
  const productByName = useMemo(() => new Map(products.map((p) => [p.name.trim().toLowerCase(), p])), [products]);
  const investorByName = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const inv of investors) {
      map.set(inv.name.trim().toLowerCase(), inv);
    }
    return map;
  }, [investors]);
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? products.filter((p) => `${p.sku} ${p.name} ${p.categoryName}`.toLowerCase().includes(q))
      : products;
    return list.slice().sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [products, search]);

  const containerItemsJson = useMemo(() => {
    const payload = rows
      .map((r) => {
        const quantity = Math.max(0, Math.floor(toNumber(r.quantity)));
        const rateValue = normalizeExchangeRateToUsd(r.exchangeRate);
        const priceCny = toNumber(r.priceCNY);
        const totalAmountCny = toNumber(r.totalAmountCNY) || toNumber(calcTotalAmountCny(r));
        const unitPriceUSD = priceCny > 0 && rateValue > 0 ? Number(convertCnyToUsd(priceCny, rateValue).toFixed(4)) : 0;
        const lineTotalUSD = toNumber(r.totalAmountUSD) || (totalAmountCny > 0 && rateValue > 0 ? Number(convertCnyToUsd(totalAmountCny, rateValue).toFixed(2)) : 0);
        const cbm = toNumber(r.cbm);
        const kg = toNumber(r.kg);
        const totalCbm = toNumber(r.totalCbm);
        return {
          productId: r.productId,
          sizeLabel: String(r.saize ?? "").trim(),
          color: String(r.color ?? "").trim(),
          quantity,
          unitPriceUSD: unitPriceUSD > 0 ? unitPriceUSD : undefined,
          lineTotalUSD: lineTotalUSD > 0 ? lineTotalUSD : undefined,
          cbm: cbm > 0 ? cbm : undefined,
          kg: kg > 0 ? kg : undefined,
          totalCbm: totalCbm > 0 ? totalCbm : undefined,
          manualCustomsPerUnitUSD: toNumber(r.manualCustomsPerUnitUSD) > 0 ? toNumber(r.manualCustomsPerUnitUSD) : undefined,
        };
      })
      .filter((x) => x.productId && x.quantity > 0);
    return JSON.stringify(payload);
  }, [rows]);

  const investmentsJson = useMemo(() => {
    const payload = investmentRows
      .map((r) => ({
        investorId: r.investorId,
        investedAmountUSD: toNumber(r.investedAmountUSD),
        percentageShare: toNumber(r.percentageShare),
      }))
      .filter((x) => x.investorId && x.investedAmountUSD > 0);
    return JSON.stringify(payload);
  }, [investmentRows]);

  const derivedOverallCustomsUSD = useMemo(
    () =>
      rows.reduce((sum, row) => {
        const quantity = Math.max(0, Math.floor(toNumber(row.quantity)));
        const customsPerUnit = toNumber(row.manualCustomsPerUnitUSD);
        return sum + (quantity > 0 && customsPerUnit > 0 ? quantity * customsPerUnit : 0);
      }, 0),
    [rows],
  );

  const effectiveOverallCustomsUSD = derivedOverallCustomsUSD > 0 ? derivedOverallCustomsUSD : toNumber(overallCustomsUSD);

  const expensesJson = useMemo(() => {
    const payload = expenseRows
      .map((r) => ({
        title: r.title,
        category: r.category,
        amountUSD: toNumber(r.amountUSD),
        description: r.description,
      }))
      .filter((x) => String(x.title ?? "").trim().length > 0 && x.amountUSD > 0);
    if (effectiveOverallCustomsUSD > 0) {
      payload.push({
        title: "Растаможка (общая)",
        category: "CUSTOMS",
        amountUSD: effectiveOverallCustomsUSD,
        description:
          derivedOverallCustomsUSD > 0
            ? "Растаможка рассчитана из колонки TRANSPORTGA × количество"
            : "Ручная общая сумма растаможки из Excel-окна",
      });
    }
    return JSON.stringify(payload);
  }, [derivedOverallCustomsUSD, effectiveOverallCustomsUSD, expenseRows]);

  const productTotals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const quantity = Math.max(0, Math.floor(toNumber(row.quantity)));
        acc.quantity += quantity;
        acc.totalCny += toNumber(row.totalAmountCNY) || toNumber(calcTotalAmountCny(row));
        acc.totalUsd += toNumber(row.totalAmountUSD) || toNumber(calcLineTotalUsd(row));
        acc.totalCbm += toNumber(row.totalCbm) || toNumber(calcTotalCbm(row));
        acc.totalKg += toNumber(row.nwKgs) || toNumber(calcNwKgs(row));
        return acc;
      },
      { quantity: 0, totalCny: 0, totalUsd: 0, totalCbm: 0, totalKg: 0 },
    );
  }, [rows]);

  const expenseTotals = useMemo(() => {
    const totals = expenseRows.reduce(
      (acc, row) => {
        const amount = toNumber(row.amountUSD);
        acc.all += amount;
        if (row.category === "CUSTOMS") acc.customs += amount;
        if (row.category === "LOGISTICS" || row.category === "TRANSPORT") acc.road += amount;
        return acc;
      },
      { road: 0, customs: 0, all: 0 },
    );
    if (effectiveOverallCustomsUSD > 0) {
      totals.customs += effectiveOverallCustomsUSD;
      totals.all += effectiveOverallCustomsUSD;
    }
    return totals;
  }, [effectiveOverallCustomsUSD, expenseRows]);

  const investedTotal = useMemo(
    () => investmentRows.reduce((sum, row) => sum + toNumber(row.investedAmountUSD), 0),
    [investmentRows],
  );

  const customsFallbackMap = useMemo(
    () =>
      buildCustomsFallbackPerUnitMap({
        items: rows.map((row) => {
          const product = row.productId ? productMap.get(row.productId) ?? null : null;
          return {
            id: row.key,
            quantity: Math.max(0, Math.floor(toNumber(row.quantity))),
            unitPriceUsd:
              toNumber(row.priceCNY) > 0 && normalizeExchangeRateToUsd(row.exchangeRate) > 0
                ? convertCnyToUsd(toNumber(row.priceCNY), row.exchangeRate)
                : (product?.costPriceUSD ?? 0),
            lineTotalUsd: toNumber(row.totalAmountUSD) || toNumber(calcLineTotalUsd(row)),
            categoryName: product?.categoryName,
            productName: row.localName || product?.name,
            sku: row.factoryName || product?.sku,
            manualCustomsPerUnitUsd: toNumber(row.manualCustomsPerUnitUSD),
          };
        }),
        totalCustomsUsd: expenseTotals.customs,
      }),
    [rows, productMap, expenseTotals.customs, resolvedCostingConfig],
  );

  const v2Totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const product = row.productId ? productMap.get(row.productId) ?? null : null;
        const metrics = computeRowMetrics({
          row,
          product,
          costingRuleMode: activeCostingRuleMode,
          totalRoadExpenses: expenseTotals.road,
          totalCustomsExpenses: expenseTotals.customs,
          totalProductUsd: productTotals.totalUsd,
          manualCustomsPerUnitUsd: toNumber(row.manualCustomsPerUnitUSD),
          fallbackCustomsPerUnitUsd: customsFallbackMap.get(row.key) ?? 0,
          costingConfig: resolvedCostingConfig,
        });
        acc.transport += metrics.totalTransportUsd;
        acc.customs += metrics.totalCustomsUsd;
        acc.grandTotal += metrics.grandTotalValue;
        return acc;
      },
      { transport: 0, customs: 0, grandTotal: 0 },
    );
  }, [rows, productMap, activeCostingRuleMode, expenseTotals.road, expenseTotals.customs, productTotals.totalUsd, customsFallbackMap, resolvedCostingConfig]);

  const summaryBlock = useMemo(() => {
    if (activeCostingRuleMode === COSTING_RULE_MODES.CATEGORY_BASED_V2) {
      const extraOperationalExpenses = Math.max(0, expenseTotals.all - expenseTotals.road - expenseTotals.customs);
      const avgUnitUsd = productTotals.quantity > 0 ? productTotals.totalUsd / productTotals.quantity : 0;
      const avgExpensePerUnit = productTotals.quantity > 0 ? (v2Totals.transport + v2Totals.customs) / productTotals.quantity : 0;
      const finalPerUnit = avgUnitUsd + avgExpensePerUnit;
      const grandTotalUsd = v2Totals.grandTotal + extraOperationalExpenses;
      const balance = investedTotal - grandTotalUsd;
      return {
        avgUnitUsd,
        avgExpensePerUnit,
        finalPerUnit,
        grandTotalUsd,
        balance,
      };
    }
    const avgUnitUsd = productTotals.quantity > 0 ? productTotals.totalUsd / productTotals.quantity : 0;
    const avgExpensePerUnit = productTotals.quantity > 0 ? expenseTotals.all / productTotals.quantity : 0;
    const finalPerUnit = avgUnitUsd + avgExpensePerUnit;
    const balance = investedTotal - (productTotals.totalUsd + expenseTotals.all);
    return {
      avgUnitUsd,
      avgExpensePerUnit,
      finalPerUnit,
      grandTotalUsd: productTotals.totalUsd + expenseTotals.all,
      balance,
    };
  }, [
    activeCostingRuleMode,
    expenseTotals.all,
    expenseTotals.customs,
    expenseTotals.road,
    investedTotal,
    productTotals.quantity,
    productTotals.totalUsd,
    v2Totals.customs,
    v2Totals.grandTotal,
    v2Totals.transport,
  ]);

  const purchaseCnyValue = useMemo(() => {
    const manual = toNumber(purchaseCny);
    return manual > 0 ? manual : productTotals.totalCny;
  }, [productTotals.totalCny, purchaseCny]);

  const summaryRow = useMemo(
    () => [
      { label: "SETS", value: productTotals.quantity > 0 ? String(productTotals.quantity) : "—" },
      { label: "RMB", value: formatSheetValue(purchaseCnyValue, 2) },
      { label: "USD", value: formatSheetValue(productTotals.totalUsd, 2) },
      { label: "CBM", value: formatSheetValue(productTotals.totalCbm, 4) },
      { label: "TOTAL CBM", value: formatSheetValue(productTotals.totalCbm, 4) },
      { label: "KG", value: formatSheetValue(productTotals.totalKg, 3) },
      { label: "TOTAL N.W. KGS", value: formatSheetValue(productTotals.totalKg, 3) },
      { label: "KURS", value: rate || "—" },
      {
        label: "YO'L GA",
        value: formatSheetValue(activeCostingRuleMode === COSTING_RULE_MODES.CATEGORY_BASED_V2 ? v2Totals.transport : expenseTotals.road, 2),
      },
      {
        label: "RASTAMOJKA",
        value: formatSheetValue(activeCostingRuleMode === COSTING_RULE_MODES.CATEGORY_BASED_V2 ? v2Totals.customs : expenseTotals.customs, 2),
      },
      { label: "TOTAL AMOUNT", value: formatSheetValue(summaryBlock.grandTotalUsd, 2) },
      { label: "СРЕДНЯЯ ЦЕНА ЗА 1 ШТ", value: formatSheetValue(summaryBlock.avgUnitUsd, 4) },
      {
        label: activeCostingRuleMode === COSTING_RULE_MODES.CATEGORY_BASED_V2 ? "YO'L + RASTAMOJKA 1 SHT" : "СРЕДНИЕ ДОП. РАСХОДЫ 1 ШТ",
        value: formatSheetValue(summaryBlock.avgExpensePerUnit, 4),
      },
      { label: "BIR DONASI", value: formatSheetValue(summaryBlock.finalPerUnit, 4) },
      { label: "TOLANGAN SUMMA", value: formatSheetValue(investedTotal, 2) },
      { label: "Инвестиции", value: formatSheetValue(investedTotal, 2) },
      { label: "Расходы", value: formatSheetValue(expenseTotals.all, 2) },
      { label: "Остаток", value: summaryBlock.balance.toFixed(2) },
    ],
    [
      expenseTotals.all,
      expenseTotals.customs,
      expenseTotals.road,
      investedTotal,
      activeCostingRuleMode,
      productTotals.quantity,
      productTotals.totalCbm,
      productTotals.totalKg,
      productTotals.totalUsd,
      purchaseCnyValue,
      rate,
      summaryBlock.avgExpensePerUnit,
      summaryBlock.avgUnitUsd,
      summaryBlock.balance,
      summaryBlock.finalPerUnit,
      summaryBlock.grandTotalUsd,
      v2Totals.customs,
      v2Totals.transport,
    ],
  );

  function resolveProduct(row: Pick<GridRow, "factoryName" | "localName">) {
    const factoryKey = String(row.factoryName ?? "").trim().toLowerCase();
    const localKey = String(row.localName ?? "").trim().toLowerCase();
    return (factoryKey ? productBySku.get(factoryKey) ?? productByName.get(factoryKey) : null) ??
      (localKey ? productByName.get(localKey) ?? productBySku.get(localKey) : null) ??
      null;
  }

  function updateRow(key: number, patch: Partial<GridRow>) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };

        if (patch.factoryName !== undefined || patch.localName !== undefined) {
          const hit = resolveProduct(next);
          if (hit) {
            next.productId = hit.id;
            if (!next.factoryName) next.factoryName = hit.sku;
            if (!next.localName) next.localName = hit.name;
            if (!next.saize) next.saize = hit.size || "";
            if (!next.priceCNY && hit.costPriceUSD > 0 && normalizeExchangeRateToUsd(next.exchangeRate) > 0) {
              next.priceCNY = String(Number(convertUsdToCny(hit.costPriceUSD, next.exchangeRate).toFixed(4)));
            }
            if (!next.cbm && hit.cbm > 0) next.cbm = String(hit.cbm);
            if (!next.kg && hit.kg > 0) next.kg = String(hit.kg);
          } else {
            next.productId = "";
          }
        }

        if (patch.quantity !== undefined || patch.priceCNY !== undefined) {
          if (patch.totalAmountCNY === undefined) next.totalAmountCNY = calcTotalAmountCny(next);
        }
        if (
          patch.quantity !== undefined ||
          patch.priceCNY !== undefined ||
          patch.totalAmountCNY !== undefined ||
          patch.exchangeRate !== undefined
        ) {
          if (patch.totalAmountUSD === undefined) next.totalAmountUSD = calcLineTotalUsd(next);
        }
        if (patch.quantity !== undefined || patch.cbm !== undefined) {
          next.totalCbm = calcTotalCbm(next);
        }
        if (patch.quantity !== undefined || patch.kg !== undefined) {
          next.nwKgs = calcNwKgs(next);
        }
        if (patch.manualCustomsPerUnitUSD !== undefined) {
          next.manualCustomsPerUnitUSD = patch.manualCustomsPerUnitUSD;
        }
        return next;
      }),
    );
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function importFromExcelFile(file: File) {
    setExcelBusy(true);
    setExcelMessage(null);
    try {
      const ExcelJSModule = await import("exceljs");
      const workbook = new ExcelJSModule.Workbook();
      const buffer = await file.arrayBuffer();
      await workbook.xlsx.load(buffer);
      const worksheet =
        workbook.worksheets.find((sheet) => {
          for (let rowNumber = 1; rowNumber <= Math.min(40, sheet.rowCount); rowNumber += 1) {
            const row = sheet.getRow(rowNumber);
            const values = Array.from({ length: Math.min(30, sheet.columnCount || 30) }, (_, index) =>
              normalizeHeader(getWorksheetCellText(row.getCell(index + 1).value)),
            );
            if (values.includes("factori name") && values.includes("osso name") && values.includes("unit price")) return true;
          }
          return false;
        }) ?? workbook.worksheets[0];
      if (!worksheet) throw new Error("В файле нет листов.");

      let headerRowNumber = -1;
      for (let rowNumber = 1; rowNumber <= Math.min(40, worksheet.rowCount); rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const values = Array.from({ length: Math.min(30, worksheet.columnCount || 30) }, (_, index) =>
          normalizeHeader(getWorksheetCellText(row.getCell(index + 1).value)),
        );
        if (values.includes("factori name") && values.includes("osso name") && values.includes("unit price")) {
          headerRowNumber = rowNumber;
          break;
        }
      }
      if (headerRowNumber < 0) throw new Error("Не нашёл строку заголовков Excel.");

      const headerValues = Array.from({ length: Math.min(40, worksheet.columnCount || 40) }, (_, index) =>
        normalizeHeader(getWorksheetCellText(worksheet.getRow(headerRowNumber).getCell(index + 1).value)),
      );
      const findCol = (matcher: (value: string, index: number) => boolean) => {
        const index = headerValues.findIndex((value, position) => matcher(value, position));
        return index >= 0 ? index + 1 : 0;
      };
      const quantityCol = findCol((value) => value.includes("quantity"));
      const amountCols = headerValues
        .map((value, index) => ({ value, col: index + 1 }))
        .filter(({ value }) => value.includes("total amount"))
        .map(({ col }) => col);
      const factoryNameCol = findCol((value) => value === "factori name");
      const localNameCol = findCol((value) => value === "osso name");
      const priceCnyCol = findCol((value) => value.includes("unit price"));
      const sizeCol = findCol((value) => value === "saize" || value === "size");
      const colorCol = findCol((value) => value === "product color");
      const totalAmountCnyCol = amountCols.find((col) => col > quantityCol) ?? 0;
      const cbmCol = findCol((value) => value === "cbm");
      const kgCol = findCol((value) => value === "kg");
      const totalCbmCol = findCol((value) => value.includes("total cbm"));
      const totalNwKgsCol = findCol((value) => value.includes("total n.w. kgs"));
      const manualCustomsPerUnitCol = findCol(
        (value) =>
          value === "transportga" ||
          value === "rastamojka 1 sht" ||
          value === "rastamojka 1sht" ||
          value === "растаможка 1 шт" ||
          value === "bojxona 1 sht",
      );

      let exchangeRateFromSheet = 0;
      for (let rowNumber = Math.max(1, headerRowNumber - 2); rowNumber <= Math.min(worksheet.rowCount, headerRowNumber + 1); rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        for (let col = 1; col <= Math.min(30, worksheet.columnCount || 30); col += 1) {
          const label = normalizeHeader(getWorksheetCellText(row.getCell(col).value));
          if (label === "y - $" || label === "y-$") {
            exchangeRateFromSheet =
              getWorksheetCellNumber(worksheet.getRow(rowNumber + 1).getCell(col).value) ||
              getWorksheetCellNumber(worksheet.getRow(rowNumber).getCell(col + 1).value);
          }
        }
      }
      if (!exchangeRateFromSheet) {
        const rateCandidate = getWorksheetCellNumber(worksheet.getRow(headerRowNumber).getCell(14).value);
        if (rateCandidate > 0 && rateCandidate < 100) exchangeRateFromSheet = rateCandidate;
      }
      const normalizedExchangeRate = normalizeExchangeRateToUsd(exchangeRateFromSheet);
      const exchangeRateValue = normalizedExchangeRate > 0 ? String(Number(normalizedExchangeRate.toFixed(6))) : rate;
      const totalAmountUsdCol =
        amountCols.find((col) => col > (totalNwKgsCol || totalCbmCol || kgCol || totalAmountCnyCol)) ?? 0;

      const importedRows: GridRow[] = [];
      let keySeed = 1;
      for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const factoryName = factoryNameCol ? getWorksheetCellText(row.getCell(factoryNameCol).value) : "";
        const localName = localNameCol ? getWorksheetCellText(row.getCell(localNameCol).value) : "";
        const priceCNY = priceCnyCol ? getWorksheetCellText(row.getCell(priceCnyCol).value) : "";
        const saize = sizeCol ? getWorksheetCellText(row.getCell(sizeCol).value) : "";
        const color = colorCol ? getWorksheetCellText(row.getCell(colorCol).value) : "";
        const quantity = quantityCol ? getWorksheetCellText(row.getCell(quantityCol).value) : "";
        const totalAmountCNY = totalAmountCnyCol ? getWorksheetCellText(row.getCell(totalAmountCnyCol).value) : "";
        const cbm = cbmCol ? getWorksheetCellText(row.getCell(cbmCol).value) : "";
        const kg = kgCol ? getWorksheetCellText(row.getCell(kgCol).value) : "";
        const totalCbm = totalCbmCol ? getWorksheetCellText(row.getCell(totalCbmCol).value) : "";
        const nwKgs = totalNwKgsCol ? getWorksheetCellText(row.getCell(totalNwKgsCol).value) : "";
        const totalAmountUSD = totalAmountUsdCol ? getWorksheetCellText(row.getCell(totalAmountUsdCol).value) : "";
        const manualCustomsPerUnitUSD = manualCustomsPerUnitCol
          ? getWorksheetCellText(row.getCell(manualCustomsPerUnitCol).value)
          : "";

        const isEmpty = [factoryName, localName, priceCNY, quantity, totalAmountCNY, cbm, kg].every((value) => !String(value).trim());
        if (isEmpty) continue;
        if (normalizeHeader(factoryName) === "total" || normalizeHeader(localName) === "total") continue;

        const draft: GridRow = {
          key: keySeed++,
          productId: "",
          factoryName,
          localName,
          priceCNY,
          saize,
          color,
          quantity,
          totalAmountCNY,
          cbm,
          kg,
          totalCbm,
          nwKgs,
          exchangeRate: exchangeRateValue || rate,
          totalAmountUSD,
          manualCustomsPerUnitUSD,
        };

        const hit = resolveProduct(draft);
        if (hit) {
          draft.productId = hit.id;
          if (!draft.localName) draft.localName = hit.name;
          if (!draft.factoryName) draft.factoryName = hit.sku;
          if (!draft.saize) draft.saize = hit.size || "";
          if (!draft.cbm && hit.cbm > 0) draft.cbm = String(hit.cbm);
          if (!draft.kg && hit.kg > 0) draft.kg = String(hit.kg);
        }
        draft.totalAmountCNY = draft.totalAmountCNY || calcTotalAmountCny(draft);
        draft.totalCbm = draft.totalCbm || calcTotalCbm(draft);
        draft.nwKgs = draft.nwKgs || calcNwKgs(draft);
        draft.totalAmountUSD = draft.totalAmountUSD || calcLineTotalUsd(draft);
        importedRows.push(draft);
      }

      const importedInvestmentRows: InvestmentRow[] = [];
      const pushInvestment = (investorName: string, investedAmountUSD: number, percentageShare = 0) => {
        const name = investorName.trim();
        if (!name) return;
        const normalized = name.toLowerCase();
        if (normalized === "total" || /^\d+(\.\d+)?$/.test(name)) return;
        if (
          importedInvestmentRows.some(
            (row) => row.investorName.trim().toLowerCase() === normalized && toNumber(row.investedAmountUSD) === investedAmountUSD,
          )
        ) {
          return;
        }
        const investor = investorByName.get(normalized);
        importedInvestmentRows.push({
          key: importedInvestmentRows.length + 1,
          investorId: investor?.id ?? "",
          investorName: name,
          investedAmountUSD: investedAmountUSD > 0 ? String(Number(investedAmountUSD.toFixed(2))) : "",
          percentageShare: percentageShare > 0 ? String(Number(percentageShare.toFixed(4))) : "",
        });
      };

      const importedExpenseRows: ExpenseRow[] = [];
      const pushExpense = (title: string, amountUSD: number, category?: ExpenseRow["category"], description = "") => {
        const cleanTitle = title.trim();
        if (!cleanTitle || !(amountUSD > 0)) return;
        if (
          importedExpenseRows.some(
            (row) => row.title.trim().toLowerCase() === cleanTitle.toLowerCase() && Math.abs(toNumber(row.amountUSD) - amountUSD) < 0.001,
          )
        ) {
          return;
        }
        importedExpenseRows.push({
          key: importedExpenseRows.length + 1,
          title: cleanTitle,
          category: category ?? classifyExpenseCategory(cleanTitle),
          amountUSD: String(Number(amountUSD.toFixed(2))),
          description,
        });
      };

      const investorsSheet =
        workbook.getWorksheet("Инвесторы") ??
        workbook.getWorksheet("Investors") ??
        workbook.getWorksheet("INVESTORS");
      if (investorsSheet) {
        for (let rowNumber = 2; rowNumber <= investorsSheet.rowCount; rowNumber += 1) {
          const row = investorsSheet.getRow(rowNumber);
          const investorName = getWorksheetCellText(row.getCell(1).value);
          const investedAmountUSD = getWorksheetCellNumber(row.getCell(2).value);
          const percentageShare = getWorksheetCellNumber(row.getCell(3).value);
          pushInvestment(investorName, investedAmountUSD, percentageShare);
        }
      }

      const expensesSheet =
        workbook.getWorksheet("Расходы") ??
        workbook.getWorksheet("Expenses") ??
        workbook.getWorksheet("EXPENSES");
      if (expensesSheet) {
        for (let rowNumber = 2; rowNumber <= expensesSheet.rowCount; rowNumber += 1) {
          const row = expensesSheet.getRow(rowNumber);
          const title = getWorksheetCellText(row.getCell(1).value);
          const categoryText = getWorksheetCellText(row.getCell(2).value).toUpperCase();
          const amountUSD = getWorksheetCellNumber(row.getCell(3).value);
          const description = getWorksheetCellText(row.getCell(4).value);
          const category = ["LOGISTICS", "CUSTOMS", "STORAGE", "TRANSPORT", "OTHER"].includes(categoryText)
            ? (categoryText as ExpenseRow["category"])
            : classifyExpenseCategory(title);
          pushExpense(title, amountUSD, category, description);
        }
      }

      const oldiSheet = workbook.getWorksheet("OLDI BERDI-OSSO-9");
      if (oldiSheet) {
        const yolga = getWorksheetCellNumber(oldiSheet.getCell("C4").value);
        const rast = getWorksheetCellNumber(oldiSheet.getCell("D4").value);
        const discountsAndExpenses = getWorksheetCellNumber(oldiSheet.getCell("H4").value);
        pushExpense("Доставка (YO'LGA)", yolga, "LOGISTICS");
        pushExpense("Растаможка", rast, "CUSTOMS");
        pushExpense("Скидки и прочие расходы", discountsAndExpenses, "OTHER");

        const investorNameRow = 7;
        const investedTotalRow = 15;
        let emptyNamesStreak = 0;
        for (let col = 2; col <= Math.min(oldiSheet.columnCount || 30, 30); col += 1) {
          const name = getWorksheetCellText(oldiSheet.getRow(investorNameRow).getCell(col).value).trim();
          if (!name) {
            emptyNamesStreak += 1;
            if (emptyNamesStreak >= 6) break;
            continue;
          }
          emptyNamesStreak = 0;
          const investedAmountUSD = getWorksheetCellNumber(oldiSheet.getRow(investedTotalRow).getCell(col).value);
          pushInvestment(name, investedAmountUSD, 0);
        }
      }

      for (let rowNumber = Math.max(headerRowNumber + 1, 90); rowNumber <= Math.min(worksheet.rowCount, 150); rowNumber += 1) {
        const title = getWorksheetCellText(worksheet.getRow(rowNumber).getCell(3).value);
        const amountUSD = getWorksheetCellNumber(worksheet.getRow(rowNumber).getCell(5).value);
        if (!title) continue;
        if (normalizeHeader(title) === "курс") continue;
        pushExpense(title, amountUSD, classifyExpenseCategory(title));
      }

      let purchaseTotalFromSheet = 0;
      let overallCustomsFromSheet = 0;
      for (let rowNumber = headerRowNumber; rowNumber <= Math.min(worksheet.rowCount, headerRowNumber + 180); rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const texts = (Array.isArray(row.values) ? row.values : [])
          .slice(1)
          .map((value) => normalizeHeader(getWorksheetCellText(value)));
        if (!texts.some((value) => value.includes("total"))) continue;
        const nums = (Array.isArray(row.values) ? row.values : [])
          .slice(1)
          .map((value) => getWorksheetCellNumber(value))
          .filter((value) => Number.isFinite(value) && value > 1000);
        if (!nums.length) continue;
        purchaseTotalFromSheet = Math.max(purchaseTotalFromSheet, ...nums);
        const customsIndex = texts.findIndex((value) => value === "rastamojka" || value === "растаможка");
        if (customsIndex >= 0) {
          const customsCandidate = getWorksheetCellNumber(row.getCell(customsIndex + 2).value);
          if (customsCandidate > 0) overallCustomsFromSheet = Math.max(overallCustomsFromSheet, customsCandidate);
        }
      }

      const sheetName = file.name.replace(/\.xlsx$/i, "").trim();
      if (!name.trim() && sheetName) setName(sheetName);
      if (!purchaseCny.trim() && purchaseTotalFromSheet > 0) setPurchaseCny(String(Number(purchaseTotalFromSheet.toFixed(2))));
      if (!overallCustomsUSD.trim() && overallCustomsFromSheet > 0) {
        setOverallCustomsUSD(String(Number(overallCustomsFromSheet.toFixed(2))));
      }
      if (exchangeRateValue && !rate.trim()) setRate(exchangeRateValue);
      setRows(importedRows);
      setNextKey(importedRows.length + 1);
      if (importedInvestmentRows.length) {
        setInvestmentRows(importedInvestmentRows);
        setNextInvestmentKey(importedInvestmentRows.length + 1);
      }
      if (importedExpenseRows.length) {
        setExpenseRows(importedExpenseRows);
        setNextExpenseKey(importedExpenseRows.length + 1);
      }

      const messageParts = [];
      if (importedRows.length) messageParts.push(`товары: ${importedRows.length}`);
      if (importedInvestmentRows.length) messageParts.push(`инвесторы: ${importedInvestmentRows.length}`);
      if (importedExpenseRows.length) messageParts.push(`расходы: ${importedExpenseRows.length}`);
      setExcelMessage(messageParts.length ? `Импортировано — ${messageParts.join(", ")}` : "В Excel не найдено данных для импорта.");
    } catch (error) {
      setExcelMessage(error instanceof Error ? error.message : "Не удалось импортировать Excel.");
    } finally {
      setExcelBusy(false);
    }
  }

  async function exportToExcel() {
    setExcelBusy(true);
    setExcelMessage(null);
    try {
      const ExcelJSModule = await import("exceljs");
      const workbook = new ExcelJSModule.Workbook();
      const sheet = workbook.addWorksheet("Container");
      const averageColumnLabel = getAverageColumnLabel(activeCostingRuleMode);
      const logisticsColumnLabel = getLogisticsColumnLabel(activeCostingRuleMode);
      const headers = [
        "FACTORI NAME",
        "OSSO NAME",
        "PICTURE / 图片",
        "UNIT PRICE",
        "SAIZE",
        "Product color",
        "QUANTITY ( SET )",
        "TOTAL AMOUNT",
        "CBM",
        "KG",
        "TOTAL CBM",
        "TOTAL N.W. KGS",
        "DALEE",
        "КУРС",
        "Y - $",
        "TOTAL AMOUNT",
        averageColumnLabel,
        logisticsColumnLabel,
        "BIR DONASI",
        "JAMI",
        "TRANSPORTGA",
        "TOTAL AMOUNT TRANSPORTGA",
        "RASTAMOJKAGA",
        "TOTAL AMOUNT RASTAMOJKAGA",
        "TOTAL AMOUNT",
        "TOTAL AMOUNT ALL CONTEYNERS",
      ];
      sheet.addRow(headers);
      for (const row of rows) {
        const product = row.productId ? productMap.get(row.productId) ?? null : null;
        const metrics = computeRowMetrics({
          row,
          product,
          costingRuleMode: activeCostingRuleMode,
          totalRoadExpenses: expenseTotals.road,
          totalCustomsExpenses: expenseTotals.customs,
          totalProductUsd: productTotals.totalUsd,
          manualCustomsPerUnitUsd: toNumber(row.manualCustomsPerUnitUSD),
          fallbackCustomsPerUnitUsd: customsFallbackMap.get(row.key) ?? 0,
          costingConfig: resolvedCostingConfig,
        });
        sheet.addRow([
          row.factoryName,
          row.localName,
          product?.imagePath ? "IMAGE" : "",
          row.priceCNY,
          row.saize,
          row.color,
          row.quantity,
          row.totalAmountCNY || calcTotalAmountCny(row),
          row.cbm,
          row.kg,
          row.totalCbm || calcTotalCbm(row),
          row.nwKgs || calcNwKgs(row),
          "DALEE",
          row.exchangeRate,
          metrics.unitUsdValue > 0 ? Number(metrics.unitUsdValue.toFixed(2)) : "",
          metrics.productTotalValue > 0 ? Number(metrics.productTotalValue.toFixed(2)) : "",
          metrics.averagePercentValue > 0 ? Number(metrics.averagePercentValue.toFixed(2)) : "",
          metrics.logisticsAverageValue > 0 ? Number(metrics.logisticsAverageValue.toFixed(2)) : "",
          metrics.perUnitTotalValue > 0 ? Number(metrics.perUnitTotalValue.toFixed(2)) : "",
          metrics.grandTotalValue > 0 ? Number(metrics.grandTotalValue.toFixed(2)) : "",
          toNumber(row.manualCustomsPerUnitUSD) > 0
            ? Number(toNumber(row.manualCustomsPerUnitUSD).toFixed(2))
            : metrics.totalCustomsUsd > 0 && metrics.quantity > 0
              ? Number((metrics.totalCustomsUsd / metrics.quantity).toFixed(2))
              : "",
          metrics.totalCustomsUsd > 0 ? Number(metrics.totalCustomsUsd.toFixed(2)) : "",
          metrics.totalTransportUsd > 0 && metrics.quantity > 0 ? Number((metrics.totalTransportUsd / metrics.quantity).toFixed(2)) : "",
          metrics.totalTransportUsd > 0 ? Number(metrics.totalTransportUsd.toFixed(2)) : "",
          metrics.perUnitTotalValue > 0 ? Number(metrics.perUnitTotalValue.toFixed(2)) : "",
          metrics.grandTotalValue > 0 ? Number(metrics.grandTotalValue.toFixed(2)) : "",
        ]);
      }
      sheet.columns.forEach((column, index) => {
        const headerWidth = String(headers[index] ?? "").length + 4;
        column.width = Math.max(14, headerWidth);
      });

      const investorsSheet = workbook.addWorksheet("Инвесторы");
      investorsSheet.addRow(["Инвестор", "Вложено USD", "% доли"]);
      for (const row of investmentRows) {
        investorsSheet.addRow([row.investorName, row.investedAmountUSD, row.percentageShare]);
      }
      investorsSheet.columns = [{ width: 28 }, { width: 18 }, { width: 16 }];

      const expensesSheet = workbook.addWorksheet("Расходы");
      expensesSheet.addRow(["Название", "Категория", "Сумма USD", "Комментарий"]);
      for (const row of expenseRows) {
        expensesSheet.addRow([row.title, row.category, row.amountUSD, row.description]);
      }
      if (effectiveOverallCustomsUSD > 0) {
        expensesSheet.addRow([
          "Растаможка (общая)",
          "CUSTOMS",
          Number(effectiveOverallCustomsUSD.toFixed(2)),
          derivedOverallCustomsUSD > 0 ? "Из TRANSPORTGA × количество" : "Ручная общая сумма из Excel-окна",
        ]);
      }
      expensesSheet.columns = [{ width: 32 }, { width: 18 }, { width: 16 }, { width: 40 }];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name || "container-excel"}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExcelMessage("Excel файл подготовлен.");
    } catch (error) {
      setExcelMessage(error instanceof Error ? error.message : "Не удалось скачать Excel.");
    } finally {
      setExcelBusy(false);
    }
  }

  async function downloadTemplateExcel() {
    setExcelBusy(true);
    setExcelMessage(null);
    try {
      const ExcelJSModule = await import("exceljs");
      const workbook = new ExcelJSModule.Workbook();
      const sheet = workbook.addWorksheet(getContainerSheetName(name), {
        views: [{ state: "frozen", ySplit: 6 }],
      });
      const averageColumnLabel = getAverageColumnLabel(activeCostingRuleMode);
      const logisticsColumnLabel = getLogisticsColumnLabel(activeCostingRuleMode);
      const totalLogisticsAndCustoms = expenseTotals.road + expenseTotals.customs;

      sheet.getCell("A1").value = "Шаблон контейнера";
      sheet.getCell("A1").font = { bold: true, size: 16 };
      sheet.mergeCells("A1:E1");

      sheet.getCell("T3").value = "RAKOVINAGA";
      sheet.getCell("U3").value = "UNITAZGA";
      sheet.getCell("V3").value = "SIFONGA";
      sheet.getCell("W3").value = "SEMESITELGA";
      sheet.getCell("X3").value = "OYNAGA";
      sheet.getCell("T4").value = resolvedCostingConfig.customsRakovinaUsd;
      sheet.getCell("U4").value = resolvedCostingConfig.customsUnitazUsd;
      sheet.getCell("V4").value = resolvedCostingConfig.customsSifonUsd;
      sheet.getCell("W4").value = resolvedCostingConfig.customsSmesitelUsd;
      sheet.getCell("X4").value = resolvedCostingConfig.customsOynaUsd;
      sheet.getCell("T5").value = resolvedCostingConfig.transportUsdPerCbm;
      sheet.getCell("I5").value = "TOTAL AMOUNT";
      sheet.getCell("J5").value = "TOTAL CBM";
      sheet.getCell("K5").value = "TOTAL N.W. KGS";
      sheet.getCell("N5").value = "Y - $";
      sheet.getCell("O5").value = "TOTAL AMOUNT";
      sheet.getCell("P5").value = averageColumnLabel;
      sheet.getCell("Q5").value = logisticsColumnLabel;
      sheet.getCell("R5").value = "BIR DONASI";
      sheet.getCell("S5").value = "JAMI";
      sheet.getCell("U5").value = "TRANSPORTGA";
      sheet.getCell("V5").value = "TOTAL AMOUNT TRANSPORTGA";
      sheet.getCell("W5").value = "RASTAMOJKAGA";
      sheet.getCell("X5").value = "TOTAL AMOUNT RASTAMOJKAGA";
      sheet.getCell("Y5").value = "TOTAL AMOUNT";
      sheet.getCell("Z5").value = "TOTAL AMOUNT ALL CONTEYNERS";

      const headers = [
        "FACTORI NAME",
        "OSSO NAME",
        "PICTURE / 图片",
        "UNIT PRICE",
        "SAIZE",
        "Product color",
        "QUANTITY ( SET )",
        "TOTAL AMOUNT",
        "CBM",
        "KG",
        "TOTAL CBM",
        "TOTAL N.W. KGS",
        "DALEE",
        "КУРС",
        "Y - $",
        "TOTAL AMOUNT",
        averageColumnLabel,
        logisticsColumnLabel,
        "BIR DONASI",
        "JAMI",
        "TRANSPORTGA",
        "TOTAL AMOUNT TRANSPORTGA",
        "RASTAMOJKAGA",
        "TOTAL AMOUNT RASTAMOJKAGA",
        "TOTAL AMOUNT",
        "TOTAL AMOUNT ALL CONTEYNERS",
      ];
      sheet.getRow(6).values = headers;

      const exampleRows = [
        ["FACTORY-001", "OSSO-001", "", 70, "610*480*160", "Glossy white", 30, 2100, 0.055, 14, "", "", "DALEE", rate ? Number(rate) : defaultRate ?? "", "", "", "", "", "", "", "", "", "", "", "", ""],
        ["FACTORY-002", "OSSO-002", "", 80, "710*480*160", "Glossy white", 20, 1600, 0.064, 16, "", "", "DALEE", rate ? Number(rate) : defaultRate ?? "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ];
      for (const values of exampleRows) sheet.addRow(values);

      for (let rowNumber = 7; rowNumber <= 80; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        if (!row.getCell(7).value) continue;
        row.getCell(11).value = { formula: `G${rowNumber}*I${rowNumber}` };
        row.getCell(12).value = { formula: `G${rowNumber}*J${rowNumber}` };
        row.getCell(14).value = { formula: `D${rowNumber}*M${rowNumber}` };
        row.getCell(15).value = { formula: `H${rowNumber}*M${rowNumber}` };
        if (activeCostingRuleMode === COSTING_RULE_MODES.CATEGORY_BASED_V2) {
          row.getCell(16).value = { formula: `IF($O$81=0,0,O${rowNumber}/$O$81*100)` };
          row.getCell(17).value = { formula: `IF(AND(I${rowNumber}>0,G${rowNumber}>0),I${rowNumber}*85.714653,"")` };
          row.getCell(18).value = { formula: `IF(G${rowNumber}=0,0,N${rowNumber}+Q${rowNumber})` };
          row.getCell(19).value = { formula: `IF(G${rowNumber}=0,0,R${rowNumber}*G${rowNumber})` };
          row.getCell(20).value = { formula: `IF(G${rowNumber}>0,${getCustomsFormulaForExcel(rowNumber)},"")` };
          row.getCell(21).value = { formula: `IF(G${rowNumber}=0,0,T${rowNumber}*G${rowNumber})` };
          row.getCell(22).value = { formula: `Q${rowNumber}` };
          row.getCell(23).value = { formula: `S${rowNumber}` };
          row.getCell(24).value = { formula: `R${rowNumber}` };
          row.getCell(25).value = { formula: `IF(G${rowNumber}=0,0,N${rowNumber}+R${rowNumber}+T${rowNumber})` };
          row.getCell(26).value = { formula: `IF(G${rowNumber}=0,0,Y${rowNumber}*G${rowNumber})` };
        } else {
          row.getCell(16).value = { formula: `IF($O$81=0,0,O${rowNumber}/$O$81*100)` };
          row.getCell(17).value = { formula: `IF($O$81=0,0,$W$81*P${rowNumber}/100/G${rowNumber})` };
          row.getCell(18).value = { formula: `IF(G${rowNumber}=0,0,Q${rowNumber}+U${rowNumber})` };
          row.getCell(19).value = { formula: `IF($O$81=0,0,$U$81*P${rowNumber}/100)` };
          row.getCell(20).value = { formula: `IF($O$81=0,0,$T$81*P${rowNumber}/100/G${rowNumber})` };
          row.getCell(21).value = { formula: `IF($O$81=0,0,$T$81*P${rowNumber}/100)` };
          row.getCell(22).value = { formula: `Q${rowNumber}` };
          row.getCell(23).value = { formula: `S${rowNumber}` };
          row.getCell(24).value = { formula: `R${rowNumber}` };
          row.getCell(25).value = { formula: `IF(G${rowNumber}=0,0,(O${rowNumber}+U${rowNumber}+W${rowNumber})/G${rowNumber})` };
          row.getCell(26).value = { formula: `O${rowNumber}+U${rowNumber}+W${rowNumber}` };
        }
      }

      sheet.getCell("I80").value = "TOTAL AMOUNT";
      sheet.getCell("J80").value = "TOTAL CBM";
      sheet.getCell("K80").value = "TOTAL N.W. KGS";
      sheet.getCell("O80").value = "TOTAL AMOUNT";
      sheet.getCell("V80").value = "TOTAL AMOUNT TRANSPORTGA";
      sheet.getCell("X80").value = "TOTAL AMOUNT RASTAMOJKAGA";
      sheet.getCell("Z80").value = "TOTAL AMOUNT ALL CONTEYNERS";
      sheet.getCell("I81").value = { formula: "SUM(G7:G79)" };
      sheet.getCell("J81").value = { formula: "SUM(K7:K79)" };
      sheet.getCell("K81").value = { formula: "SUM(L7:L79)" };
      sheet.getCell("O81").value = { formula: "SUM(O7:O79)" };
      sheet.getCell("V81").value = { formula: "SUM(V7:V79)" };
      sheet.getCell("X81").value = { formula: "SUM(X7:X79)" };
      sheet.getCell("Z81").value = { formula: "SUM(Z7:Z79)" };

      const expensesSheet = workbook.addWorksheet("Расходы");
      expensesSheet.addRow(["Название", "Категория", "Сумма USD", "Комментарий"]);
      expensesSheet.addRow(["Растаможка", "CUSTOMS", effectiveOverallCustomsUSD ? Number(effectiveOverallCustomsUSD.toFixed(2)) : "", derivedOverallCustomsUSD > 0 ? "Из TRANSPORTGA × количество" : ""]);
      expensesSheet.addRow(["Доставка", "LOGISTICS", "", ""]);
      expensesSheet.addRow(["Склад", "STORAGE", "", ""]);
      expensesSheet.columns = [
        { width: 32 },
        { width: 18 },
        { width: 16 },
        { width: 40 },
      ];

      const investorsSheet = workbook.addWorksheet("Инвесторы");
      investorsSheet.addRow(["Инвестор", "Вложено USD", "% доли"]);
      investorsSheet.addRow(["OSSO", "", ""]);
      investorsSheet.addRow(["AZIZ", "", ""]);
      investorsSheet.columns = [
        { width: 28 },
        { width: 18 },
        { width: 16 },
      ];

      sheet.getRow(6).eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        cell.border = {
          top: { style: "thin", color: { argb: "FF94A3B8" } },
          left: { style: "thin", color: { argb: "FF94A3B8" } },
          bottom: { style: "thin", color: { argb: "FF94A3B8" } },
          right: { style: "thin", color: { argb: "FF94A3B8" } },
        };
      });

      sheet.columns = [
        { width: 24 },
        { width: 24 },
        { width: 16 },
        { width: 14 },
        { width: 22 },
        { width: 16 },
        { width: 16 },
        { width: 12 },
        { width: 12 },
        { width: 14 },
        { width: 16 },
        { width: 12 },
        { width: 12 },
        { width: 16 },
        { width: 16 },
        { width: 18 },
        { width: 20 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
      ];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "container-template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExcelMessage("Шаблон Excel скачан.");
    } catch (error) {
      setExcelMessage(error instanceof Error ? error.message : "Не удалось скачать шаблон Excel.");
    } finally {
      setExcelBusy(false);
    }
  }


  function addProduct(product: ProductOption, quantity = 1) {
    const rateValue = toNumber(rate);
    const priceCny = product.costPriceUSD > 0 && rateValue > 0 ? String(Number(convertUsdToCny(product.costPriceUSD, rateValue).toFixed(4))) : "";
    const safeQuantity = Math.max(1, Math.floor(quantity));
    setRows((prev) => [
      ...prev,
      {
        key: nextKey,
        productId: product.id,
        factoryName: product.sku,
        localName: product.name,
        priceCNY: priceCny,
        saize: product.size || "",
        color: "",
        quantity: String(safeQuantity),
        totalAmountCNY: "",
        cbm: product.cbm > 0 ? String(product.cbm) : "",
        kg: product.kg > 0 ? String(product.kg) : "",
        totalCbm: "",
        nwKgs: "",
        exchangeRate: rate,
        totalAmountUSD: "",
        manualCustomsPerUnitUSD: "",
      },
    ]);
    setNextKey((v) => v + 1);
  }

  function openQuantityModal(product: ProductOption) {
    setPendingProduct(product);
    setPendingQuantity("1");
  }

  function confirmPendingProduct() {
    if (!pendingProduct) return;
    const quantity = Math.max(1, Math.floor(toNumber(pendingQuantity)));
    addProduct(pendingProduct, quantity);
    setPendingProduct(null);
    setPendingQuantity("1");
  }

  function addBlankItemRow() {
    setRows((prev) => [
      ...prev,
      {
        key: nextKey,
        productId: "",
        factoryName: "",
        localName: "",
        priceCNY: "",
        saize: "",
        color: "",
        quantity: "",
        totalAmountCNY: "",
        cbm: "",
        kg: "",
        totalCbm: "",
        nwKgs: "",
        exchangeRate: rate,
        totalAmountUSD: "",
        manualCustomsPerUnitUSD: "",
      },
    ]);
    setNextKey((v) => v + 1);
  }

  function addInvestmentRow() {
    setInvestmentRows((prev) => [
      ...prev,
      { key: nextInvestmentKey, investorId: "", investorName: "", investedAmountUSD: "", percentageShare: "" },
    ]);
    setNextInvestmentKey((v) => v + 1);
  }

  function updateInvestmentRow(key: number, patch: Partial<InvestmentRow>) {
    setInvestmentRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        if (patch.investorName !== undefined) {
          const hit = investorByName.get(String(patch.investorName ?? "").trim().toLowerCase());
          if (hit) next.investorId = hit.id;
        }
        return next;
      }),
    );
  }

  function removeInvestmentRow(key: number) {
    setInvestmentRows((prev) => prev.filter((r) => r.key !== key));
  }

  function addExpenseRow() {
    setExpenseRows((prev) => [
      ...prev,
      { key: nextExpenseKey, title: "", category: "OTHER", amountUSD: "", description: "" },
    ]);
    setNextExpenseKey((v) => v + 1);
  }

  function updateExpenseRow(key: number, patch: Partial<ExpenseRow>) {
    setExpenseRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeExpenseRow(key: number) {
    setExpenseRows((prev) => prev.filter((r) => r.key !== key));
  }

  function splitClipboardTable(text: string) {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    while (lines.length && lines[lines.length - 1]?.trim() === "") lines.pop();
    return lines.map((l) => l.split("\t"));
  }

  function applyPasteToItems(startRowIndex: number, startColIndex: number, text: string) {
    const matrix = splitClipboardTable(text);
    if (!matrix.length) return;
    const pasteColumns = columns
      .filter(
        (c) =>
          c.id !== "picture" &&
          c.id !== "productTotal" &&
          c.id !== "productTotalCny" &&
          c.id !== "costPriceUSD" &&
          c.id !== "salePriceUSD" &&
          c.id !== "saleTotalUSD" &&
          c.id !== "unitUsd" &&
          c.id !== "averagePercent" &&
          c.id !== "logisticsAverage" &&
          c.id !== "perUnitTotal" &&
          c.id !== "grandTotal",
      )
      .map((c) => c.id as keyof GridRow);

    setRows((prev) => {
      const next = [...prev];
      let keySeed = next.reduce((m, r) => Math.max(m, r.key), 0) + 1;
      while (next.length < startRowIndex + matrix.length) {
        next.push({
          key: keySeed++,
          productId: "",
          factoryName: "",
          localName: "",
          priceCNY: "",
          saize: "",
          color: "",
          quantity: "",
          totalAmountCNY: "",
          cbm: "",
          kg: "",
          totalCbm: "",
          nwKgs: "",
          exchangeRate: rate,
          totalAmountUSD: "",
          manualCustomsPerUnitUSD: "",
        });
      }

      for (let r = 0; r < matrix.length; r++) {
        const target = next[startRowIndex + r];
        if (!target) continue;
        const patch: Partial<GridRow> = {};
        for (let c = 0; c < matrix[r]!.length; c++) {
          const col = pasteColumns[startColIndex + c];
          if (!col) continue;
          const value = matrix[r]![c] ?? "";
          switch (col) {
            case "factoryName":
              patch.factoryName = value;
              break;
            case "localName":
              patch.localName = value;
              break;
            case "priceCNY":
              patch.priceCNY = value;
              break;
            case "saize":
              patch.saize = value;
              break;
            case "color":
              patch.color = value;
              break;
            case "quantity":
              patch.quantity = value;
              break;
            case "totalAmountCNY":
              patch.totalAmountCNY = value;
              break;
            case "cbm":
              patch.cbm = value;
              break;
            case "kg":
              patch.kg = value;
              break;
            case "totalCbm":
              patch.totalCbm = value;
              break;
            case "nwKgs":
              patch.nwKgs = value;
              break;
            case "exchangeRate":
              patch.exchangeRate = value;
              break;
            case "totalAmountUSD":
              patch.totalAmountUSD = value;
              break;
            case "manualCustomsPerUnitUSD":
              patch.manualCustomsPerUnitUSD = value;
              break;
            default:
              break;
          }
        }
        const merged = { ...target, ...patch };
        if (patch.factoryName !== undefined || patch.localName !== undefined) {
          const hit = resolveProduct(merged);
          if (hit) {
            merged.productId = hit.id;
            if (!merged.factoryName) merged.factoryName = hit.sku;
            if (!merged.localName) merged.localName = hit.name;
            if (!merged.saize) merged.saize = hit.size || "";
            if (!merged.priceCNY && hit.costPriceUSD > 0 && normalizeExchangeRateToUsd(merged.exchangeRate) > 0) {
              merged.priceCNY = String(Number(convertUsdToCny(hit.costPriceUSD, merged.exchangeRate).toFixed(4)));
            }
            if (!merged.cbm && hit.cbm > 0) merged.cbm = String(hit.cbm);
            if (!merged.kg && hit.kg > 0) merged.kg = String(hit.kg);
          } else {
            merged.productId = "";
          }
        }
        if (patch.quantity !== undefined || patch.priceCNY !== undefined) {
          if (!patch.totalAmountCNY) merged.totalAmountCNY = calcTotalAmountCny(merged);
        }
        if (
          patch.quantity !== undefined ||
          patch.priceCNY !== undefined ||
          patch.totalAmountCNY !== undefined ||
          patch.exchangeRate !== undefined
        ) {
          if (!patch.totalAmountUSD) merged.totalAmountUSD = calcLineTotalUsd(merged);
        }
        if (patch.quantity !== undefined || patch.cbm !== undefined) {
          merged.totalCbm = calcTotalCbm(merged);
        }
        if (patch.quantity !== undefined || patch.kg !== undefined) {
          merged.nwKgs = calcNwKgs(merged);
        }
        next[startRowIndex + r] = merged;
      }
      return next;
    });
  }

  function applyPasteToInvestors(startRowIndex: number, startColIndex: number, text: string) {
    const matrix = splitClipboardTable(text);
    if (!matrix.length) return;
    const cols: Array<keyof InvestmentRow> = ["investorName", "investedAmountUSD", "percentageShare"];

    setInvestmentRows((prev) => {
      const next = [...prev];
      let keySeed = next.reduce((m, r) => Math.max(m, r.key), 0) + 1;
      while (next.length < startRowIndex + matrix.length) {
        next.push({
          key: keySeed++,
          investorId: "",
          investorName: "",
          investedAmountUSD: "",
          percentageShare: "",
        });
      }

      for (let r = 0; r < matrix.length; r++) {
        const target = next[startRowIndex + r];
        if (!target) continue;
        const patch: Partial<InvestmentRow> = {};
        for (let c = 0; c < matrix[r]!.length; c++) {
          const col = cols[startColIndex + c];
          if (!col) continue;
          const value = matrix[r]![c] ?? "";
          if (col === "investorName") patch.investorName = value;
          if (col === "investedAmountUSD") patch.investedAmountUSD = value;
          if (col === "percentageShare") patch.percentageShare = value;
        }
        const merged = { ...target, ...patch };
        if (patch.investorName !== undefined) {
          const hit = investorByName.get(String(patch.investorName ?? "").trim().toLowerCase());
          if (hit) merged.investorId = hit.id;
        }
        next[startRowIndex + r] = merged;
      }
      return next;
    });
  }

  function applyPasteToExpenses(startRowIndex: number, startColIndex: number, text: string) {
    const matrix = splitClipboardTable(text);
    if (!matrix.length) return;
    const cols: Array<keyof ExpenseRow> = ["title", "category", "amountUSD", "description"];

    setExpenseRows((prev) => {
      const next = [...prev];
      let keySeed = next.reduce((m, r) => Math.max(m, r.key), 0) + 1;
      while (next.length < startRowIndex + matrix.length) {
        next.push({
          key: keySeed++,
          title: "",
          category: "OTHER",
          amountUSD: "",
          description: "",
        });
      }

      for (let r = 0; r < matrix.length; r++) {
        const target = next[startRowIndex + r];
        if (!target) continue;
        const patch: Partial<ExpenseRow> = {};
        for (let c = 0; c < matrix[r]!.length; c++) {
          const col = cols[startColIndex + c];
          if (!col) continue;
          const value = matrix[r]![c] ?? "";
          if (col === "category") {
            patch.category = value.trim().toUpperCase() as ExpenseRow["category"];
          } else if (col === "title") {
            patch.title = value;
          } else if (col === "amountUSD") {
            patch.amountUSD = value;
          } else if (col === "description") {
            patch.description = value;
          }
        }
        const merged: ExpenseRow = { ...target, ...patch };
        if (patch.category !== undefined) {
          const raw = String(patch.category ?? "").trim().toUpperCase();
          if (
            raw === "LOGISTICS" ||
            raw === "CUSTOMS" ||
            raw === "STORAGE" ||
            raw === "TRANSPORT" ||
            raw === "OTHER"
          ) {
            merged.category = raw as ExpenseRow["category"];
          } else {
            merged.category = "OTHER";
          }
        }
        next[startRowIndex + r] = merged;
      }
      return next;
    });
  }

  const columns: Array<{
    id:
      | keyof GridRow
      | "picture"
      | "transportUnit"
      | "customsUnit"
      | "customsTotal"
      | "finalTotalAmount"
      | "finalTotalAllContainers"
      | "productTotal"
      | "productTotalCny"
      | "costPriceUSD"
      | "salePriceUSD"
      | "saleTotalUSD"
      | "unitUsd"
      | "averagePercent"
      | "logisticsAverage"
      | "perUnitTotal"
      | "grandTotal";
    label: string;
    width: string;
  }> = [
    { id: "factoryName", label: "FACTORI NAME", width: "min-w-[250px]" },
    { id: "localName", label: "OSSO NAME", width: "min-w-[180px]" },
    { id: "picture", label: "PICTURE / 图片", width: "min-w-[140px]" },
    { id: "priceCNY", label: "UNIT PRICE", width: "min-w-[170px]" },
    { id: "saize", label: "SAIZE", width: "min-w-[230px]" },
    { id: "color", label: "Product color", width: "min-w-[170px]" },
    { id: "quantity", label: "QUANTITY ( SET )", width: "min-w-[170px]" },
    { id: "totalAmountCNY", label: "TOTAL AMOUNT", width: "min-w-[190px]" },
    { id: "cbm", label: "CBM", width: "min-w-[140px]" },
    { id: "kg", label: "KG", width: "min-w-[140px]" },
    { id: "totalCbm", label: "TOTAL CBM", width: "min-w-[170px]" },
    { id: "nwKgs", label: "TOTAL N.W. KGS", width: "min-w-[190px]" },
    { id: "exchangeRate", label: "КУРС", width: "min-w-[120px]" },
    { id: "unitUsd", label: "Y - $", width: "min-w-[150px]" },
    { id: "totalAmountUSD", label: "TOTAL AMOUNT", width: "min-w-[180px]" },
    {
      id: "averagePercent",
      label: getAverageColumnLabel(activeCostingRuleMode),
      width: "min-w-[160px]",
    },
    {
      id: "logisticsAverage",
      label: getLogisticsColumnLabel(activeCostingRuleMode),
      width: "min-w-[210px]",
    },
    { id: "perUnitTotal", label: "BIR DONASI", width: "min-w-[150px]" },
    { id: "grandTotal", label: "JAMI", width: "min-w-[150px]" },
    { id: "manualCustomsPerUnitUSD", label: "TRANSPORTGA", width: "min-w-[160px]" },
    { id: "transportUnit", label: "TOTAL AMOUNT TRANSPORTGA", width: "min-w-[210px]" },
    { id: "customsUnit", label: "RASTAMOJKAGA", width: "min-w-[170px]" },
    { id: "customsTotal", label: "TOTAL AMOUNT RASTAMOJKAGA", width: "min-w-[230px]" },
    { id: "finalTotalAmount", label: "TOTAL AMOUNT", width: "min-w-[180px]" },
    { id: "finalTotalAllContainers", label: "TOTAL AMOUNT ALL CONTEYNERS", width: "min-w-[260px]" },
    { id: "productTotal", label: "ОБЩАЯ СУММА ТОВАРА", width: "min-w-[180px]" },
    { id: "productTotalCny", label: "СУММА В ЮАНЯХ", width: "min-w-[170px]" },
    { id: "costPriceUSD", label: "СЕБЕСТОИМОСТЬ", width: "min-w-[170px]" },
    { id: "salePriceUSD", label: "ЦЕНА ПРОДАЖИ", width: "min-w-[170px]" },
    { id: "saleTotalUSD", label: "ОБЩЕЕ ПО КОЛИЧЕСТВУ", width: "min-w-[190px]" },
  ];

  const investmentColumns: Array<{ id: keyof InvestmentRow; label: string; width: string }> = [
    { id: "investorName", label: "Инвестор", width: "min-w-[280px]" },
    { id: "investedAmountUSD", label: "Вложено (USD)", width: "min-w-[180px]" },
    { id: "percentageShare", label: "% доли (необязательно)", width: "min-w-[200px]" },
  ];

  const expenseColumns: Array<{ id: keyof ExpenseRow; label: string; width: string }> = [
    { id: "title", label: "Название расхода", width: "min-w-[320px]" },
    { id: "category", label: "Категория", width: "min-w-[220px]" },
    { id: "amountUSD", label: "Сумма (USD)", width: "min-w-[180px]" },
    { id: "description", label: "Комментарий", width: "min-w-[420px]" },
  ];

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <form action={formAction} className="grid gap-3">
        <input type="hidden" name="investmentsJson" value={investmentsJson} />
        <input type="hidden" name="expensesJson" value={expensesJson} />
        <input type="hidden" name="containerItemsJson" value={containerItemsJson} />

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.35fr)_repeat(5,minmax(140px,1fr))_auto]">
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Контейнер март 2026"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm md:col-span-2 xl:col-span-1"
          />
          <input
            name="purchaseDate"
            type="date"
            required
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            name="arrivalDate"
            type="date"
            value={arrivalDate}
            onChange={(e) => setArrivalDate(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            name="totalPurchaseCNY"
            type="number"
            min={0}
            step="0.01"
            required
            value={purchaseCny}
            onChange={(e) => setPurchaseCny(e.target.value)}
            placeholder="Закупка CNY"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            name="exchangeRate"
            type="number"
            min={0}
            step="0.0001"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="Курс CNY → USD"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={0}
            step="0.01"
            value={overallCustomsUSD}
            onChange={(e) => setOverallCustomsUSD(e.target.value)}
            placeholder="Общая растаможка USD"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 md:col-span-2 xl:col-span-1 xl:w-auto"
          >
            {isPending ? "Сохранение..." : "Сохранить"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:flex xl:flex-wrap xl:justify-end">
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFromExcelFile(file);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => excelInputRef.current?.click()}
            disabled={excelBusy}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {excelBusy ? "Обработка..." : "Импорт Excel"}
          </button>
          <button
            type="button"
            onClick={() => void exportToExcel()}
            disabled={excelBusy}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Скачать Excel
          </button>
          <button
            type="button"
            onClick={() => void downloadTemplateExcel()}
            disabled={excelBusy}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Скачать шаблон
          </button>
          <button
            type="button"
            onClick={() => {
              setPickerOpen(true);
              setSearch("");
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Добавить товар
          </button>
          <button
            type="button"
            onClick={addBlankItemRow}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Пустая строка
          </button>
        </div>

        {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-emerald-700">Контейнер создан.</p> : null}

        </form>
      </article>

      <div className="grid min-h-0 grid-rows-[auto_1fr_auto_auto] gap-4">
        <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <div className="grid gap-3 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-200 px-4 py-3 text-center"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Rakovinaga</div><div className="mt-2 text-lg font-semibold text-slate-900">{resolvedCostingConfig.customsRakovinaUsd.toFixed(2)} USD</div></div>
            <div className="rounded-xl border border-slate-200 px-4 py-3 text-center"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Unitazga</div><div className="mt-2 text-lg font-semibold text-slate-900">{resolvedCostingConfig.customsUnitazUsd.toFixed(2)} USD</div></div>
            <div className="rounded-xl border border-slate-200 px-4 py-3 text-center"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Sifonga</div><div className="mt-2 text-lg font-semibold text-slate-900">{resolvedCostingConfig.customsSifonUsd.toFixed(2)} USD</div></div>
            <div className="rounded-xl border border-slate-200 px-4 py-3 text-center"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Smesitelga</div><div className="mt-2 text-lg font-semibold text-slate-900">{resolvedCostingConfig.customsSmesitelUsd.toFixed(2)} USD</div></div>
            <div className="rounded-xl border border-slate-200 px-4 py-3 text-center"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">1 m³ transport</div><div className="mt-2 text-lg font-semibold text-slate-900">{resolvedCostingConfig.transportUsdPerCbm.toFixed(6)} USD</div></div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Ставки меняются в разделе настроек и используются в формулах Excel как в файле AZIZGA.xlsx.</p>
        </article>
        <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
          <div className="border-b border-[var(--border)] bg-white px-4 py-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[0.18em] text-slate-900">{name.trim() || getDefaultContainerName()}</h2>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Основная таблица товаров</p>
            </div>
          </div>
          {excelMessage ? (
            <div className="border-b border-[var(--border)] bg-slate-50 px-4 py-2 text-sm text-slate-700">{excelMessage}</div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto bg-white">
            <div className="min-w-[2800px]">
              <table className="w-full border-separate border-spacing-0 border border-slate-400 text-left text-sm">
              <thead className="sticky top-0 z-10 bg-white text-slate-800">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.label}
                      className={`border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em] ${c.width}`}
                    >
                      {c.label}
                    </th>
                  ))}
                  <th className="min-w-[120px] border-b-2 border-slate-400 px-2 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">—</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, rowIndex) => {
                  const product = r.productId ? productMap.get(r.productId) ?? null : null;
                  const pasteableCols = columns.filter(
                    (c) =>
                      c.id !== "picture" &&
                      c.id !== "transportUnit" &&
                      c.id !== "customsUnit" &&
                      c.id !== "customsTotal" &&
                      c.id !== "finalTotalAmount" &&
                      c.id !== "finalTotalAllContainers" &&
                      c.id !== "productTotal" &&
                      c.id !== "productTotalCny" &&
                      c.id !== "costPriceUSD" &&
                      c.id !== "salePriceUSD" &&
                      c.id !== "saleTotalUSD" &&
                      c.id !== "unitUsd" &&
                      c.id !== "averagePercent" &&
                      c.id !== "logisticsAverage" &&
                      c.id !== "perUnitTotal" &&
                      c.id !== "grandTotal",
                  );
                  const metrics = computeRowMetrics({
                    row: r,
                    product,
                    costingRuleMode: activeCostingRuleMode,
                    totalRoadExpenses: expenseTotals.road,
                    totalCustomsExpenses: expenseTotals.customs,
                    totalProductUsd: productTotals.totalUsd,
                    manualCustomsPerUnitUsd: toNumber(r.manualCustomsPerUnitUSD),
                    fallbackCustomsPerUnitUsd: customsFallbackMap.get(r.key) ?? 0,
                    costingConfig: resolvedCostingConfig,
                  });
                  const resolvedCustomsPerUnitValue =
                    metrics.totalCustomsUsd > 0 && metrics.quantity > 0 ? metrics.totalCustomsUsd / metrics.quantity : 0;

                  return (
                    <tr key={r.key}>
                      {columns.map((c) => {
                        if (c.id === "picture") {
                          return (
                            <td key="picture" className="border-b border-r border-slate-300 px-2 py-2">
                              {product?.imagePath ? (
                                <Image
                                  src={product.imagePath}
                                  alt={product.name}
                                  width={56}
                                  height={56}
                                  className="h-14 w-14 rounded-sm object-cover"
                                />
                              ) : (
                                <div className="h-14 w-14 rounded-sm border border-dashed border-slate-300 bg-white" />
                              )}
                            </td>
                          );
                        }
                        if (
                          c.id === "transportUnit" ||
                          c.id === "customsUnit" ||
                          c.id === "customsTotal" ||
                          c.id === "finalTotalAmount" ||
                          c.id === "finalTotalAllContainers" ||
                          c.id === "productTotal" ||
                          c.id === "productTotalCny" ||
                          c.id === "costPriceUSD" ||
                          c.id === "salePriceUSD" ||
                          c.id === "saleTotalUSD" ||
                          c.id === "unitUsd" ||
                          c.id === "averagePercent" ||
                          c.id === "logisticsAverage" ||
                          c.id === "perUnitTotal" ||
                          c.id === "grandTotal"
                        ) {
                          const value = Number(
                            c.id === "transportUnit"
                              ? metrics.totalCustomsUsd
                              : c.id === "customsUnit"
                                ? metrics.quantity > 0
                                  ? metrics.totalTransportUsd / metrics.quantity
                                  : 0
                              : c.id === "customsTotal"
                                ? metrics.totalTransportUsd
                              : c.id === "finalTotalAmount"
                                ? metrics.perUnitTotalValue
                              : c.id === "finalTotalAllContainers"
                                ? metrics.grandTotalValue
                              : c.id === "productTotal"
                              ? metrics.productTotalValue
                              : c.id === "productTotalCny"
                                ? metrics.productTotalCnyValue
                              : c.id === "costPriceUSD"
                                ? metrics.unitUsdValue
                                : c.id === "salePriceUSD"
                                  ? metrics.salePriceUsdValue
                                  : c.id === "saleTotalUSD"
                                    ? metrics.saleTotalUsdValue
                                    : c.id === "unitUsd"
                                      ? metrics.unitUsdValue
                                      : c.id === "averagePercent"
                                        ? metrics.averagePercentValue
                                        : c.id === "logisticsAverage"
                                          ? metrics.logisticsAverageValue
                                          : c.id === "perUnitTotal"
                                            ? metrics.perUnitTotalValue
                                            : metrics.grandTotalValue,
                          );
                          return (
                            <td key={c.id} className="border-b border-r border-slate-300 bg-slate-50 px-3 py-3 text-center text-[15px] font-medium text-slate-700">
                              {value > 0
                                ? `${value.toFixed(2)}${
                                    c.id === "averagePercent" && activeCostingRuleMode === COSTING_RULE_MODES.LEGACY ? "%" : ""
                                  }`
                                : "—"}
                            </td>
                          );
                        }
                        const field = c.id as keyof GridRow;
                        const colIndex = pasteableCols.findIndex((x) => x.id === field);
                        return (
                          <td key={String(field)} className="border-b border-r border-slate-300 px-0">
                            <input
                              value={String(r[field] ?? "")}
                              onChange={(e) => updateRow(r.key, { [field]: e.target.value } as Partial<GridRow>)}
                              onPaste={(e) => {
                                const text = e.clipboardData.getData("text");
                                if (!text.includes("\t") && !text.includes("\n")) return;
                                e.preventDefault();
                                applyPasteToItems(rowIndex, Math.max(0, colIndex), text);
                              }}
                              placeholder={
                                field === "manualCustomsPerUnitUSD" && !String(r[field] ?? "").trim() && resolvedCustomsPerUnitValue > 0
                                  ? resolvedCustomsPerUnitValue.toFixed(2)
                                  : undefined
                              }
                              className="w-full bg-white px-3 py-3 text-[15px] outline-none"
                            />
                          </td>
                        );
                      })}
                      <td className="border-b border-slate-300 px-2 py-1">
                        <button
                          type="button"
                          onClick={() => removeRow(r.key)}
                          className="rounded border border-[var(--border)] px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!rows.length ? (
                  <tr>
                    <td className="px-3 py-10 text-center text-sm text-slate-500" colSpan={columns.length + 1}>
                      Таблица пустая. Нажмите «Добавить товар» или вставьте из Excel.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              </table>

            </div>
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[2600px] border-separate border-spacing-0 text-center">
              <thead>
                <tr className="bg-slate-50">
                  {summaryRow.map((item) => (
                    <th
                      key={item.label}
                      className="border-b border-r border-slate-400 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 last:border-r-0"
                    >
                      {item.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {summaryRow.map((item) => (
                    <td
                      key={item.label}
                      className="border-r border-slate-300 px-3 py-3 text-base font-semibold text-slate-900 last:border-r-0"
                    >
                      {item.value}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <article className="flex max-h-[240px] min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Инвесторы</h2>
            <button
              type="button"
              onClick={addInvestmentRow}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Добавить строку
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 border border-[var(--border)] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--surface-soft)] text-slate-700">
                <tr>
                  {investmentColumns.map((c) => (
                    <th key={c.label} className={`border-b border-r border-[var(--border)] px-2 py-2 font-semibold ${c.width}`}>
                      {c.label}
                    </th>
                  ))}
                  <th className="min-w-[110px] border-b border-[var(--border)] px-2 py-2 font-semibold">—</th>
                </tr>
              </thead>
              <tbody>
                {investmentRows.map((r, rowIndex) => (
                  <tr key={r.key}>
                    {investmentColumns.map((c, colIndex) => {
                      const field = c.id;
                      if (field === "investorName") {
                        return (
                          <td key={field} className="border-b border-r border-[var(--border)] px-0">
                            <input
                              list="investor-names"
                              value={r.investorName}
                              onChange={(e) => updateInvestmentRow(r.key, { investorName: e.target.value })}
                              onPaste={(e) => {
                                const text = e.clipboardData.getData("text");
                                if (!text.includes("\t") && !text.includes("\n")) return;
                                e.preventDefault();
                                applyPasteToInvestors(rowIndex, colIndex, text);
                              }}
                              className="w-full bg-white px-2.5 py-1.5 text-sm outline-none focus:bg-[#fffceb]"
                              placeholder="Имя инвестора"
                            />
                          </td>
                        );
                      }
                      return (
                        <td key={field} className="border-b border-r border-[var(--border)] px-0">
                          <input
                            value={String(r[field] ?? "")}
                            onChange={(e) =>
                              updateInvestmentRow(r.key, { [field]: e.target.value } as Partial<InvestmentRow>)
                            }
                            onPaste={(e) => {
                              const text = e.clipboardData.getData("text");
                              if (!text.includes("\t") && !text.includes("\n")) return;
                              e.preventDefault();
                              applyPasteToInvestors(rowIndex, colIndex, text);
                            }}
                            className="w-full bg-white px-2.5 py-1.5 text-sm outline-none focus:bg-[#fffceb]"
                          />
                        </td>
                      );
                    })}
                    <td className="border-b border-[var(--border)] px-2 py-1">
                      <button
                        type="button"
                        onClick={() => removeInvestmentRow(r.key)}
                        className="rounded border border-[var(--border)] px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
                {!investmentRows.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={investmentColumns.length + 1}>
                      Нет строк. Нажмите «Добавить строку» или вставьте из Excel.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <datalist id="investor-names">
              {investors.map((inv) => (
                <option key={inv.id} value={inv.name} />
              ))}
            </datalist>
          </div>
        </article>

        <article className="flex max-h-[260px] min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Расходы</h2>
            <button
              type="button"
              onClick={addExpenseRow}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Добавить строку
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 border border-[var(--border)] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--surface-soft)] text-slate-700">
                <tr>
                  {expenseColumns.map((c) => (
                    <th key={c.label} className={`border-b border-r border-[var(--border)] px-2 py-2 font-semibold ${c.width}`}>
                      {c.label}
                    </th>
                  ))}
                  <th className="min-w-[110px] border-b border-[var(--border)] px-2 py-2 font-semibold">—</th>
                </tr>
              </thead>
              <tbody>
                {expenseRows.map((r, rowIndex) => (
                  <tr key={r.key}>
                    {expenseColumns.map((c, colIndex) => {
                      const field = c.id;
                      if (field === "category") {
                        return (
                          <td key={field} className="border-b border-r border-[var(--border)] px-0">
                            <select
                              value={r.category}
                              onChange={(e) => updateExpenseRow(r.key, { category: e.target.value as ExpenseRow["category"] })}
                              onPaste={(e) => {
                                const text = e.clipboardData.getData("text");
                                if (!text.includes("\t") && !text.includes("\n")) return;
                                e.preventDefault();
                                applyPasteToExpenses(rowIndex, colIndex, text);
                              }}
                              className="w-full bg-white px-2.5 py-1.5 text-sm outline-none focus:bg-[#fffceb]"
                            >
                              <option value="LOGISTICS">LOGISTICS</option>
                              <option value="CUSTOMS">CUSTOMS</option>
                              <option value="STORAGE">STORAGE</option>
                              <option value="TRANSPORT">TRANSPORT</option>
                              <option value="OTHER">OTHER</option>
                            </select>
                          </td>
                        );
                      }
                      return (
                        <td key={field} className="border-b border-r border-[var(--border)] px-0">
                          <input
                            value={String(r[field] ?? "")}
                            onChange={(e) => updateExpenseRow(r.key, { [field]: e.target.value } as Partial<ExpenseRow>)}
                            onPaste={(e) => {
                              const text = e.clipboardData.getData("text");
                              if (!text.includes("\t") && !text.includes("\n")) return;
                              e.preventDefault();
                              applyPasteToExpenses(rowIndex, colIndex, text);
                            }}
                            className="w-full bg-white px-2.5 py-1.5 text-sm outline-none focus:bg-[#fffceb]"
                          />
                        </td>
                      );
                    })}
                    <td className="border-b border-[var(--border)] px-2 py-1">
                      <button
                        type="button"
                        onClick={() => removeExpenseRow(r.key)}
                        className="rounded border border-[var(--border)] px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
                {!expenseRows.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={expenseColumns.length + 1}>
                      Нет строк. Нажмите «Добавить строку» или вставьте из Excel.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      {pickerOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setPickerOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-base font-semibold text-slate-900">Выберите товар</h4>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск: SKU / название / категория"
              className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <div className="mt-3 max-h-[60vh] overflow-auto rounded-xl border border-[var(--border)]">
              <div className="min-w-[1240px]">
                <div className="grid grid-cols-[120px_180px_140px_140px_140px_140px_160px_1fr_120px] border-b border-[var(--border)] bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  <span>SKU</span>
                  <span>Название</span>
                  <span>Общая сумма</span>
                  <span>Сумма в юанях</span>
                  <span>Себестоимость</span>
                  <span>Цена продажи</span>
                  <span>Общее по кол.</span>
                  <span>Размер</span>
                  <span>Категория</span>
                </div>
                {filteredProducts.map((p) => {
                  const costTotal = p.costPriceUSD > 0 ? p.costPriceUSD : 0;
                  const currentRate = toNumber(rate);
                  const costTotalCny = costTotal > 0 && currentRate > 0 ? costTotal / currentRate : 0;
                  const saleTotal = p.basePriceUSD > 0 ? p.basePriceUSD : 0;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => openQuantityModal(p)}
                      className="grid w-full grid-cols-[120px_180px_140px_140px_140px_140px_160px_1fr_120px] items-center gap-3 border-b border-[var(--border)] px-3 py-3 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="truncate font-medium text-slate-800">{p.sku}</span>
                      <span className="truncate text-slate-800">{p.name}</span>
                      <span className="text-slate-700">{costTotal > 0 ? costTotal.toFixed(2) : "—"}</span>
                      <span className="text-slate-700">{costTotalCny > 0 ? costTotalCny.toFixed(2) : "—"}</span>
                      <span className="text-slate-700">{p.costPriceUSD > 0 ? p.costPriceUSD.toFixed(2) : "—"}</span>
                      <span className="text-slate-700">{p.basePriceUSD > 0 ? p.basePriceUSD.toFixed(2) : "—"}</span>
                      <span className="text-slate-700">{saleTotal > 0 ? saleTotal.toFixed(2) : "—"}</span>
                      <span className="truncate text-slate-600">{p.size || "—"}</span>
                      <span className="truncate text-xs text-slate-500">{p.categoryName}</span>
                    </button>
                  );
                })}
                {!filteredProducts.length ? <p className="px-3 py-3 text-sm text-slate-500">Ничего не найдено.</p> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {pendingProduct ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/30 p-4" onClick={() => setPendingProduct(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-base font-semibold text-slate-900">Количество товара</h4>
            <p className="mt-1 text-sm text-slate-600">
              {pendingProduct.sku} — {pendingProduct.name}
            </p>
            <div className="mt-4 grid gap-2">
              <label className="text-sm text-slate-700">
                Количество
                <input
                  value={pendingQuantity}
                  onChange={(e) => setPendingQuantity(e.target.value)}
                  type="number"
                  min={1}
                  step={1}
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      confirmPendingProduct();
                    }
                  }}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingProduct(null)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmPendingProduct}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Добавить
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
