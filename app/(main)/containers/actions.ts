"use server";

import { ContainerStatus } from "@prisma/client";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/lib/auth";
import { recalculateContainerFinancials } from "@/lib/container-finance";
import { recalculateContainerUnitCost } from "@/lib/container-cost";
import { toNumber } from "@/lib/currency";
import { recalculateContainerInvestmentShares } from "@/lib/investor";
import { prisma } from "@/lib/prisma";
import { CONTAINERS_MANAGE_ROLES } from "@/lib/rbac";

export type CreateContainerFormState = {
  error: string | null;
  success: boolean;
};

export type ImportContainerFormState = {
  error: string | null;
  success: boolean;
  warnings: string[];
  containerId: string | null;
  unknownSkus?: string[];
  missingInvestors?: string[];
};

export type PreviewImportContainerFormState = {
  error: string | null;
  success: boolean;
  warnings: string[];
  preview: null | {
    containerName: string;
    purchaseDateISO: string;
    arrivalDateISO: string | null;
    exchangeRate: number;
    totalPurchaseCNY: number;
    totalPurchaseUSD: number;
    items: Array<{
      sku: string;
      productId: string;
      productName: string;
      quantity: number;
      unitPriceUSD: number | null;
      lineTotalUSD: number | null;
      sizeLabel: string | null;
      color: string | null;
      cbm: number | null;
      kg: number | null;
      totalCbm: number | null;
    }>;
    expenses: Array<{ title: string; category: string; amountUSD: number; description: string | null }>;
    investments: Array<{ investorName: string; investedAmountUSD: number; percentageShare: number; isManualShare: boolean }>;
  };
  unknownSkus?: string[];
  missingInvestors?: string[];
};

type ImportOverridesPayload = {
  // If present, server action will use these rows instead of the parsed Excel rows.
  items?: Array<{
    sku: string;
    productId: string;
    quantity: number;
    unitPriceUSD: number | null;
    lineTotalUSD: number | null;
    sizeLabel: string | null;
    color: string | null;
    cbm: number | null;
    kg: number | null;
    totalCbm: number | null;
  }>;
  expenses?: Array<{
    title: string;
    category: "LOGISTICS" | "CUSTOMS" | "STORAGE" | "TRANSPORT" | "OTHER";
    amountUSD: number;
    description: string | null;
  }>;
  investments?: Array<{ investorName: string; investedAmountUSD: number; percentageShare: number; isManualShare: boolean }>;
};

export type QuickCreateProductsFormState = {
  error: string | null;
  success: boolean;
  createdCount: number;
};

export type QuickCreateInvestorsFormState = {
  error: string | null;
  success: boolean;
  createdCount: number;
};

function requireContainerManageRole(role: string) {
  if (!CONTAINERS_MANAGE_ROLES.includes(role as (typeof CONTAINERS_MANAGE_ROLES)[number])) {
    throw new Error("Недостаточно прав для изменения контейнера.");
  }
}

function resolveItemPurchaseUSD(input: {
  quantity: number;
  unitPriceUSD?: number;
  lineTotalUSD?: number;
}) {
  const lineTotal = Number(input.lineTotalUSD);
  if (Number.isFinite(lineTotal) && lineTotal > 0) return lineTotal;
  const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
  const unitPrice = Number(input.unitPriceUSD);
  if (quantity > 0 && Number.isFinite(unitPrice) && unitPrice > 0) return quantity * unitPrice;
  return 0;
}

function normalizeCellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.text === "string") return v.text;
    if (Array.isArray(v.richText)) {
      return v.richText
        .map((x) => {
          if (!x || typeof x !== "object") return "";
          const rt = x as Record<string, unknown>;
          return typeof rt.text === "string" ? rt.text : "";
        })
        .join("");
    }
    if (typeof v.formula === "string") {
      const result = v.result;
      if (typeof result === "number") return String(result);
      if (typeof result === "string") return result;
      return "";
    }
    if (typeof v.result === "number") return String(v.result);
  }

  return String(value);
}

function normalizeCellNumber(value: unknown): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value.trim().replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.result === "number") return v.result;
    if (typeof v.result === "string") return normalizeCellNumber(v.result);
    if (typeof v.text === "string") return normalizeCellNumber(v.text);
  }
  return NaN;
}

