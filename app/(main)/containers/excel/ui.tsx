"use client";

import Image from "next/image";
import { useActionState, useMemo, useRef, useState } from "react";
import { createContainerAction, type CreateContainerFormState } from "@/app/(main)/containers/actions";

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
  const rate = toNumber(row.exchangeRate);
  if (totalCny > 0 && rate > 0) return String(Number((totalCny * rate).toFixed(2)));
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

export function CreateContainerExcelPage({
  defaultRate,
  products,
  investors,
}: {
  defaultRate: number | null;
  products: ProductOption[];
  investors: Array<{ id: string; name: string }>;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const initialState: CreateContainerFormState = { error: null, success: false };
  const [state, formAction, isPending] = useActionState(createContainerAction, initialState);

  const [name, setName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayIso);
  const [arrivalDate, setArrivalDate] = useState("");
  const [purchaseCny, setPurchaseCny] = useState("");
  const [rate, setRate] = useState(defaultRate ? String(defaultRate) : "");

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
        const rateValue = toNumber(r.exchangeRate);
        const priceCny = toNumber(r.priceCNY);
        const totalAmountCny = toNumber(r.totalAmountCNY) || toNumber(calcTotalAmountCny(r));
        const unitPriceUSD = priceCny > 0 && rateValue > 0 ? Number((priceCny * rateValue).toFixed(4)) : 0;
        const lineTotalUSD = toNumber(r.totalAmountUSD) || (totalAmountCny > 0 && rateValue > 0 ? Number((totalAmountCny * rateValue).toFixed(2)) : 0);
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

  const expensesJson = useMemo(() => {
    const payload = expenseRows
      .map((r) => ({
        title: r.title,
        category: r.category,
        amountUSD: toNumber(r.amountUSD),
        description: r.description,
      }))
      .filter((x) => String(x.title ?? "").trim().length > 0 && x.amountUSD > 0);
    return JSON.stringify(payload);
  }, [expenseRows]);

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
    return expenseRows.reduce(
      (acc, row) => {
        const amount = toNumber(row.amountUSD);
        acc.all += amount;
        if (row.category === "CUSTOMS") acc.customs += amount;
        if (row.category === "LOGISTICS" || row.category === "TRANSPORT") acc.road += amount;
        return acc;
      },
      { road: 0, customs: 0, all: 0 },
    );
  }, [expenseRows]);

  const investedTotal = useMemo(
    () => investmentRows.reduce((sum, row) => sum + toNumber(row.investedAmountUSD), 0),
    [investmentRows],
  );

  const summaryBlock = useMemo(() => {
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
  }, [expenseTotals.all, investedTotal, productTotals.quantity, productTotals.totalUsd]);

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
      { label: "YO'L GA", value: formatSheetValue(expenseTotals.road, 2) },
      { label: "RASTAMOJKA", value: formatSheetValue(expenseTotals.customs, 2) },
      { label: "TOTAL AMOUNT", value: formatSheetValue(summaryBlock.grandTotalUsd, 2) },
      { label: "ortacha birlik", value: formatSheetValue(summaryBlock.avgUnitUsd, 4) },
      { label: "YOLGA VA Rastamojka ortacha birligi", value: formatSheetValue(summaryBlock.avgExpensePerUnit, 4) },
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
            if (!next.priceCNY && hit.costPriceUSD > 0 && toNumber(next.exchangeRate) > 0) {
              next.priceCNY = String(Number((hit.costPriceUSD / toNumber(next.exchangeRate)).toFixed(4)));
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
      const totalAmountCnyCol = amountCols.find((col) => col > quantityCol) ?? 0;
      const cbmCol = findCol((value) => value === "cbm");
      const kgCol = findCol((value) => value === "kg");
      const totalCbmCol = findCol((value) => value.includes("total cbm"));
      const totalNwKgsCol = findCol((value) => value.includes("total n.w. kgs"));

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
      const exchangeRateValue = exchangeRateFromSheet > 0 ? String(exchangeRateFromSheet) : rate;
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
        const quantity = quantityCol ? getWorksheetCellText(row.getCell(quantityCol).value) : "";
        const totalAmountCNY = totalAmountCnyCol ? getWorksheetCellText(row.getCell(totalAmountCnyCol).value) : "";
        const cbm = cbmCol ? getWorksheetCellText(row.getCell(cbmCol).value) : "";
        const kg = kgCol ? getWorksheetCellText(row.getCell(kgCol).value) : "";
        const totalCbm = totalCbmCol ? getWorksheetCellText(row.getCell(totalCbmCol).value) : "";
        const nwKgs = totalNwKgsCol ? getWorksheetCellText(row.getCell(totalNwKgsCol).value) : "";
        const totalAmountUSD = totalAmountUsdCol ? getWorksheetCellText(row.getCell(totalAmountUsdCol).value) : "";

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
          color: "",
          quantity,
          totalAmountCNY,
          cbm,
          kg,
          totalCbm,
          nwKgs,
          exchangeRate: exchangeRateValue || rate,
          totalAmountUSD,
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
      }

      const sheetName = file.name.replace(/\.xlsx$/i, "").trim();
      if (!name.trim() && sheetName) setName(sheetName);
      if (!purchaseCny.trim() && purchaseTotalFromSheet > 0) setPurchaseCny(String(Number(purchaseTotalFromSheet.toFixed(2))));
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
      const headers = [
        "FACTORI NAME",
        "OSSO NAME",
        "PICTURE / 图片",
        "UNIT PRICE",
        "SAIZE",
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
        "ortacha birlik",
        "YOLGA VA Rastamojka ortacha birligi",
        "BIR DONASI",
        "JAMI",
      ];
      sheet.addRow(headers);
      const totalLogisticsAndCustoms = expenseTotals.road + expenseTotals.customs;
      for (const row of rows) {
        const product = row.productId ? productMap.get(row.productId) ?? null : null;
        const quantityValue = Math.max(0, Math.floor(toNumber(row.quantity)));
        const unitUsdValue =
          toNumber(row.priceCNY) > 0 && toNumber(row.exchangeRate) > 0
            ? toNumber(row.priceCNY) * toNumber(row.exchangeRate)
            : (product?.costPriceUSD ?? 0);
        const totalAmountUsdValue = toNumber(row.totalAmountUSD) || toNumber(calcLineTotalUsd(row));
        const averagePercentValue = productTotals.totalUsd > 0 ? (totalAmountUsdValue / productTotals.totalUsd) * 100 : 0;
        const logisticsAverageValue = totalLogisticsAndCustoms > 0 ? (totalLogisticsAndCustoms * averagePercentValue) / 100 : 0;
        const perUnitTotalValue = quantityValue > 0 ? (totalAmountUsdValue + logisticsAverageValue) / quantityValue : 0;
        const grandTotalValue = totalAmountUsdValue + logisticsAverageValue;
        sheet.addRow([
          row.factoryName,
          row.localName,
          product?.imagePath ? "IMAGE" : "",
          row.priceCNY,
          row.saize,
          row.quantity,
          row.totalAmountCNY || calcTotalAmountCny(row),
          row.cbm,
          row.kg,
          row.totalCbm || calcTotalCbm(row),
          row.nwKgs || calcNwKgs(row),
          "DALEE",
          row.exchangeRate,
          unitUsdValue > 0 ? Number(unitUsdValue.toFixed(2)) : "",
          totalAmountUsdValue > 0 ? Number(totalAmountUsdValue.toFixed(2)) : "",
          averagePercentValue > 0 ? Number(averagePercentValue.toFixed(2)) : "",
          logisticsAverageValue > 0 ? Number(logisticsAverageValue.toFixed(2)) : "",
          perUnitTotalValue > 0 ? Number(perUnitTotalValue.toFixed(2)) : "",
          grandTotalValue > 0 ? Number(grandTotalValue.toFixed(2)) : "",
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
      const totalLogisticsAndCustoms = expenseTotals.road + expenseTotals.customs;

      sheet.getCell("A1").value = "Шаблон контейнера";
      sheet.getCell("A1").font = { bold: true, size: 16 };
      sheet.mergeCells("A1:E1");

      sheet.getCell("I5").value = "TOTAL AMOUNT";
      sheet.getCell("J5").value = "TOTAL CBM";
      sheet.getCell("K5").value = "TOTAL N.W. KGS";
      sheet.getCell("N5").value = "Y - $";
      sheet.getCell("O5").value = "TOTAL AMOUNT";
      sheet.getCell("P5").value = "ortacha birlik";
      sheet.getCell("Q5").value = "YOLGA VA Rastamojka ortacha birligi";
      sheet.getCell("R5").value = "BIR DONASI";
      sheet.getCell("S5").value = "JAMI";

      const headers = [
        "FACTORI NAME",
        "OSSO NAME",
        "PICTURE / 图片",
        "UNIT PRICE",
        "SAIZE",
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
        "ortacha birlik",
        "YOLGA VA Rastamojka ortacha birligi",
        "BIR DONASI",
        "JAMI",
      ];
      sheet.getRow(6).values = headers;

      const exampleRows = [
        ["FACTORY-001", "OSSO-001", "", 70, "610*480*160", 30, 2100, 0.055, 14, "", "", "DALEE", rate ? Number(rate) : defaultRate ?? "", "", "", "", "", "", ""],
        ["FACTORY-002", "OSSO-002", "", 80, "710*480*160", 20, 1600, 0.064, 16, "", "", "DALEE", rate ? Number(rate) : defaultRate ?? "", "", "", "", "", "", ""],
      ];
      for (const values of exampleRows) sheet.addRow(values);

      for (let rowNumber = 7; rowNumber <= 80; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        if (!row.getCell(7).value) continue;
        row.getCell(10).value = { formula: `F${rowNumber}*H${rowNumber}` };
        row.getCell(11).value = { formula: `F${rowNumber}*I${rowNumber}` };
        row.getCell(14).value = { formula: `D${rowNumber}*M${rowNumber}` };
        row.getCell(15).value = { formula: `G${rowNumber}*M${rowNumber}` };
        row.getCell(16).value = { formula: `IF($O$81=0,0,O${rowNumber}/$O$81*100)` };
        row.getCell(17).value = { formula: `P${rowNumber}/100*$Q$81` };
        row.getCell(18).value = { formula: `IF(G${rowNumber}=0,0,(O${rowNumber}+Q${rowNumber})/G${rowNumber})` };
        row.getCell(19).value = { formula: `O${rowNumber}+Q${rowNumber}` };
      }

      sheet.getCell("I80").value = "TOTAL AMOUNT";
      sheet.getCell("J80").value = "TOTAL CBM";
      sheet.getCell("K80").value = "TOTAL N.W. KGS";
      sheet.getCell("O80").value = "TOTAL AMOUNT";
      sheet.getCell("Q80").value = "YOLGA + RASTAMOJKA";
      sheet.getCell("I81").value = { formula: "SUM(G7:G79)" };
      sheet.getCell("J81").value = { formula: "SUM(J7:J79)" };
      sheet.getCell("K81").value = { formula: "SUM(K7:K79)" };
      sheet.getCell("O81").value = { formula: "SUM(O7:O79)" };
      sheet.getCell("Q81").value = totalLogisticsAndCustoms > 0 ? Number(totalLogisticsAndCustoms.toFixed(2)) : 0;

      const expensesSheet = workbook.addWorksheet("Расходы");
      expensesSheet.addRow(["Название", "Категория", "Сумма USD", "Комментарий"]);
      expensesSheet.addRow(["Растаможка", "CUSTOMS", "", ""]);
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
    const priceCny = product.costPriceUSD > 0 && rateValue > 0 ? String(Number((product.costPriceUSD / rateValue).toFixed(4))) : "";
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
    const pasteColumns = columns.filter((c) => c.id !== "picture").map((c) => c.id as keyof GridRow);

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
            if (!merged.priceCNY && hit.costPriceUSD > 0 && toNumber(merged.exchangeRate) > 0) {
              merged.priceCNY = String(Number((hit.costPriceUSD / toNumber(merged.exchangeRate)).toFixed(4)));
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
    { id: "productTotal", label: "ОБЩАЯ СУММА ТОВАРА", width: "min-w-[180px]" },
    { id: "productTotalCny", label: "СУММА В ЮАНЯХ", width: "min-w-[170px]" },
    { id: "costPriceUSD", label: "СЕБЕСТОИМОСТЬ", width: "min-w-[170px]" },
    { id: "salePriceUSD", label: "ЦЕНА ПРОДАЖИ", width: "min-w-[170px]" },
    { id: "saleTotalUSD", label: "ОБЩЕЕ ПО КОЛИЧЕСТВУ", width: "min-w-[190px]" },
    { id: "priceCNY", label: "UNIT PRICE", width: "min-w-[170px]" },
    { id: "saize", label: "SAIZE", width: "min-w-[230px]" },
    { id: "quantity", label: "QUANTITY ( SET )", width: "min-w-[170px]" },
    { id: "totalAmountCNY", label: "TOTAL AMOUNT", width: "min-w-[190px]" },
    { id: "cbm", label: "CBM", width: "min-w-[140px]" },
    { id: "kg", label: "KG", width: "min-w-[140px]" },
    { id: "totalCbm", label: "TOTAL CBM", width: "min-w-[170px]" },
    { id: "nwKgs", label: "TOTAL N.W. KGS", width: "min-w-[190px]" },
    { id: "exchangeRate", label: "КУРС", width: "min-w-[120px]" },
    { id: "unitUsd", label: "Y - $", width: "min-w-[150px]" },
    { id: "totalAmountUSD", label: "TOTAL AMOUNT", width: "min-w-[180px]" },
    { id: "averagePercent", label: "ortacha birlik", width: "min-w-[160px]" },
    { id: "logisticsAverage", label: "YOLGA VA Rastamojka ortacha birligi", width: "min-w-[210px]" },
    { id: "perUnitTotal", label: "BIR DONASI", width: "min-w-[150px]" },
    { id: "grandTotal", label: "JAMI", width: "min-w-[150px]" },
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

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(150px,1fr))_auto]">
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

      <div className="grid min-h-0 grid-rows-[1fr_auto_auto] gap-4">
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
                  const quantityValue = Math.max(0, Math.floor(toNumber(r.quantity)));
                  const totalLogisticsAndCustoms = expenseTotals.road + expenseTotals.customs;
                  const costPriceUsdValue =
                    toNumber(r.priceCNY) > 0 && toNumber(r.exchangeRate) > 0
                      ? toNumber(r.priceCNY) * toNumber(r.exchangeRate)
                      : (product?.costPriceUSD ?? 0);
                  const unitUsdValue = costPriceUsdValue;
                  const productTotalValue = toNumber(r.totalAmountUSD) || toNumber(calcLineTotalUsd(r));
                  const productTotalCnyValue = toNumber(r.totalAmountCNY) || toNumber(calcTotalAmountCny(r));
                  const salePriceUsdValue = product?.basePriceUSD ?? 0;
                  const saleTotalUsdValue = quantityValue > 0 && salePriceUsdValue > 0 ? salePriceUsdValue * quantityValue : 0;
                  const averagePercentValue = productTotals.totalUsd > 0 ? (productTotalValue / productTotals.totalUsd) * 100 : 0;
                  const logisticsAverageValue = totalLogisticsAndCustoms > 0 ? (totalLogisticsAndCustoms * averagePercentValue) / 100 : 0;
                  const grandTotalValue = productTotalValue + logisticsAverageValue;
                  const perUnitTotalValue = quantityValue > 0 ? grandTotalValue / quantityValue : 0;

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
                            c.id === "productTotal"
                              ? productTotalValue
                              : c.id === "productTotalCny"
                                ? productTotalCnyValue
                              : c.id === "costPriceUSD"
                                ? costPriceUsdValue
                                : c.id === "salePriceUSD"
                                  ? salePriceUsdValue
                                  : c.id === "saleTotalUSD"
                                    ? saleTotalUsdValue
                                    : c.id === "unitUsd"
                                      ? unitUsdValue
                                      : c.id === "averagePercent"
                                        ? averagePercentValue
                                        : c.id === "logisticsAverage"
                                          ? logisticsAverageValue
                                          : c.id === "perUnitTotal"
                                            ? perUnitTotalValue
                                            : grandTotalValue,
                          );
                          return (
                            <td key={c.id} className="border-b border-r border-slate-300 bg-slate-50 px-3 py-3 text-center text-[15px] font-medium text-slate-700">
                              {value > 0 ? `${value.toFixed(2)}${c.id === "averagePercent" ? "%" : ""}` : "—"}
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
