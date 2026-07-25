"use client";

import { useMemo, useRef, useState } from "react";
import { calculateV2Costing, COSTING_RULE_MODES, resolveCostingRuleMode } from "@/lib/costing-rules";

type ProductCategoryItem = {
  id: string;
  name: string;
  description?: string | null;
};

type GridRow = {
  key: number;
  include: boolean;
  factoryName: string;
  localName: string;
  priceCNY: string;
  size: string;
  color: string;
  quantity: string;
  totalAmountCNY: string;
  cbm: string;
  kg: string;
  totalCbm: string;
  netWorthKgs: string;
  exchangeRate: string;
  totalAmountUSD: string;
  categoryId: string;
  description: string;
  salePriceUSD: string;
  imageFile: File | null;
};

type CreateProductsExcelPageProps = {
  categories: ProductCategoryItem[];
  costingRuleMode: string;
};

function toNumber(value: string) {
  const n = Number(String(value ?? "").trim().replace(",", "."));
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

function calcTotalAmountCny(row: Pick<GridRow, "quantity" | "priceCNY">) {
  const quantity = Math.max(0, Math.floor(toNumber(row.quantity)));
  const priceCNY = toNumber(row.priceCNY);
  if (quantity > 0 && priceCNY > 0) return String(Number((quantity * priceCNY).toFixed(2)));
  return "";
}

function calcTotalCbm(row: Pick<GridRow, "quantity" | "cbm">) {
  const quantity = Math.max(0, Math.floor(toNumber(row.quantity)));
  const cbm = toNumber(row.cbm);
  if (quantity > 0 && cbm > 0) return String(Number((quantity * cbm).toFixed(4)));
  return "";
}

function calcNetWorthKgs(row: Pick<GridRow, "quantity" | "kg">) {
  const quantity = Math.max(0, Math.floor(toNumber(row.quantity)));
  const kg = toNumber(row.kg);
  if (quantity > 0 && kg > 0) return String(Number((quantity * kg).toFixed(3)));
  return "";
}

function calcTotalAmountUsd(row: Pick<GridRow, "quantity" | "priceCNY" | "totalAmountCNY" | "exchangeRate">) {
  const totalAmountCNY = toNumber(row.totalAmountCNY) || toNumber(calcTotalAmountCny(row));
  const totalUsd = convertCnyToUsd(totalAmountCNY, row.exchangeRate);
  if (totalUsd > 0) return String(Number(totalUsd.toFixed(2)));
  return "";
}

function formatValue(value: number, digits = 2) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return value.toFixed(digits);
}

function getAverageColumnLabel(mode: string) {
  return mode === COSTING_RULE_MODES.CATEGORY_BASED_V2 ? "YO'L GA 1 SHT" : "ortacha birlik";
}

function getLogisticsColumnLabel(mode: string) {
  return mode === COSTING_RULE_MODES.CATEGORY_BASED_V2
    ? "YO'L + RASTAMOJKA 1 SHT"
    : "YOLGA VA Rastamojka ortacha birligi";
}

function getCustomsFormulaForProductExcel(rowNumber: number) {
  return `IF(OR(ISNUMBER(SEARCH("sifon",T${rowNumber}&" "&A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("сифон",T${rowNumber}&" "&A${rowNumber}&" "&B${rowNumber}))),0.82,IF(OR(ISNUMBER(SEARCH("smesitel",T${rowNumber}&" "&A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("смес",T${rowNumber}&" "&A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("mixer",T${rowNumber}&" "&A${rowNumber}&" "&B${rowNumber}))),1.47,IF(OR(ISNUMBER(SEARCH("unitaz",T${rowNumber}&" "&A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("унитаз",T${rowNumber}&" "&A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("toilet",T${rowNumber}&" "&A${rowNumber}&" "&B${rowNumber}))),18.81,IF(OR(ISNUMBER(SEARCH("rakovina",T${rowNumber}&" "&A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("раков",T${rowNumber}&" "&A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("sink",T${rowNumber}&" "&A${rowNumber}&" "&B${rowNumber})),ISNUMBER(SEARCH("washbasin",T${rowNumber}&" "&A${rowNumber}&" "&B${rowNumber}))),6.65,0))))`;
}