function parseExcelDateFromText(text: string): Date | null {
  const m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createContainerAction(
  _prevState: CreateContainerFormState,
  formData: FormData,
): Promise<CreateContainerFormState> {
  try {
    const session = await getRequiredSession();
    requireContainerManageRole(session.role);
    const name = String(formData.get("name") ?? "").trim();
    const purchaseDateRaw = String(formData.get("purchaseDate") ?? "").trim();
    const arrivalDateRaw = String(formData.get("arrivalDate") ?? "").trim();
    const totalPurchaseCNY = toNumber(formData.get("totalPurchaseCNY"));
    const exchangeRateRaw = String(formData.get("exchangeRate") ?? "").trim();
    const investmentsJson = String(formData.get("investmentsJson") ?? "[]");
    const containerItemsJson = String(formData.get("containerItemsJson") ?? "[]");
    const expensesJson = String(formData.get("expensesJson") ?? "[]");

    if (!name) {
      return { error: "Введите название контейнера.", success: false };
    }
    if (!purchaseDateRaw) {
      return { error: "Выберите дату закупки.", success: false };
    }
    const parsedPurchaseDate = new Date(purchaseDateRaw);
    if (Number.isNaN(parsedPurchaseDate.getTime())) {
      return { error: "Некорректная дата закупки.", success: false };
    }
    const parsedArrivalDate = arrivalDateRaw ? new Date(arrivalDateRaw) : null;
    if (parsedArrivalDate && Number.isNaN(parsedArrivalDate.getTime())) {
      return { error: "Некорректная дата прибытия.", success: false };
    }
    if (!Number.isFinite(totalPurchaseCNY) || totalPurchaseCNY <= 0) {
      return { error: "Введите сумму закупки в CNY больше 0.", success: false };
    }
    const latestCurrency = await prisma.currencySetting.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const exchangeRate =
      exchangeRateRaw.length > 0 ? toNumber(exchangeRateRaw) : (latestCurrency?.cnyToUsdRate ?? NaN);

    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      return { error: "Неверный курс CNY → USD.", success: false };
    }

    const baseTotalPurchaseUSD = totalPurchaseCNY * exchangeRate;

    type InvestmentInput = { investorId: string; investedAmountUSD: number; percentageShare?: number };
    type ContainerItemInput = {
      productId: string;
      sizeLabel?: string;
      color?: string;
      quantity: number;
      unitPriceUSD?: number;
      lineTotalUSD?: number;
      salePriceUSD?: number;
      cbm?: number;
      kg?: number;
      totalCbm?: number;
    };
    type ContainerExpenseInput = {
      title: string;
      category: "LOGISTICS" | "CUSTOMS" | "STORAGE" | "TRANSPORT" | "OTHER";
      amountUSD: number;
      description?: string;
    };

    let investmentsInput: InvestmentInput[] = [];
    try {
      investmentsInput = JSON.parse(investmentsJson) as InvestmentInput[];
    } catch {
      investmentsInput = [];
    }
    let containerItemsInput: ContainerItemInput[] = [];
    try {
      containerItemsInput = JSON.parse(containerItemsJson) as ContainerItemInput[];
    } catch {
      containerItemsInput = [];
    }
    let expensesInput: ContainerExpenseInput[] = [];
    try {
      expensesInput = JSON.parse(expensesJson) as ContainerExpenseInput[];
    } catch {
      expensesInput = [];
    }

    const cleanedInvestments = investmentsInput
      .map((row) => {
        const percentageShare = Number(row.percentageShare);
        return {
          investorId: row.investorId,
          investedAmountUSD: Number(row.investedAmountUSD),
          percentageShare: Number.isFinite(percentageShare) && percentageShare > 0 ? percentageShare : 0,
        };
      })
      .filter((row) => row.investorId && Number.isFinite(row.investedAmountUSD) && row.investedAmountUSD > 0);
    const rawItems = containerItemsInput.filter(
      (row) =>
        row.productId &&
        Number.isFinite(row.quantity) &&
        Math.floor(row.quantity) > 0,
    );
    const itemsByProduct = new Map<string, ContainerItemInput>();
    for (const row of rawItems) {
      const key = row.productId;
      const existing = itemsByProduct.get(key);
      if (!existing) {
        itemsByProduct.set(key, {
          ...row,
          quantity: Math.floor(row.quantity),
        });
        continue;
      }
      existing.quantity = Math.floor(existing.quantity) + Math.floor(row.quantity);
      if (!existing.sizeLabel && row.sizeLabel) existing.sizeLabel = row.sizeLabel;
      if (!existing.color && row.color) existing.color = row.color;
      if (!existing.unitPriceUSD && row.unitPriceUSD) existing.unitPriceUSD = row.unitPriceUSD;
      if (!existing.salePriceUSD && row.salePriceUSD) existing.salePriceUSD = row.salePriceUSD;
      if (!existing.lineTotalUSD && row.lineTotalUSD) existing.lineTotalUSD = row.lineTotalUSD;
      if (!existing.cbm && row.cbm) existing.cbm = row.cbm;
      if (!existing.kg && row.kg) existing.kg = row.kg;
      if (!existing.totalCbm && row.totalCbm) existing.totalCbm = row.totalCbm;
    }
    const cleanedItems = [...itemsByProduct.values()];
    const itemsPurchaseUSD = cleanedItems.reduce(
      (sum, row) => sum + resolveItemPurchaseUSD(row),
      0,
    );
    const totalPurchaseUSD = Math.max(baseTotalPurchaseUSD, itemsPurchaseUSD);

    const cleanedExpenses = expensesInput
      .map((row) => ({
        title: String(row.title ?? "").trim(),
        category: String(row.category ?? "OTHER").trim() as ContainerExpenseInput["category"],
        amountUSD: Number(row.amountUSD),
        description: String(row.description ?? "").trim(),
      }))
      .filter((row) => row.title && Number.isFinite(row.amountUSD) && row.amountUSD > 0);

    await prisma.$transaction(async (tx) => {
      const container = await tx.container.create({
        data: {
          name,
          purchaseDate: parsedPurchaseDate,
          totalPurchaseCNY: exchangeRate > 0 ? totalPurchaseUSD / exchangeRate : totalPurchaseCNY,
          exchangeRate,
          totalPurchaseUSD,
          totalExpensesUSD: 0,
          status: ContainerStatus.IN_TRANSIT,
          arrivalDate: parsedArrivalDate,
        },
      });
      if (cleanedInvestments.length > 0) {
        await tx.containerInvestment.createMany({
          data: cleanedInvestments.map((row) => ({
            containerId: container.id,
            investorId: row.investorId,
            investedAmountUSD: row.investedAmountUSD,
            percentageShare: Number.isFinite(row.percentageShare) ? row.percentageShare : 0,
            isManualShare: Number.isFinite(row.percentageShare) && row.percentageShare > 0,
          })),
        });
        await recalculateContainerInvestmentShares(container.id, tx);
      }

      if (cleanedItems.length > 0) {
        await tx.containerItem.createMany({
          data: cleanedItems.map((row) => ({
            containerId: container.id,
            productId: row.productId,
            sizeLabel: String(row.sizeLabel ?? "").trim() || null,
            color: String(row.color ?? "").trim() || null,
            quantity: Math.floor(row.quantity),
            unitPriceUSD:
              Number.isFinite(row.unitPriceUSD) && (row.unitPriceUSD as number) >= 0
                ? Number(row.unitPriceUSD)
                : null,
            salePriceUSD:
              Number.isFinite(row.salePriceUSD) && (row.salePriceUSD as number) >= 0
                ? Number(row.salePriceUSD)
                : null,
            lineTotalUSD:
              Number.isFinite(row.lineTotalUSD) && (row.lineTotalUSD as number) >= 0
                ? Number(row.lineTotalUSD)
                : null,
            cbm: Number.isFinite(row.cbm) && (row.cbm as number) >= 0 ? Number(row.cbm) : null,
            kg: Number.isFinite(row.kg) && (row.kg as number) >= 0 ? Number(row.kg) : null,
            totalCbm:
              Number.isFinite(row.totalCbm) && (row.totalCbm as number) >= 0
                ? Number(row.totalCbm)
                : null,
            costPerUnitUSD: 0,
          })),
        });
        await recalculateContainerUnitCost(container.id, tx);
      }

      if (cleanedExpenses.length > 0) {
        const period = await prisma.financialPeriod.findUnique({
          where: { month_year: { month: parsedPurchaseDate.getMonth() + 1, year: parsedPurchaseDate.getFullYear() } },
        });
        const periodId =
          period?.id ??
          (await tx.financialPeriod.create({
            data: { month: parsedPurchaseDate.getMonth() + 1, year: parsedPurchaseDate.getFullYear(), status: "OPEN" },
          })).id;

        await tx.containerExpense.createMany({
          data: cleanedExpenses.map((row) => ({
            containerId: container.id,
            title: row.title,
            category: row.category,
            amountUSD: row.amountUSD,
            description: row.description || null,
            financialPeriodId: periodId,
            createdById: session.userId,
          })),
        });
      }

      await recalculateContainerFinancials(container.id, tx);
    });

    revalidatePath("/containers");
    return { error: null, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось создать контейнер.";
    return { error: message, success: false };
  }
}

export async function importContainerFromExcelAction(
  _prevState: ImportContainerFormState,
  formData: FormData,
): Promise<ImportContainerFormState> {
  try {
    const session = await getRequiredSession();
    requireContainerManageRole(session.role);

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return {
        error: "Выберите Excel файл (.xlsx).",
        success: false,
        warnings: [],
        containerId: null,
        unknownSkus: [],
        missingInvestors: [],
      };
    }

    const nameOverride = String(formData.get("name") ?? "").trim();
    const arrivalDateRaw = String(formData.get("arrivalDate") ?? "").trim();
    const exchangeRateOverrideRaw = String(formData.get("exchangeRateOverride") ?? "").trim();
    const skipUnknown = String(formData.get("skipUnknown") ?? "").trim() === "1";
    const overridesJson = String(formData.get("overridesJson") ?? "").trim();
    let overrides: ImportOverridesPayload | null = null;
    if (overridesJson) {
      try {
        overrides = JSON.parse(overridesJson) as ImportOverridesPayload;
      } catch {
        overrides = null;
      }
    }
    const hasOverrides = Boolean(overrides?.items?.length || overrides?.expenses?.length || overrides?.investments?.length);

    // ExcelJS typing expects a non-generic Buffer; newer @types/node makes Buffer generic.
    // We cast through the actual load() parameter type to keep TS happy.
    const bytes = Buffer.from(await file.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as Parameters<(typeof wb)["xlsx"]["load"]>[0]);

    // Find the worksheet containing the goods table.
    let goodsSheet: ExcelJS.Worksheet | undefined;
    let headerRowIndex = 0;
    for (const ws of wb.worksheets) {
      for (let r = 1; r <= Math.min(ws.rowCount || 200, 60); r++) {
        const row = ws.getRow(r);
        const values = Array.isArray(row.values) ? row.values : [];
        const texts = values
          .slice(1)
          .map((v) => normalizeCellText(v).trim().toLowerCase())
          .filter(Boolean);
        if (texts.includes("model") && texts.some((t) => t.includes("unit price"))) {
          goodsSheet = ws;
          headerRowIndex = r;
          break;
        }
      }
      if (goodsSheet) break;
    }
    if (!goodsSheet || !headerRowIndex) {
      return {
        error: "Не нашёл таблицу товаров в Excel (строка с заголовками Model / UNIT PRICE).",
        success: false,
        warnings: [],
        containerId: null,
      };
    }

    // Map columns by header names.
    const headerRow = goodsSheet.getRow(headerRowIndex);
    const colIndex: Record<string, number> = {};
    headerRow.eachCell({ includeEmpty: false }, (cell, c) => {
      const t = normalizeCellText(cell.value).replace(/\s+/g, " ").trim().toLowerCase();
      if (!t) return;
      if (t === "model") colIndex.model = c;
      if (t.includes("unit price")) colIndex.unitPrice = c;
      if (t.includes("saize") || t.includes("size")) colIndex.size = c;
      if (t.includes("product color") || t === "color") colIndex.color = c;
      if (t.includes("quantity")) colIndex.quantity = c;
      if (t === "cbm") colIndex.cbm = c;
      if (t === "kg") colIndex.kg = c;
      if (t.includes("total cbm")) colIndex.totalCbm = c;
      if (t.includes("n.w")) colIndex.nwKgs = c;
      if (t.includes("total amount")) {
        // first TOTAL AMOUNT column is enough
        if (!colIndex.totalAmount) colIndex.totalAmount = c;
      }
    });

    if (!colIndex.model || !colIndex.unitPrice || !colIndex.quantity) {
      return {
        error: "В Excel таблице товаров не хватает колонок Model / UNIT PRICE / QUANTITY.",
        success: false,
        warnings: [],
        containerId: null,
      };
    }

    const products = await prisma.product.findMany({ select: { id: true, sku: true } });
    const productBySku = new Map(products.map((p) => [p.sku.trim(), p.id]));

    const items: Array<{
      productId: string;
      sizeLabel?: string;
      color?: string;
      quantity: number;
      unitPriceUSD?: number;
      lineTotalUSD?: number;
      cbm?: number;
      kg?: number;
      totalCbm?: number;
    }> = [];
    const unknownSkus = new Set<string>();

    // Parse rows until a long empty tail.
    let emptyStreak = 0;
    for (let r = headerRowIndex + 1; r <= goodsSheet.rowCount; r++) {
      const row = goodsSheet.getRow(r);
      const model = normalizeCellText(row.getCell(colIndex.model).value).trim();
      const qty = normalizeCellNumber(row.getCell(colIndex.quantity).value);
      const unit = normalizeCellNumber(row.getCell(colIndex.unitPrice).value);

      const rowLooksEmpty = !model && !Number.isFinite(qty) && !Number.isFinite(unit);
      if (rowLooksEmpty) {
        emptyStreak++;
        if (emptyStreak >= 25) break;
        continue;
      }
      emptyStreak = 0;

      // Skip totals rows.
      if (model.toLowerCase().includes("total")) continue;

      const productId = model ? productBySku.get(model) ?? null : null;
      if (!productId) {
        if (model) unknownSkus.add(model);
        continue;
      }

      const quantity = Math.max(0, Math.floor(Number.isFinite(qty) ? qty : 0));
      if (!quantity) continue;

      const sizeLabel = colIndex.size ? normalizeCellText(row.getCell(colIndex.size).value).trim() : "";
      const color = colIndex.color ? normalizeCellText(row.getCell(colIndex.color).value).trim() : "";
      const cbm = colIndex.cbm ? normalizeCellNumber(row.getCell(colIndex.cbm).value) : NaN;
      const kg = colIndex.kg ? normalizeCellNumber(row.getCell(colIndex.kg).value) : NaN;
      const totalCbm = colIndex.totalCbm ? normalizeCellNumber(row.getCell(colIndex.totalCbm).value) : NaN;
      const totalAmount = colIndex.totalAmount ? normalizeCellNumber(row.getCell(colIndex.totalAmount).value) : NaN;

      items.push({
        productId,
        sizeLabel: sizeLabel || undefined,
        color: color || undefined,
        quantity,
        unitPriceUSD: Number.isFinite(unit) && unit > 0 ? unit : undefined,
        lineTotalUSD: Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : undefined,
        cbm: Number.isFinite(cbm) && cbm > 0 ? cbm : undefined,
        kg: Number.isFinite(kg) && kg > 0 ? kg : undefined,
        totalCbm:
          Number.isFinite(totalCbm) && totalCbm > 0
            ? totalCbm
            : Number.isFinite(cbm) && cbm > 0
              ? cbm * quantity
              : undefined,
      });
    }

    if (unknownSkus.size && !skipUnknown && !hasOverrides) {
      return {
        error:
          "В Excel есть товары, которых нет в базе (SKU). Можно добавить их или продолжить без них: " +
          Array.from(unknownSkus).slice(0, 40).join(", ") +
          (unknownSkus.size > 40 ? " …" : ""),
        success: false,
        warnings: [],
        containerId: null,
        unknownSkus: Array.from(unknownSkus),
        missingInvestors: [],
      };
    }
    if (!items.length && !hasOverrides) {
      return {
        error: "Не нашёл ни одной строки товара для импорта.",
        success: false,
        warnings: [],
        containerId: null,
        unknownSkus: [],
        missingInvestors: [],
      };
    }

    // Header values from template (TRUCK ALL-9 / OLDI BERDI)
    const warnings: string[] = [];

    let purchaseDate: Date | null = null;
    for (let r = 1; r <= Math.min(goodsSheet.rowCount, headerRowIndex); r++) {
      const row = goodsSheet.getRow(r);
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (purchaseDate) return;
        const t = normalizeCellText(cell.value);
        const d = parseExcelDateFromText(t);
        if (d) purchaseDate = d;
      });
      if (purchaseDate) break;
    }
    if (!purchaseDate) {
      purchaseDate = new Date();
      warnings.push("Не нашёл дату в Excel — поставил сегодняшнюю.");
    }
    const purchaseDateValue = purchaseDate ?? new Date();

    // Exchange rate: try to read from a row containing KURS (like 6.85 -> invert).
    let kursPerUsd: number | null = null;
    for (let r = headerRowIndex; r <= Math.min(goodsSheet.rowCount, headerRowIndex + 200); r++) {
      const row = goodsSheet.getRow(r);
      const cells = (Array.isArray(row.values) ? row.values : []).slice(1);
      const hasKurs = cells.some((v) => normalizeCellText(v).trim().toUpperCase() === "KURS");
      if (!hasKurs) continue;
      for (const v of cells) {
        const n = normalizeCellNumber(v);
        if (Number.isFinite(n) && n > 0.5 && n < 20) {
          kursPerUsd = n;
          break;
        }
      }
      if (kursPerUsd) break;
    }

    const latestCurrency = await prisma.currencySetting.findFirst({ orderBy: { updatedAt: "desc" } });
    const rateOverride = exchangeRateOverrideRaw ? toNumber(exchangeRateOverrideRaw) : NaN;
    let exchangeRate = Number.isFinite(rateOverride) && rateOverride > 0 ? rateOverride : NaN;
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      if (kursPerUsd && kursPerUsd > 0) exchangeRate = 1 / kursPerUsd;
    }
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      exchangeRate = latestCurrency?.cnyToUsdRate ?? NaN;
      if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
        return {
          error: "Не смог определить курс CNY → USD. Укажите его в поле override.",
          success: false,
          warnings,
          containerId: null,
        };
      }
      warnings.push("Курс взят из настроек (не найден в Excel).");
    }

    // TotalPurchaseCNY: try to read from a row containing TOTAL: and RMB total.
    let totalPurchaseCNY = NaN;
    for (let r = headerRowIndex; r <= Math.min(goodsSheet.rowCount, headerRowIndex + 250); r++) {
      const row = goodsSheet.getRow(r);
      const texts = (Array.isArray(row.values) ? row.values : [])
        .slice(1)
        .map((v) => normalizeCellText(v).trim().toUpperCase());
      if (!texts.some((t) => t.includes("TOTAL"))) continue;
      // Heuristic: choose the largest numeric in the row (usually RMB total).
      const nums = (Array.isArray(row.values) ? row.values : [])
        .slice(1)
        .map((v) => normalizeCellNumber(v))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (!nums.length) continue;
      const max = Math.max(...nums);
      if (max > 1000) {
        totalPurchaseCNY = max;
        break;
      }
    }
    if (!Number.isFinite(totalPurchaseCNY) || totalPurchaseCNY <= 0) {
      warnings.push("Не нашёл сумму закупки (CNY) в Excel — поставьте вручную после импорта.");
      totalPurchaseCNY = items.reduce((s, it) => s + resolveItemPurchaseUSD(it), 0) / exchangeRate;
    }

    const arrivalDate = arrivalDateRaw ? new Date(arrivalDateRaw) : null;
    if (arrivalDate && Number.isNaN(arrivalDate.getTime())) {
      return { error: "Некорректная дата прибытия.", success: false, warnings, containerId: null };
    }

    // Expenses & investments from template (can be overridden by the preview UI).
    let expenses: Array<{
      title: string;
      category: "LOGISTICS" | "CUSTOMS" | "STORAGE" | "TRANSPORT" | "OTHER";
      amountUSD: number;
      description?: string;
    }> = [];
    const oldi = wb.getWorksheet("OLDI BERDI-OSSO-9");
    let investmentsToImport: Array<{
      investorName: string;
      investedAmountUSD: number;
      percentageShare: number;
      isManualShare: boolean;
    }> = [];
    if (oldi) {
      const yolga = normalizeCellNumber(oldi.getCell("C4").value);
      const rast = normalizeCellNumber(oldi.getCell("D4").value);
      if (Number.isFinite(yolga) && yolga > 0) expenses.push({ title: "Доставка (YO'LGA)", category: "LOGISTICS", amountUSD: yolga });
      if (Number.isFinite(rast) && rast > 0) expenses.push({ title: "Растаможка", category: "CUSTOMS", amountUSD: rast });

      // Some templates keep "SKIDKA VA RASHODLAR" (discounts & expenses) in H4.
      const discountsAndExpenses = normalizeCellNumber(oldi.getCell("H4").value);
      if (Number.isFinite(discountsAndExpenses) && discountsAndExpenses > 0) {
        expenses.push({ title: "Скидки и прочие расходы", category: "OTHER", amountUSD: discountsAndExpenses });
      }

      // Investors: in the sample template, names are in row 7 starting from column B,
      // and the invested totals are in row 15 (BERILGAN). We rely on cached formula results when present.
      const investorNameRow = 7;
      const investedTotalRow = 15;
      let emptyNamesStreak = 0;
      for (let c = 2; c <= Math.min(oldi.columnCount || 30, 30); c++) {
        const name = normalizeCellText(oldi.getRow(investorNameRow).getCell(c).value).trim();
        if (!name) {
          emptyNamesStreak++;
          if (emptyNamesStreak >= 6) break;
          continue;
        }
        emptyNamesStreak = 0;

        const invested = normalizeCellNumber(oldi.getRow(investedTotalRow).getCell(c).value);
        if (Number.isFinite(invested) && invested > 0) {
          investmentsToImport.push({ investorName: name, investedAmountUSD: invested, percentageShare: 0, isManualShare: false });
        } else {
          warnings.push(`Инвестор «${name}» найден, но сумма вложений не найдена — пропущено.`);
        }
      }
    }
    if (!expenses.length) warnings.push("Расходы в Excel не найдены — импортировал только товары.");
    if (!investmentsToImport.length) warnings.push("Инвесторы в Excel не найдены — импортировал без инвестиций.");

    const containerName = nameOverride || file.name.replace(/\.xlsx$/i, "").trim() || "Контейнер";

    // Apply overrides from preview modal if provided.
    if (overrides?.items?.length) {
      items.length = 0;
      for (const row of overrides.items) {
        const quantity = Math.max(0, Math.floor(Number(row.quantity)));
        if (!quantity || !row.productId) continue;
        items.push({
          productId: row.productId,
          sizeLabel: row.sizeLabel ? String(row.sizeLabel).trim() : undefined,
          color: row.color ? String(row.color).trim() : undefined,
          quantity,
          unitPriceUSD: Number.isFinite(row.unitPriceUSD as number) && (row.unitPriceUSD as number) >= 0 ? Number(row.unitPriceUSD) : undefined,
          lineTotalUSD: Number.isFinite(row.lineTotalUSD as number) && (row.lineTotalUSD as number) >= 0 ? Number(row.lineTotalUSD) : undefined,
          cbm: Number.isFinite(row.cbm as number) && (row.cbm as number) >= 0 ? Number(row.cbm) : undefined,
          kg: Number.isFinite(row.kg as number) && (row.kg as number) >= 0 ? Number(row.kg) : undefined,
          totalCbm: Number.isFinite(row.totalCbm as number) && (row.totalCbm as number) >= 0 ? Number(row.totalCbm) : undefined,
        });
      }
    }
    if (overrides?.expenses?.length) {
      expenses = overrides.expenses
        .map((e) => ({
          title: String(e.title ?? "").trim(),
          category: e.category,
          amountUSD: Number(e.amountUSD),
          description: e.description ? String(e.description) : undefined,
        }))
        .filter((e) => e.title && Number.isFinite(e.amountUSD) && e.amountUSD >= 0);
    }
    if (overrides?.investments?.length) {
      investmentsToImport = overrides.investments
        .map((i) => {
          const percentageShare = Number(i.percentageShare);
          return {
            investorName: String(i.investorName ?? "").trim(),
            investedAmountUSD: Number(i.investedAmountUSD),
            percentageShare: Number.isFinite(percentageShare) && percentageShare > 0 ? percentageShare : 0,
            isManualShare: Boolean(i.isManualShare) && Number.isFinite(percentageShare) && percentageShare > 0,
          };
        })
        .filter((i) => i.investorName && Number.isFinite(i.investedAmountUSD) && i.investedAmountUSD > 0);
    }

    let createdContainerId: string | null = null;
    await prisma.$transaction(async (tx) => {
      const baseTotalPurchaseUSD = totalPurchaseCNY * exchangeRate;
      const itemsPurchaseUSD = items.reduce((sum, row) => sum + resolveItemPurchaseUSD(row), 0);
      const totalPurchaseUSD = Math.max(baseTotalPurchaseUSD, itemsPurchaseUSD);

      const container = await tx.container.create({
        data: {
          name: containerName,
          purchaseDate: purchaseDateValue,
          arrivalDate,
          totalPurchaseCNY,
          exchangeRate,
          totalPurchaseUSD,
          totalExpensesUSD: 0,
          status: ContainerStatus.IN_TRANSIT,
        },
      });
      createdContainerId = container.id;

      await tx.containerItem.createMany({
        data: items.map((row) => ({
          containerId: container.id,
          productId: row.productId,
          sizeLabel: row.sizeLabel ? String(row.sizeLabel).trim() : null,
          color: row.color ? String(row.color).trim() : null,
          quantity: Math.floor(row.quantity),
          unitPriceUSD:
            Number.isFinite(row.unitPriceUSD as number) && (row.unitPriceUSD as number) >= 0
              ? Number(row.unitPriceUSD)
              : null,
          lineTotalUSD:
            Number.isFinite(row.lineTotalUSD as number) && (row.lineTotalUSD as number) >= 0
              ? Number(row.lineTotalUSD)
              : null,
          cbm: Number.isFinite(row.cbm as number) && (row.cbm as number) >= 0 ? Number(row.cbm) : null,
          kg: Number.isFinite(row.kg as number) && (row.kg as number) >= 0 ? Number(row.kg) : null,
          totalCbm:
            Number.isFinite(row.totalCbm as number) && (row.totalCbm as number) >= 0
              ? Number(row.totalCbm)
              : null,
          costPerUnitUSD: 0,
        })),
      });

      if (expenses.length) {
        const period = await tx.financialPeriod.findUnique({
          where: {
            month_year: { month: purchaseDateValue.getUTCMonth() + 1, year: purchaseDateValue.getUTCFullYear() },
          },
        });
        const periodId =
          period?.id ??
          (await tx.financialPeriod.create({
            data: { month: purchaseDateValue.getUTCMonth() + 1, year: purchaseDateValue.getUTCFullYear(), status: "OPEN" },
          })).id;

        await tx.containerExpense.createMany({
          data: expenses.map((e) => ({
            containerId: container.id,
            title: e.title,
            category: e.category,
            amountUSD: e.amountUSD,
            description: e.description ? String(e.description) : null,
            financialPeriodId: periodId,
            createdById: session.userId,
          })),
        });
      }

      if (investmentsToImport.length) {
        const uniqueByName = new Map<string, { investedAmountUSD: number; percentageShare: number; isManualShare: boolean }>();
        for (const row of investmentsToImport) {
          const key = row.investorName.trim().toLowerCase();
          const existing = uniqueByName.get(key);
          const nextAmount = (existing?.investedAmountUSD ?? 0) + row.investedAmountUSD;
          const nextPct = (existing?.percentageShare ?? 0) + (row.isManualShare ? row.percentageShare : 0);
          uniqueByName.set(key, {
            investedAmountUSD: nextAmount,
            percentageShare: nextPct,
            isManualShare: nextPct > 0,
          });
        }

        const existingInvestors = await tx.investor.findMany({ select: { id: true, name: true } });
        const investorIdByLowerName = new Map(existingInvestors.map((inv) => [inv.name.trim().toLowerCase(), inv.id]));

        const investmentsData: Array<{ investorId: string; investedAmountUSD: number; percentageShare: number; isManualShare: boolean }> = [];
        for (const [nameKey, payload] of uniqueByName.entries()) {
          const originalName =
            investmentsToImport.find((x) => x.investorName.trim().toLowerCase() === nameKey)?.investorName ?? nameKey;

          const existingId = investorIdByLowerName.get(nameKey);
          const investorId =
            existingId ??
            (await tx.investor.create({
              data: { name: originalName },
              select: { id: true },
            })).id;

          investmentsData.push({
            investorId,
            investedAmountUSD: payload.investedAmountUSD,
            percentageShare: payload.isManualShare ? payload.percentageShare : 0,
            isManualShare: payload.isManualShare,
          });
        }

        await tx.containerInvestment.createMany({
          data: investmentsData.map((row) => ({
            containerId: container.id,
            investorId: row.investorId,
            investedAmountUSD: row.investedAmountUSD,
            percentageShare: Number.isFinite(row.percentageShare) ? row.percentageShare : 0,
            isManualShare: Boolean(row.isManualShare) && Number.isFinite(row.percentageShare) && row.percentageShare > 0,
          })),
        });
      }

      await recalculateContainerUnitCost(container.id, tx);
      await recalculateContainerFinancials(container.id, tx);
      if (investmentsToImport.length) {
        await recalculateContainerInvestmentShares(container.id, tx);
      }
    });

    revalidatePath("/containers");
    if (unknownSkus.size) warnings.push(`Пропущены товары (нет в базе): ${Array.from(unknownSkus).slice(0, 40).join(", ")}${unknownSkus.size > 40 ? " …" : ""}`);
    return {
      error: null,
      success: true,
      warnings,
      containerId: createdContainerId,
      unknownSkus: Array.from(unknownSkus),
      missingInvestors: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось импортировать контейнер.";
    return {
      error: message,
      success: false,
      warnings: [],
      containerId: null,
      unknownSkus: [],
      missingInvestors: [],
    };
  }
}

