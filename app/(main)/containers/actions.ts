"use server";

import { ContainerStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/lib/auth";
import { recalculateContainerFinancials } from "@/lib/container-finance";
import { recalculateContainerUnitCost } from "@/lib/container-cost";
import { toNumber } from "@/lib/currency";
import { assertOpenPeriodForDate } from "@/lib/financial-period";
import { recalculateContainerInvestmentShares } from "@/lib/investor";
import { prisma } from "@/lib/prisma";
import { CONTAINERS_MANAGE_ROLES } from "@/lib/rbac";

export type CreateContainerFormState = {
  error: string | null;
  success: boolean;
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
    const initialExpensesUSD = toNumber(formData.get("initialExpensesUSD"));
    const exchangeRateRaw = String(formData.get("exchangeRate") ?? "").trim();
    const investmentsJson = String(formData.get("investmentsJson") ?? "[]");
    const containerItemsJson = String(formData.get("containerItemsJson") ?? "[]");

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
    if (!Number.isFinite(initialExpensesUSD) || initialExpensesUSD < 0) {
      return { error: "Введите корректную сумму расходов USD.", success: false };
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

    type InvestmentInput = { investorId: string; investedAmountUSD: number };
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

    const cleanedInvestments = investmentsInput.filter(
      (row) => row.investorId && Number.isFinite(row.investedAmountUSD) && row.investedAmountUSD > 0,
    );
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
    const initialExpensePeriod = initialExpensesUSD > 0 ? await assertOpenPeriodForDate(new Date()) : null;

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

      if (initialExpensesUSD > 0 && initialExpensePeriod) {
        await tx.containerExpense.create({
          data: {
            containerId: container.id,
            title: "Стартовый расход",
            category: "OTHER",
            amountUSD: initialExpensesUSD,
            description: "Расход добавлен при создании контейнера.",
            financialPeriodId: initialExpensePeriod.id,
            createdById: session.userId,
          },
        });
      }

      if (cleanedInvestments.length > 0) {
        await tx.containerInvestment.createMany({
          data: cleanedInvestments.map((row) => ({
            containerId: container.id,
            investorId: row.investorId,
            investedAmountUSD: row.investedAmountUSD,
            percentageShare: 0,
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

      await recalculateContainerFinancials(container.id, tx);
    });

    revalidatePath("/containers");
    return { error: null, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось создать контейнер.";
    return { error: message, success: false };
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