function makeEmptyRow(key: number, exchangeRate = ""): GridRow {
  return {
    key,
    include: true,
    factoryName: "",
    localName: "",
    priceCNY: "",
    size: "Без размера",
    color: "",
    quantity: "1",
    totalAmountCNY: "",
    cbm: "",
    kg: "",
    totalCbm: "",
    netWorthKgs: "",
    exchangeRate,
    totalAmountUSD: "",
    categoryId: "",
    description: "",
    salePriceUSD: "",
    imageFile: null,
  };
}

export function CreateProductsExcelPage({ categories, costingRuleMode }: CreateProductsExcelPageProps) {
  const [defaultRate, setDefaultRate] = useState("");
  const [logisticsUsd, setLogisticsUsd] = useState("");
  const [customsUsd, setCustomsUsd] = useState("");
  const [rows, setRows] = useState<GridRow[]>([
    makeEmptyRow(1, defaultRate),
    makeEmptyRow(2, defaultRate),
    makeEmptyRow(3, defaultRate),
  ]);
  const [nextKey, setNextKey] = useState(4);
  const [defaultCategoryId, setDefaultCategoryId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const activeCostingRuleMode = resolveCostingRuleMode(costingRuleMode);

  const categoryOptions = useMemo(
    () => [{ value: "", label: "Без категории" }, ...categories.map((item) => ({ value: item.id, label: item.name }))],
    [categories],
  );
  const categoryNameById = useMemo(
    () => new Map(categories.map((item) => [item.id, item.name])),
    [categories],
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        if (!row.include) return acc;
        acc.products += row.localName.trim() ? 1 : 0;
        acc.quantity += Math.max(0, Math.floor(toNumber(row.quantity)));
        acc.totalAmountCNY += toNumber(row.totalAmountCNY) || toNumber(calcTotalAmountCny(row));
        acc.totalAmountUSD += toNumber(row.totalAmountUSD) || toNumber(calcTotalAmountUsd(row));
        acc.totalCbm += toNumber(row.totalCbm) || toNumber(calcTotalCbm(row));
        acc.netWorthKgs += toNumber(row.netWorthKgs) || toNumber(calcNetWorthKgs(row));
        return acc;
      },
      { products: 0, quantity: 0, totalAmountCNY: 0, totalAmountUSD: 0, totalCbm: 0, netWorthKgs: 0 },
    );
  }, [rows]);

  const sharedExtraCostsUsd = useMemo(() => toNumber(logisticsUsd) + toNumber(customsUsd), [customsUsd, logisticsUsd]);

  function getRowMetrics(row: GridRow) {
    const quantity = Math.max(0, Math.floor(toNumber(row.quantity)));
    const unitUsd =
      toNumber(row.priceCNY) > 0 && normalizeExchangeRateToUsd(row.exchangeRate) > 0
        ? convertCnyToUsd(toNumber(row.priceCNY), row.exchangeRate)
        : 0;
    const totalAmountUsd = toNumber(row.totalAmountUSD) || toNumber(calcTotalAmountUsd(row));
    if (activeCostingRuleMode === COSTING_RULE_MODES.CATEGORY_BASED_V2) {
      const metrics = calculateV2Costing({
        quantity,
        unitPriceUsd: unitUsd,
        lineTotalUsd: totalAmountUsd,
        cbmPerUnit: toNumber(row.cbm),
        categoryName: categoryNameById.get(row.categoryId) ?? null,
        productName: row.localName,
        sku: row.factoryName,
      });
      return {
        quantity,
        totalAmountUsd,
        unitUsd,
        averagePercent: metrics.transportPerUnitUsd,
        logisticsAverage: metrics.extraPerUnitUsd,
        birDonasi: metrics.finalUnitCostUsd,
        jami: metrics.finalTotalCostUsd,
        transportUnit: metrics.transportPerUnitUsd,
        transportTotal: metrics.totalTransportUsd,
        customsUnit: quantity > 0 ? metrics.totalCustomsUsd / quantity : 0,
        customsTotal: metrics.totalCustomsUsd,
        finalUnitTotal: metrics.finalUnitCostUsd,
        finalGrandTotal: metrics.finalTotalCostUsd,
      };
    }
    const averagePercent = totals.totalAmountUSD > 0 ? (totalAmountUsd / totals.totalAmountUSD) * 100 : 0;
    const transportTotal = toNumber(logisticsUsd) > 0 ? (toNumber(logisticsUsd) * averagePercent) / 100 : 0;
    const customsTotal = toNumber(customsUsd) > 0 ? (toNumber(customsUsd) * averagePercent) / 100 : 0;
    const transportUnit = quantity > 0 ? transportTotal / quantity : 0;
    const customsUnit = quantity > 0 ? customsTotal / quantity : 0;
    const logisticsAverage = sharedExtraCostsUsd > 0 ? (sharedExtraCostsUsd * averagePercent) / 100 : 0;
    const birDonasi = quantity > 0 ? (totalAmountUsd + logisticsAverage) / quantity : 0;
    const jami = totalAmountUsd + logisticsAverage;
    return {
      quantity,
      totalAmountUsd,
      unitUsd,
      averagePercent,
      logisticsAverage,
      birDonasi,
      jami,
      transportUnit,
      transportTotal,
      customsUnit,
      customsTotal,
      finalUnitTotal: birDonasi,
      finalGrandTotal: jami,
    };
  }

  function updateRow(key: number, patch: Partial<GridRow>) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };

        if (patch.quantity !== undefined || patch.priceCNY !== undefined) {
          if (patch.totalAmountCNY === undefined) next.totalAmountCNY = calcTotalAmountCny(next);
        }
        if (
          patch.quantity !== undefined ||
          patch.priceCNY !== undefined ||
          patch.totalAmountCNY !== undefined ||
          patch.exchangeRate !== undefined
        ) {
          if (patch.totalAmountUSD === undefined) next.totalAmountUSD = calcTotalAmountUsd(next);
        }
        if (patch.quantity !== undefined || patch.cbm !== undefined) {
          if (patch.totalCbm === undefined) next.totalCbm = calcTotalCbm(next);
        }
        if (patch.quantity !== undefined || patch.kg !== undefined) {
          if (patch.netWorthKgs === undefined) next.netWorthKgs = calcNetWorthKgs(next);
        }
        return next;
      }),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, makeEmptyRow(nextKey, defaultRate)]);
    setNextKey((prev) => prev + 1);
    requestAnimationFrame(() => {
      const target = tableWrapRef.current;
      if (target) {
        target.scrollLeft = target.scrollWidth;
        target.scrollTop = target.scrollHeight;
      }
    });
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  function applyDefaultCategory() {
    setRows((prev) => prev.map((row) => ({ ...row, categoryId: defaultCategoryId })));
  }

  function applyDefaultRate() {
    setRows((prev) =>
      prev.map((row) => {
        const next = { ...row, exchangeRate: defaultRate };
        next.totalAmountUSD = calcTotalAmountUsd(next);
        return next;
      }),
    );
  }

  async function downloadTemplateExcel() {
    setError("");
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("TRUCK ALL-1", {
        views: [{ state: "frozen", ySplit: 6 }],
      });
      const averageColumnLabel = getAverageColumnLabel(activeCostingRuleMode);
      const logisticsColumnLabel = getLogisticsColumnLabel(activeCostingRuleMode);

      sheet.getCell("A1").value = "Шаблон товаров";
      sheet.getCell("A1").font = { bold: true, size: 16 };
      sheet.mergeCells("A1:D1");

      sheet.getCell("N2").value = "YO'LGA USD";
      sheet.getCell("O2").value = toNumber(logisticsUsd) > 0 ? toNumber(logisticsUsd) : "";
      sheet.getCell("P2").value = "RASTAMOJKA USD";
      sheet.getCell("Q2").value = toNumber(customsUsd) > 0 ? toNumber(customsUsd) : "";

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
        "Категория",
        "Описание",
        "Цена продажи USD",
      ];

      sheet.getRow(6).values = headers;

      const previewRows = rows.slice(0, 12);
      for (const row of previewRows) {
        sheet.addRow([
          row.factoryName,
          row.localName,
          row.imageFile?.name ?? "",
          row.priceCNY ? toNumber(row.priceCNY) : "",
          row.size,
          row.color,
          row.quantity ? Math.max(0, Math.floor(toNumber(row.quantity))) : "",
          row.totalAmountCNY ? toNumber(row.totalAmountCNY) : "",
          row.cbm ? toNumber(row.cbm) : "",
          row.kg ? toNumber(row.kg) : "",
          row.totalCbm ? toNumber(row.totalCbm) : "",
          row.netWorthKgs ? toNumber(row.netWorthKgs) : "",
          row.exchangeRate ? toNumber(row.exchangeRate) : "",
          "",
          row.totalAmountUSD ? toNumber(row.totalAmountUSD) : "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          categoryOptions.find((option) => option.value === row.categoryId)?.label ?? "",
          row.description,
          row.salePriceUSD ? toNumber(row.salePriceUSD) : "",
        ]);
      }

      for (let rowNumber = 7; rowNumber <= Math.max(18, sheet.rowCount); rowNumber += 1) {
        sheet.getCell(`H${rowNumber}`).value = { formula: `IF(AND(D${rowNumber}>0,G${rowNumber}>0),D${rowNumber}*G${rowNumber},"")` };
        sheet.getCell(`K${rowNumber}`).value = { formula: `IF(AND(I${rowNumber}>0,G${rowNumber}>0),I${rowNumber}*G${rowNumber},"")` };
        sheet.getCell(`L${rowNumber}`).value = { formula: `IF(AND(J${rowNumber}>0,G${rowNumber}>0),J${rowNumber}*G${rowNumber},"")` };
        sheet.getCell(`N${rowNumber}`).value = { formula: `IF(AND(D${rowNumber}>0,M${rowNumber}>0),D${rowNumber}*M${rowNumber},"")` };
        sheet.getCell(`O${rowNumber}`).value = { formula: `IF(AND(H${rowNumber}>0,M${rowNumber}>0),H${rowNumber}*M${rowNumber},"")` };
        if (activeCostingRuleMode === COSTING_RULE_MODES.CATEGORY_BASED_V2) {
          sheet.getCell(`P${rowNumber}`).value = { formula: `IF(AND(I${rowNumber}>0,G${rowNumber}>0),I${rowNumber}*85.714653,"")` };
          sheet.getCell(`Q${rowNumber}`).value = { formula: `IF(G${rowNumber}>0,${getCustomsFormulaForProductExcel(rowNumber)},"")` };
          sheet.getCell(`R${rowNumber}`).value = { formula: `IF(G${rowNumber}=0,"",N${rowNumber}+P${rowNumber}+Q${rowNumber})` };
          sheet.getCell(`S${rowNumber}`).value = { formula: `IF(G${rowNumber}=0,"",R${rowNumber}*G${rowNumber})` };
        } else {
          sheet.getCell(`P${rowNumber}`).value = { formula: `IF($O$20=0,"",O${rowNumber}/$O$20*100)` };
          sheet.getCell(`Q${rowNumber}`).value = { formula: `IF($R$20=0,"",P${rowNumber}/100*$R$20)` };
          sheet.getCell(`R${rowNumber}`).value = { formula: `IF(G${rowNumber}=0,"",(O${rowNumber}+Q${rowNumber})/G${rowNumber})` };
          sheet.getCell(`S${rowNumber}`).value = { formula: `IF(O${rowNumber}=0,"",O${rowNumber}+Q${rowNumber})` };
        }
      }

      sheet.getCell("O20").value = { formula: "SUM(O7:O19)" };
      sheet.getCell("R20").value =
        activeCostingRuleMode === COSTING_RULE_MODES.CATEGORY_BASED_V2
          ? "по новой формуле"
          : { formula: "O2+Q2" };

      sheet.columns = [
        { width: 24 },
        { width: 24 },
        { width: 16 },
        { width: 14 },
        { width: 18 },
        { width: 18 },
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
        { width: 22 },
        { width: 16 },
        { width: 16 },
        { width: 18 },
        { width: 28 },
        { width: 18 },
      ];

      sheet.getRow(6).eachCell((cell) => {
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

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "products-template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSuccess("Шаблон Excel скачан.");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Ошибка скачивания шаблона Excel.");
    }
  }

  async function submitRows() {
    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const cleanedRows = rows
        .filter((row) => row.include)
        .map((row) => {
          const exchangeRate = normalizeExchangeRateToUsd(row.exchangeRate);
          const costPriceUSD = Number(convertCnyToUsd(toNumber(row.priceCNY), exchangeRate).toFixed(4));
          return {
            sku: row.factoryName.trim(),
            name: row.localName.trim(),
            categoryId: row.categoryId.trim() || null,
            size: row.size.trim() || "Без размера",
            color: row.color.trim() || null,
            description: row.description.trim() || null,
            costPriceUSD,
            cbm: toNumber(row.cbm),
            kg: toNumber(row.kg),
            salePriceUSD: toNumber(row.salePriceUSD),
            imageFile: row.imageFile,
          };
        })
        .filter((row) => row.sku && row.name && row.costPriceUSD > 0 && row.salePriceUSD > 0);

      if (!cleanedRows.length) {
        throw new Error("Нет валидных строк. Заполните название в заводе, название у нас, цену в юане, курс и цену продажи.");
      }

      const form = new FormData();
      const rowsForServer = cleanedRows.map((row, index) => {
        const imageKey = row.imageFile ? `img_${index}_${row.sku}` : null;
        if (imageKey && row.imageFile) {
          form.set(imageKey, row.imageFile);
        }
        return {
          sku: row.sku,
          name: row.name,
          categoryId: row.categoryId,
          size: row.size,
          color: row.color,
          description: row.description,
          costPriceUSD: row.costPriceUSD,
          cbm: row.cbm > 0 ? row.cbm : null,
          kg: row.kg > 0 ? row.kg : null,
          salePriceUSD: row.salePriceUSD,
          imageKey,
        };
      });

      form.set("rowsJson", JSON.stringify(rowsForServer));

      const response = await fetch("/api/products/import-from-excel", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; products?: unknown[] };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Не удалось создать товары.");
      }

      setSuccess(`Создано/обновлено товаров: ${data.products?.length ?? cleanedRows.length}`);
      setRows([makeEmptyRow(1, defaultRate), makeEmptyRow(2, defaultRate), makeEmptyRow(3, defaultRate)]);
      setNextKey(4);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ошибка создания товаров.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article className="grid h-full min-h-0 grid-rows-[auto_auto_1fr_auto_auto] gap-4 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="sticky top-0 z-20 grid grid-cols-1 gap-2 rounded-xl border border-[var(--border)] bg-white p-3 sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center">
        <select
          value={defaultCategoryId}
          onChange={(event) => setDefaultCategoryId(event.target.value)}
          className="min-w-0 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-700 xl:min-w-56"
        >
          {categoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={applyDefaultCategory}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Применить категорию ко всем
        </button>
        <input
          value={defaultRate}
          onChange={(event) => setDefaultRate(event.target.value)}
          type="number"
          min={0}
          step="0.0001"
          placeholder="Yuan to USD"
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-700 xl:w-40"
        />
        <button
          type="button"
          onClick={applyDefaultRate}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Применить курс ко всем
        </button>
        <input
          value={logisticsUsd}
          onChange={(event) => setLogisticsUsd(event.target.value)}
          type="number"
          min={0}
          step="0.01"
          placeholder="YO'LGA USD"
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-700 xl:w-36"
        />
        <input
          value={customsUsd}
          onChange={(event) => setCustomsUsd(event.target.value)}
          type="number"
          min={0}
          step="0.01"
          placeholder="RASTAMOJKA USD"
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-700 xl:w-40"
        />
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Добавить строку
        </button>
        <button
          type="button"
          onClick={() => void downloadTemplateExcel()}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Скачать шаблон Excel
        </button>
        <button
          type="button"
          onClick={submitRows}
          disabled={isSubmitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting ? "Создание..." : "Создать товары"}
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>
      ) : null}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold tracking-[0.18em] text-slate-900">TRUCK ALL-1</h2>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Product creation sheet</p>
        </div>
      </div>

      <div ref={tableWrapRef} className="min-h-0 overflow-auto rounded-xl border border-slate-400">
        <table className="min-w-[3650px] w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white text-slate-800">
            <tr>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">FACTORI NAME</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">OSSO NAME</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">PICTURE / 图片</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">UNIT PRICE</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">SAIZE</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold tracking-[0.04em]">Product color</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">QUANTITY ( SET )</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">TOTAL AMOUNT</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">CBM</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">KG</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">TOTAL CBM</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">TOTAL N.W. KGS</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">КУРС</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">Y - $</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">TOTAL AMOUNT</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold tracking-[0.04em]">
                {getAverageColumnLabel(activeCostingRuleMode)}
              </th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold tracking-[0.04em]">
                {getLogisticsColumnLabel(activeCostingRuleMode)}
              </th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">BIR DONASI</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">JAMI</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">TRANSPORTGA</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">TOTAL AMOUNT TRANSPORTGA</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">RASTAMOJKAGA</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">TOTAL AMOUNT RASTAMOJKAGA</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">TOTAL AMOUNT</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold uppercase tracking-[0.08em]">TOTAL AMOUNT ALL CONTEYNERS</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold">Категория</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold">Описание</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold">Цена продажи USD</th>
              <th className="border-b-2 border-r border-slate-400 px-3 py-4 text-center text-[15px] font-semibold">Вкл</th>
              <th className="border-b-2 border-slate-400 px-3 py-4 text-center text-[15px] font-semibold">Удалить</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const metrics = getRowMetrics(row);
              return (
              <tr key={row.key} className="align-top text-slate-800">
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.factoryName}
                    onChange={(event) => updateRow(row.key, { factoryName: event.target.value })}
                    placeholder="Завод / SKU"
                    className="w-52 rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.localName}
                    onChange={(event) => updateRow(row.key, { localName: event.target.value })}
                    placeholder="Название у нас"
                    className="w-60 rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <label className="flex w-32 cursor-pointer items-center justify-center rounded border border-dashed border-[var(--border)] px-2 py-2 text-xs text-slate-600 hover:bg-slate-50">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        updateRow(row.key, { imageFile: file });
                      }}
                    />
                    {row.imageFile ? row.imageFile.name : "Выбрать фото"}
                  </label>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.priceCNY}
                    onChange={(event) => updateRow(row.key, { priceCNY: event.target.value })}
                    type="number"
                    min={0}
                    step="0.0001"
                    className="w-32 rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.size}
                    onChange={(event) => updateRow(row.key, { size: event.target.value })}
                    className="w-40 rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.color}
                    onChange={(event) => updateRow(row.key, { color: event.target.value })}
                    className="w-40 rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.quantity}
                    onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                    type="number"
                    min={0}
                    step="1"
                    className="w-28 rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.totalAmountCNY}
                    onChange={(event) => updateRow(row.key, { totalAmountCNY: event.target.value })}
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-36 rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.cbm}
                    onChange={(event) => updateRow(row.key, { cbm: event.target.value })}
                    type="number"
                    min={0}
                    step="0.0001"
                    className="w-28 rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.kg}
                    onChange={(event) => updateRow(row.key, { kg: event.target.value })}
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-28 rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.totalCbm}
                    onChange={(event) => updateRow(row.key, { totalCbm: event.target.value })}
                    type="number"
                    min={0}
                    step="0.0001"
                    className="w-32 rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.netWorthKgs}
                    onChange={(event) => updateRow(row.key, { netWorthKgs: event.target.value })}
                    type="number"
                    min={0}
                    step="0.001"
                    className="w-32 rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.exchangeRate}
                    onChange={(event) => updateRow(row.key, { exchangeRate: event.target.value })}
                    type="number"
                    min={0}
                    step="0.0001"
                    className="w-28 rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 bg-slate-50 px-3 py-2 text-center font-medium text-slate-700">
                  {formatValue(metrics.unitUsd)}
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.totalAmountUSD}
                    onChange={(event) => updateRow(row.key, { totalAmountUSD: event.target.value })}
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-36 rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 bg-white px-3 py-2 text-center font-medium text-slate-700">
                  {formatValue(metrics.averagePercent)}
                  {metrics.averagePercent > 0 && activeCostingRuleMode === COSTING_RULE_MODES.LEGACY ? "%" : ""}
                </td>
                <td className="border-b border-r border-slate-300 bg-white px-3 py-2 text-center font-medium text-slate-700">
                  {formatValue(metrics.logisticsAverage)}
                </td>
                <td className="border-b border-r border-slate-300 bg-white px-3 py-2 text-center font-medium text-slate-700">
                  {formatValue(metrics.birDonasi)}
                </td>
                <td className="border-b border-r border-slate-300 bg-white px-3 py-2 text-center font-medium text-slate-700">
                  {formatValue(metrics.jami)}
                </td>
                <td className="border-b border-r border-slate-300 bg-white px-3 py-2 text-center font-medium text-slate-700">
                  {formatValue(metrics.transportUnit)}
                </td>
                <td className="border-b border-r border-slate-300 bg-white px-3 py-2 text-center font-medium text-slate-700">
                  {formatValue(metrics.transportTotal)}
                </td>
                <td className="border-b border-r border-slate-300 bg-white px-3 py-2 text-center font-medium text-slate-700">
                  {formatValue(metrics.customsUnit)}
                </td>
                <td className="border-b border-r border-slate-300 bg-white px-3 py-2 text-center font-medium text-slate-700">
                  {formatValue(metrics.customsTotal)}
                </td>
                <td className="border-b border-r border-slate-300 bg-white px-3 py-2 text-center font-medium text-slate-700">
                  {formatValue(metrics.finalUnitTotal)}
                </td>
                <td className="border-b border-r border-slate-300 bg-white px-3 py-2 text-center font-medium text-slate-700">
                  {formatValue(metrics.finalGrandTotal)}
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <select
                    value={row.categoryId}
                    onChange={(event) => updateRow(row.key, { categoryId: event.target.value })}
                    className="w-48 rounded border border-[var(--border)] bg-white px-2 py-2"
                  >
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <textarea
                    value={row.description}
                    onChange={(event) => updateRow(row.key, { description: event.target.value })}
                    placeholder="Описание"
                    className="min-h-24 w-80 rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    value={row.salePriceUSD}
                    onChange={(event) => updateRow(row.key, { salePriceUSD: event.target.value })}
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-32 rounded border border-[var(--border)] px-2 py-2"
                  />
                </td>
                <td className="border-b border-r border-slate-300 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(event) => updateRow(row.key, { include: event.target.checked })}
                  />
                </td>
                <td className="border-b border-slate-300 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="rounded border border-rose-300 px-2 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                  >
                    X
                  </button>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      <div className="overflow-auto rounded-xl border border-slate-400">
        <div className="grid min-w-[980px] grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr] text-center text-sm text-slate-800">
          <div className="border-b-2 border-r border-slate-400 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]">PRODUCTS</div>
          <div className="border-b-2 border-r border-slate-400 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]">SETS</div>
          <div className="border-b-2 border-r border-slate-400 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]">RMB</div>
          <div className="border-b-2 border-r border-slate-400 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]">USD</div>
          <div className="border-b-2 border-r border-slate-400 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]">TOTAL CBM</div>
          <div className="border-b-2 border-slate-400 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]">TOTAL N.W. KGS</div>

          <div className="border-r border-slate-300 px-3 py-4 text-2xl font-semibold">{totals.products}</div>
          <div className="border-r border-slate-300 px-3 py-4 text-2xl font-semibold">{totals.quantity}</div>
          <div className="border-r border-slate-300 px-3 py-4 text-2xl font-semibold">{totals.totalAmountCNY.toFixed(2)}</div>
          <div className="border-r border-slate-300 px-3 py-4 text-2xl font-semibold">{totals.totalAmountUSD.toFixed(2)}</div>
          <div className="border-r border-slate-300 px-3 py-4 text-2xl font-semibold">{totals.totalCbm.toFixed(4)}</div>
          <div className="px-3 py-4 text-2xl font-semibold">{totals.netWorthKgs.toFixed(3)}</div>
        </div>
      </div>
    </article>
  );
}