export async function previewContainerFromExcelAction(
  _prevState: PreviewImportContainerFormState,
  formData: FormData,
): Promise<PreviewImportContainerFormState> {
  try {
    const session = await getRequiredSession();
    requireContainerManageRole(session.role);

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return {
        error: "Выберите Excel файл (.xlsx).",
        success: false,
        warnings: [],
        preview: null,
        unknownSkus: [],
        missingInvestors: [],
      };
    }

    const nameOverride = String(formData.get("name") ?? "").trim();
    const arrivalDateRaw = String(formData.get("arrivalDate") ?? "").trim();
    const exchangeRateOverrideRaw = String(formData.get("exchangeRateOverride") ?? "").trim();

    const bytes = Buffer.from(await file.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as Parameters<(typeof wb)["xlsx"]["load"]>[0]);

    // Find the worksheet containing the goods table.
    let goodsSheet: ExcelJS.Worksheet | undefined;
    let headerRowIndex = 0;
    for (const ws of wb.worksheets) {
      for (let r = 1; r <= Math.min(ws.rowCount || 200, 60); r++) {
        const row = ws.getRow(r);
        const values = Array.isArray(row.values) ? row.values : [];
        const texts = values
          .slice(1)
          .map((v) => normalizeCellText(v).trim().toLowerCase())
          .filter(Boolean);
        if (texts.includes("model") && texts.some((t) => t.includes("unit price"))) {
          goodsSheet = ws;
          headerRowIndex = r;
          break;
        }
      }
      if (goodsSheet) break;
    }
    if (!goodsSheet || !headerRowIndex) {
      return {
        error: "Не нашёл таблицу товаров в Excel (строка с заголовками Model / UNIT PRICE).",
        success: false,
        warnings: [],
        preview: null,
      };
    }

    // Map columns by header names.
    const headerRow = goodsSheet.getRow(headerRowIndex);
    const colIndex: Record<string, number> = {};
    headerRow.eachCell({ includeEmpty: false }, (cell, c) => {
      const t = normalizeCellText(cell.value).replace(/\s+/g, " ").trim().toLowerCase();
      if (!t) return;
      if (t === "model") colIndex.model = c;
      if (t.includes("unit price")) colIndex.unitPrice = c;
      if (t.includes("saize") || t.includes("size")) colIndex.size = c;
      if (t.includes("product color") || t === "color") colIndex.color = c;
      if (t.includes("quantity")) colIndex.quantity = c;
      if (t === "cbm") colIndex.cbm = c;
      if (t === "kg") colIndex.kg = c;
      if (t.includes("total cbm")) colIndex.totalCbm = c;
      if (t.includes("total amount")) {
        if (!colIndex.totalAmount) colIndex.totalAmount = c;
      }
    });

    if (!colIndex.model || !colIndex.unitPrice || !colIndex.quantity) {
      return {
        error: "В Excel таблице товаров не хватает колонок Model / UNIT PRICE / QUANTITY.",
        success: false,
        warnings: [],
        preview: null,
      };
    }

    const products = await prisma.product.findMany({ select: { id: true, sku: true, name: true } });
    const productBySku = new Map(products.map((p) => [p.sku.trim(), p]));
    const productById = new Map(products.map((p) => [p.id, p]));

    const items: Array<{
      sku: string;
      productId: string;
      sizeLabel?: string;
      color?: string;
      quantity: number;
      unitPriceUSD?: number;
      lineTotalUSD?: number;
      cbm?: number;
      kg?: number;
      totalCbm?: number;
    }> = [];
    const unknownSkus = new Set<string>();

    // Parse rows until a long empty tail.
    let emptyStreak = 0;
    for (let r = headerRowIndex + 1; r <= goodsSheet.rowCount; r++) {
      const row = goodsSheet.getRow(r);
      const model = normalizeCellText(row.getCell(colIndex.model).value).trim();
      const qty = normalizeCellNumber(row.getCell(colIndex.quantity).value);
      const unit = normalizeCellNumber(row.getCell(colIndex.unitPrice).value);

      const rowLooksEmpty = !model && !Number.isFinite(qty) && !Number.isFinite(unit);
      if (rowLooksEmpty) {
        emptyStreak++;
        if (emptyStreak >= 25) break;
        continue;
      }
      emptyStreak = 0;

      if (model.toLowerCase().includes("total")) continue;

      const product = model ? productBySku.get(model) ?? null : null;
      if (!product) {
        if (model) unknownSkus.add(model);
        continue;
      }

      const quantity = Math.max(0, Math.floor(Number.isFinite(qty) ? qty : 0));
      if (!quantity) continue;

      const sizeLabel = colIndex.size ? normalizeCellText(row.getCell(colIndex.size).value).trim() : "";
      const color = colIndex.color ? normalizeCellText(row.getCell(colIndex.color).value).trim() : "";
      const cbm = colIndex.cbm ? normalizeCellNumber(row.getCell(colIndex.cbm).value) : NaN;
      const kg = colIndex.kg ? normalizeCellNumber(row.getCell(colIndex.kg).value) : NaN;
      const totalCbm = colIndex.totalCbm ? normalizeCellNumber(row.getCell(colIndex.totalCbm).value) : NaN;
      const totalAmount = colIndex.totalAmount ? normalizeCellNumber(row.getCell(colIndex.totalAmount).value) : NaN;

      items.push({
        sku: model,
        productId: product.id,
        sizeLabel: sizeLabel || undefined,
        color: color || undefined,
        quantity,
        unitPriceUSD: Number.isFinite(unit) && unit > 0 ? unit : undefined,
        lineTotalUSD: Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : undefined,
        cbm: Number.isFinite(cbm) && cbm > 0 ? cbm : undefined,
        kg: Number.isFinite(kg) && kg > 0 ? kg : undefined,
        totalCbm:
          Number.isFinite(totalCbm) && totalCbm > 0
            ? totalCbm
            : Number.isFinite(cbm) && cbm > 0
              ? cbm * quantity
              : undefined,
      });
    }

    if (unknownSkus.size) {
      return {
        error: null,
        success: false,
        warnings: [],
        preview: null,
        unknownSkus: Array.from(unknownSkus),
      };
    }
    if (!items.length) {
      return { error: "Не нашёл ни одной строки товара для импорта.", success: false, warnings: [], preview: null, unknownSkus: [] };
    }

    const warnings: string[] = [];

    let purchaseDate: Date | null = null;
    for (let r = 1; r <= Math.min(goodsSheet.rowCount, headerRowIndex); r++) {
      const row = goodsSheet.getRow(r);
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (purchaseDate) return;
        const t = normalizeCellText(cell.value);
        const d = parseExcelDateFromText(t);
        if (d) purchaseDate = d;
      });
      if (purchaseDate) break;
    }
    if (!purchaseDate) {
      purchaseDate = new Date();
      warnings.push("Не нашёл дату в Excel — поставил сегодняшнюю.");
    }
    const purchaseDateValue = purchaseDate ?? new Date();

    let kursPerUsd: number | null = null;
    for (let r = headerRowIndex; r <= Math.min(goodsSheet.rowCount, headerRowIndex + 200); r++) {
      const row = goodsSheet.getRow(r);
      const cells = (Array.isArray(row.values) ? row.values : []).slice(1);
      const hasKurs = cells.some((v) => normalizeCellText(v).trim().toUpperCase() === "KURS");
      if (!hasKurs) continue;
      for (const v of cells) {
        const n = normalizeCellNumber(v);
        if (Number.isFinite(n) && n > 0.5 && n < 20) {
          kursPerUsd = n;
          break;
        }
      }
      if (kursPerUsd) break;
    }

    const latestCurrency = await prisma.currencySetting.findFirst({ orderBy: { updatedAt: "desc" } });
    const rateOverride = exchangeRateOverrideRaw ? toNumber(exchangeRateOverrideRaw) : NaN;
    let exchangeRate = Number.isFinite(rateOverride) && rateOverride > 0 ? rateOverride : NaN;
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      if (kursPerUsd && kursPerUsd > 0) exchangeRate = 1 / kursPerUsd;
    }
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      exchangeRate = latestCurrency?.cnyToUsdRate ?? NaN;
      if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
        return { error: "Не смог определить курс CNY → USD. Укажите его в поле override.", success: false, warnings, preview: null, unknownSkus: [] };
      }
      warnings.push("Курс взят из настроек (не найден в Excel).");
    }

    let totalPurchaseCNY = NaN;
    for (let r = headerRowIndex; r <= Math.min(goodsSheet.rowCount, headerRowIndex + 250); r++) {
      const row = goodsSheet.getRow(r);
      const texts = (Array.isArray(row.values) ? row.values : [])
        .slice(1)
        .map((v) => normalizeCellText(v).trim().toUpperCase());
      if (!texts.some((t) => t.includes("TOTAL"))) continue;
      const nums = (Array.isArray(row.values) ? row.values : [])
        .slice(1)
        .map((v) => normalizeCellNumber(v))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (!nums.length) continue;
      const max = Math.max(...nums);
      if (max > 1000) {
        totalPurchaseCNY = max;
        break;
      }
    }
    if (!Number.isFinite(totalPurchaseCNY) || totalPurchaseCNY <= 0) {
      warnings.push("Не нашёл сумму закупки (CNY) в Excel — поставьте вручную после импорта.");
      totalPurchaseCNY = items.reduce((s, it) => s + resolveItemPurchaseUSD(it), 0) / exchangeRate;
    }

    const arrivalDate = arrivalDateRaw ? new Date(arrivalDateRaw) : null;
    if (arrivalDate && Number.isNaN(arrivalDate.getTime())) {
      return { error: "Некорректная дата прибытия.", success: false, warnings, preview: null, unknownSkus: [] };
    }

    const expenses: Array<{ title: string; category: string; amountUSD: number; description: string | null }> = [];
    const investments: Array<{ investorName: string; investedAmountUSD: number; percentageShare: number; isManualShare: boolean }> = [];
    const missingInvestors = new Set<string>();
    const oldi = wb.getWorksheet("OLDI BERDI-OSSO-9");
    if (oldi) {
      const yolga = normalizeCellNumber(oldi.getCell("C4").value);
      const rast = normalizeCellNumber(oldi.getCell("D4").value);
      if (Number.isFinite(yolga) && yolga > 0) expenses.push({ title: "Доставка (YO'LGA)", category: "LOGISTICS", amountUSD: yolga, description: null });
      if (Number.isFinite(rast) && rast > 0) expenses.push({ title: "Растаможка", category: "CUSTOMS", amountUSD: rast, description: null });
      const discountsAndExpenses = normalizeCellNumber(oldi.getCell("H4").value);
      if (Number.isFinite(discountsAndExpenses) && discountsAndExpenses > 0) {
        expenses.push({ title: "Скидки и прочие расходы", category: "OTHER", amountUSD: discountsAndExpenses, description: null });
      }

      const investorNameRow = 7;
      const investedTotalRow = 15;
      let emptyNamesStreak = 0;
      for (let c = 2; c <= Math.min(oldi.columnCount || 30, 30); c++) {
        const name = normalizeCellText(oldi.getRow(investorNameRow).getCell(c).value).trim();
        if (!name) {
          emptyNamesStreak++;
          if (emptyNamesStreak >= 6) break;
          continue;
        }
        emptyNamesStreak = 0;
        // Filter out template noise like "0" or purely numeric placeholders.
        if (/^\d+(\.\d+)?$/.test(name)) continue;

        const invested = normalizeCellNumber(oldi.getRow(investedTotalRow).getCell(c).value);
        const hasAmount = Number.isFinite(invested) && invested > 0;
        investments.push({ investorName: name, investedAmountUSD: hasAmount ? invested : 0, percentageShare: 0, isManualShare: false });
        if (!hasAmount) {
          warnings.push(`Инвестор «${name}» найден, но сумма вложений не найдена — заполните вручную.`);
          missingInvestors.add(name);
        }
      }
    }

    const containerName = nameOverride || file.name.replace(/\.xlsx$/i, "").trim() || "Контейнер";

    const baseTotalPurchaseUSD = totalPurchaseCNY * exchangeRate;
    const itemsPurchaseUSD = items.reduce((sum, row) => sum + resolveItemPurchaseUSD(row), 0);
    const totalPurchaseUSD = Math.max(baseTotalPurchaseUSD, itemsPurchaseUSD);

    return {
      error: null,
      success: true,
      warnings,
      preview: {
        containerName,
        purchaseDateISO: purchaseDateValue.toISOString(),
        arrivalDateISO: arrivalDate ? arrivalDate.toISOString() : null,
        exchangeRate,
        totalPurchaseCNY,
        totalPurchaseUSD,
        items: items.map((row) => {
          const p = productById.get(row.productId);
          return {
            sku: row.sku,
            productId: row.productId,
            productName: p?.name ?? row.sku,
            quantity: row.quantity,
            unitPriceUSD: Number.isFinite(row.unitPriceUSD as number) ? Number(row.unitPriceUSD) : null,
            lineTotalUSD: Number.isFinite(row.lineTotalUSD as number) ? Number(row.lineTotalUSD) : null,
            sizeLabel: row.sizeLabel ? String(row.sizeLabel) : null,
            color: row.color ? String(row.color) : null,
            cbm: Number.isFinite(row.cbm as number) ? Number(row.cbm) : null,
            kg: Number.isFinite(row.kg as number) ? Number(row.kg) : null,
            totalCbm: Number.isFinite(row.totalCbm as number) ? Number(row.totalCbm) : null,
          };
        }),
        expenses,
        investments,
      },
      unknownSkus: [],
      missingInvestors: Array.from(missingInvestors),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сделать предпросмотр.";
    return { error: message, success: false, warnings: [], preview: null, unknownSkus: [], missingInvestors: [] };
  }
}

export async function quickCreateProductsAction(
  _prevState: QuickCreateProductsFormState,
  formData: FormData,
): Promise<QuickCreateProductsFormState> {
  try {
    const session = await getRequiredSession();
    requireContainerManageRole(session.role);

    const rowsJson = String(formData.get("rowsJson") ?? "[]");
    let rows: Array<{ sku: string; name?: string; basePriceUSD?: number }>;
    try {
      rows = JSON.parse(rowsJson) as Array<{ sku: string; name?: string; basePriceUSD?: number }>;
      if (!Array.isArray(rows)) rows = [];
    } catch {
      rows = [];
    }
    const cleaned = rows
      .map((r) => ({
        sku: String(r.sku ?? "").trim(),
        name: String(r.name ?? "").trim(),
        basePriceUSD: Number(r.basePriceUSD ?? 0),
      }))
      .filter((r) => r.sku.length > 0);

    if (!cleaned.length) {
      return { error: "Нет товаров для добавления.", success: false, createdCount: 0 };
    }

    // Remove duplicates inside request.
    const bySku = new Map<string, { sku: string; name: string; basePriceUSD: number }>();
    for (const row of cleaned) {
      const skuKey = row.sku;
      if (!bySku.has(skuKey)) {
        bySku.set(skuKey, {
          sku: row.sku,
          name: row.name || row.sku,
          basePriceUSD: Number.isFinite(row.basePriceUSD) && row.basePriceUSD >= 0 ? row.basePriceUSD : 0,
        });
      }
    }

    const uniqueRows = Array.from(bySku.values());
    const existing = await prisma.product.findMany({
      where: { sku: { in: uniqueRows.map((r) => r.sku) } },
      select: { sku: true },
    });
    const existingSkus = new Set(existing.map((p) => p.sku.trim()));
    const toCreate = uniqueRows.filter((r) => !existingSkus.has(r.sku));

    if (toCreate.length) {
      await prisma.product.createMany({
        data: toCreate.map((r) => ({
          sku: r.sku,
          name: r.name,
          basePriceUSD: r.basePriceUSD,
        })),
      });
    }

    return { error: null, success: true, createdCount: toCreate.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось добавить товары.";
    return { error: message, success: false, createdCount: 0 };
  }
}

export async function quickCreateInvestorsAction(
  _prevState: QuickCreateInvestorsFormState,
  formData: FormData,
): Promise<QuickCreateInvestorsFormState> {
  try {
    const session = await getRequiredSession();
    requireContainerManageRole(session.role);

    const rowsJson = String(formData.get("rowsJson") ?? "[]");
    let rows: Array<{ name: string }>;
    try {
      rows = JSON.parse(rowsJson) as Array<{ name: string }>;
      if (!Array.isArray(rows)) rows = [];
    } catch {
      rows = [];
    }

    const names = rows
      .map((r) => String(r.name ?? "").trim())
      .filter((n) => n.length > 0);
    if (!names.length) {
      return { error: "Нет инвесторов для добавления.", success: false, createdCount: 0 };
    }

    const uniqueLower = new Map<string, string>();
    for (const name of names) {
      const key = name.toLowerCase();
      if (!uniqueLower.has(key)) uniqueLower.set(key, name);
    }
    const uniqueNames = Array.from(uniqueLower.values());

    const existing = await prisma.investor.findMany({ select: { id: true, name: true } });
    const existingLower = new Set(existing.map((i) => i.name.trim().toLowerCase()));
    const toCreate = uniqueNames.filter((n) => !existingLower.has(n.trim().toLowerCase()));

    if (toCreate.length) {
      await prisma.investor.createMany({ data: toCreate.map((name) => ({ name })) });
    }

    return { error: null, success: true, createdCount: toCreate.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось добавить инвесторов.";
    return { error: message, success: false, createdCount: 0 };
  }
}

export async function updateContainerStatusAction(formData: FormData) {
  const session = await getRequiredSession();
  requireContainerManageRole(session.role);

  const containerId = String(formData.get("containerId") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  const arrivalDateRaw = String(formData.get("arrivalDate") ?? "").trim();

  if (!containerId || !Object.values(ContainerStatus).includes(statusRaw as ContainerStatus)) {
    throw new Error("Некорректный запрос смены статуса.");
  }

  const status = statusRaw as ContainerStatus;

  await prisma.container.update({
    where: { id: containerId },
    data: {
      status,
      arrivalDate: status === ContainerStatus.ARRIVED && arrivalDateRaw ? new Date(arrivalDateRaw) : undefined,
    },
  });

  revalidatePath("/containers");
  revalidatePath(`/containers/${containerId}`);
}

export async function addContainerItemAction(formData: FormData) {
  const session = await getRequiredSession();
  requireContainerManageRole(session.role);

  const containerId = String(formData.get("containerId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const quantity = Math.floor(toNumber(formData.get("quantity")));
  const sizeLabelRaw = String(formData.get("sizeLabel") ?? "").trim();
  const colorRaw = String(formData.get("color") ?? "").trim();
  const unitPriceUSD = toNumber(formData.get("unitPriceUSD"));
  const salePriceUSD = toNumber(formData.get("salePriceUSD"));
  const lineTotalUSD = toNumber(formData.get("lineTotalUSD"));
  const cbm = toNumber(formData.get("cbm"));
  const kg = toNumber(formData.get("kg"));
  const totalCbm = toNumber(formData.get("totalCbm"));

  if (!containerId || !productId || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Проверьте товар и количество.");
  }

  const unitPriceValue = Number.isFinite(unitPriceUSD) && unitPriceUSD >= 0 ? unitPriceUSD : null;
  const salePriceValue = Number.isFinite(salePriceUSD) && salePriceUSD >= 0 ? salePriceUSD : null;
  const lineTotalValue = Number.isFinite(lineTotalUSD) && lineTotalUSD >= 0 ? lineTotalUSD : null;
  const cbmValue = Number.isFinite(cbm) && cbm >= 0 ? cbm : null;
  const kgValue = Number.isFinite(kg) && kg >= 0 ? kg : null;
  const totalCbmValue = Number.isFinite(totalCbm) && totalCbm >= 0 ? totalCbm : null;

  await prisma.$transaction(async (tx) => {
    const container = await tx.container.findUnique({
      where: { id: containerId },
      select: { status: true, totalPurchaseUSD: true, totalPurchaseCNY: true, exchangeRate: true },
    });

    if (!container) {
      throw new Error("Контейнер не найден.");
    }

    if (container.status === ContainerStatus.CLOSED) {
      throw new Error("Нельзя добавлять товары в закрытый контейнер.");
    }
    if (container.status === ContainerStatus.IN_TRANSIT) {
      throw new Error("Нельзя изменять товары контейнера со статусом «В пути».");
    }

    const existing = await tx.containerItem.findUnique({
      where: { containerId_productId: { containerId, productId } },
    });

    const addedPurchaseUSD = resolveItemPurchaseUSD({
      quantity,
      unitPriceUSD: unitPriceValue ?? undefined,
      lineTotalUSD: lineTotalValue ?? undefined,
    });

    if (existing) {
      await tx.containerItem.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + quantity,
          sizeLabel: sizeLabelRaw || existing.sizeLabel,
          color: colorRaw || existing.color,
          unitPriceUSD: unitPriceValue ?? existing.unitPriceUSD,
          salePriceUSD: salePriceValue ?? existing.salePriceUSD,
          lineTotalUSD:
            lineTotalValue !== null ? (existing.lineTotalUSD ?? 0) + lineTotalValue : existing.lineTotalUSD,
          cbm: cbmValue ?? existing.cbm,
          kg: kgValue ?? existing.kg,
          totalCbm:
            totalCbmValue !== null ? (existing.totalCbm ?? 0) + totalCbmValue : existing.totalCbm,
        },
      });
    } else {
      await tx.containerItem.create({
        data: {
          containerId,
          productId,
          sizeLabel: sizeLabelRaw || null,
          color: colorRaw || null,
          quantity,
          unitPriceUSD: unitPriceValue,
          salePriceUSD: salePriceValue,
          lineTotalUSD: lineTotalValue,
          cbm: cbmValue,
          kg: kgValue,
          totalCbm: totalCbmValue,
          costPerUnitUSD: 0,
        },
      });
    }

    if (addedPurchaseUSD > 0) {
      const nextPurchaseUSD = container.totalPurchaseUSD + addedPurchaseUSD;
      const nextPurchaseCNY =
        container.exchangeRate > 0 ? nextPurchaseUSD / container.exchangeRate : container.totalPurchaseCNY;
      await tx.container.update({
        where: { id: containerId },
        data: {
          totalPurchaseUSD: nextPurchaseUSD,
          totalPurchaseCNY: nextPurchaseCNY,
        },
      });
    }

    await recalculateContainerUnitCost(containerId, tx);
    await recalculateContainerFinancials(containerId, tx);
  });

  revalidatePath("/containers");
  revalidatePath(`/containers/${containerId}`);
}
