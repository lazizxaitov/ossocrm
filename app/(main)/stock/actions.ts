"use server";

import { ContainerStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/lib/auth";
import { recalculateContainerFinancials } from "@/lib/container-finance";
import { recalculateContainerUnitCost } from "@/lib/container-cost";
import { toNumber } from "@/lib/currency";
import { prisma } from "@/lib/prisma";

const MANUAL_STOCK_CONTAINER_NAME = "Вне контейнера (ручное добавление)";

export type AddStockOutsideContainerState = {
  error: string | null;
  success: string | null;
};

export type ManageStockItemState = {
  error: string | null;
  success: string | null;
};

type ManualStockItemInput = {
  productId: string;
  quantity: number;
  sizeLabel?: string;
  color?: string;
  unitPriceUSD?: number;
  salePriceUSD?: number;
  lineTotalUSD?: number;
  cbm?: number;
  kg?: number;
  totalCbm?: number;
};

export async function addStockOutsideContainerAction(
  _prevState: AddStockOutsideContainerState,
  formData: FormData,
): Promise<AddStockOutsideContainerState> {
  const session = await getRequiredSession();
  if (session.role !== "SUPER_ADMIN") {
    return { error: "Только SUPER_ADMIN может добавлять товар вне контейнера.", success: null };
  }

  const reason = String(formData.get("reason") ?? "").trim();
  const itemsJson = String(formData.get("itemsJson") ?? "").trim();

  let itemsInput: ManualStockItemInput[] = [];
  if (itemsJson) {
    try {
      itemsInput = JSON.parse(itemsJson) as ManualStockItemInput[];
    } catch {
      itemsInput = [];
    }
  } else {
    const productId = String(formData.get("productId") ?? "").trim();
    const quantity = Math.floor(toNumber(formData.get("quantity")));
    itemsInput = [
      {
        productId,
        quantity,
        sizeLabel: String(formData.get("sizeLabel") ?? "").trim() || undefined,
        color: String(formData.get("color") ?? "").trim() || undefined,
        unitPriceUSD: toNumber(formData.get("unitPriceUSD")) || undefined,
        salePriceUSD: toNumber(formData.get("salePriceUSD")) || undefined,
        lineTotalUSD: toNumber(formData.get("lineTotalUSD")) || undefined,
        cbm: toNumber(formData.get("cbm")) || undefined,
        kg: toNumber(formData.get("kg")) || undefined,
        totalCbm: toNumber(formData.get("totalCbm")) || undefined,
      },
    ];
  }

  const cleanedItems = itemsInput
    .map((row) => {
      const quantity = Math.floor(toNumber(row.quantity));
      const unitPriceValue = Number.isFinite(Number(row.unitPriceUSD)) && Number(row.unitPriceUSD) >= 0 ? Number(row.unitPriceUSD) : null;
      const lineTotalValue = Number.isFinite(Number(row.lineTotalUSD)) && Number(row.lineTotalUSD) >= 0 ? Number(row.lineTotalUSD) : null;
      const addedPurchaseUSD =
        lineTotalValue !== null && lineTotalValue > 0
          ? lineTotalValue
          : unitPriceValue !== null && unitPriceValue > 0
            ? unitPriceValue * quantity
            : 0;
      return {
        productId: String(row.productId ?? "").trim(),
        quantity,
        sizeLabel: String(row.sizeLabel ?? "").trim() || null,
        color: String(row.color ?? "").trim() || null,
        unitPriceUSD: unitPriceValue,
        salePriceUSD: Number.isFinite(Number(row.salePriceUSD)) && Number(row.salePriceUSD) >= 0 ? Number(row.salePriceUSD) : null,
        lineTotalUSD: lineTotalValue,
        cbm: Number.isFinite(Number(row.cbm)) && Number(row.cbm) >= 0 ? Number(row.cbm) : null,
        kg: Number.isFinite(Number(row.kg)) && Number(row.kg) >= 0 ? Number(row.kg) : null,
        totalCbm: Number.isFinite(Number(row.totalCbm)) && Number(row.totalCbm) >= 0 ? Number(row.totalCbm) : null,
        addedPurchaseUSD,
      };
    })
    .filter((row) => row.productId && row.quantity > 0);

  if (!cleanedItems.length) {
    return { error: "Добавьте хотя бы один товар и укажите количество.", success: null };
  }
  if (!reason) {
    return { error: "Комментарий обязателен.", success: null };
  }

  if (cleanedItems.some((row) => row.addedPurchaseUSD <= 0)) {
    return {
      error: "Для каждой позиции укажите себестоимость за ед. или сумму товара.",
      success: null,
    };
  }

  await prisma.$transaction(async (tx) => {
    let container = await tx.container.findFirst({
      where: { name: MANUAL_STOCK_CONTAINER_NAME, status: ContainerStatus.ARRIVED },
      orderBy: { createdAt: "asc" },
      select: { id: true, totalPurchaseUSD: true, exchangeRate: true, totalPurchaseCNY: true },
    });

    if (!container) {
      container = await tx.container.create({
        data: {
          name: MANUAL_STOCK_CONTAINER_NAME,
          purchaseDate: new Date(),
          arrivalDate: new Date(),
          status: ContainerStatus.ARRIVED,
          totalPurchaseCNY: 0,
          exchangeRate: 1,
          totalPurchaseUSD: 0,
          totalExpensesUSD: 0,
        },
        select: { id: true, totalPurchaseUSD: true, exchangeRate: true, totalPurchaseCNY: true },
      });
    }

    let totalAddedPurchaseUSD = 0;
    for (const item of cleanedItems) {
      const existing = await tx.containerItem.findUnique({
        where: { containerId_productId: { containerId: container.id, productId: item.productId } },
      });

      let containerItemId: string;
      if (existing) {
        const updated = await tx.containerItem.update({
          where: { id: existing.id },
          data: {
            quantity: existing.quantity + item.quantity,
            sizeLabel: item.sizeLabel ?? existing.sizeLabel,
            color: item.color ?? existing.color,
            unitPriceUSD: item.unitPriceUSD ?? existing.unitPriceUSD,
            salePriceUSD: item.salePriceUSD ?? existing.salePriceUSD,
            lineTotalUSD:
              item.lineTotalUSD !== null ? (existing.lineTotalUSD ?? 0) + item.lineTotalUSD : existing.lineTotalUSD,
            cbm: item.cbm ?? existing.cbm,
            kg: item.kg ?? existing.kg,
            totalCbm:
              item.totalCbm !== null ? (existing.totalCbm ?? 0) + item.totalCbm : existing.totalCbm,
          },
          select: { id: true },
        });
        containerItemId = updated.id;
      } else {
        const created = await tx.containerItem.create({
          data: {
            containerId: container.id,
            productId: item.productId,
            quantity: item.quantity,
            sizeLabel: item.sizeLabel,
            color: item.color,
            unitPriceUSD: item.unitPriceUSD,
            salePriceUSD: item.salePriceUSD,
            lineTotalUSD: item.lineTotalUSD,
            cbm: item.cbm,
            kg: item.kg,
            totalCbm: item.totalCbm,
            costPerUnitUSD: 0,
          },
          select: { id: true },
        });
        containerItemId = created.id;
      }

      await tx.manualStockEntry.create({
        data: {
          containerId: container.id,
          containerItemId,
          productId: item.productId,
          quantity: item.quantity,
          unitPriceUSD: item.unitPriceUSD,
          salePriceUSD: item.salePriceUSD,
          lineTotalUSD: item.addedPurchaseUSD,
          sizeLabel: item.sizeLabel,
          color: item.color,
          cbm: item.cbm,
          kg: item.kg,
          totalCbm: item.totalCbm,
          reason,
          createdById: session.userId,
        },
      });

      totalAddedPurchaseUSD += item.addedPurchaseUSD;
    }

    const nextPurchaseUSD = container.totalPurchaseUSD + totalAddedPurchaseUSD;
    const nextPurchaseCNY =
      container.exchangeRate > 0 ? nextPurchaseUSD / container.exchangeRate : container.totalPurchaseCNY;

    await tx.container.update({
      where: { id: container.id },
      data: {
        totalPurchaseUSD: nextPurchaseUSD,
        totalPurchaseCNY: nextPurchaseCNY,
      },
    });

    await recalculateContainerUnitCost(container.id, tx);
    await recalculateContainerFinancials(container.id, tx);
  });

  revalidatePath("/stock");
  revalidatePath("/warehouse");
  revalidatePath("/containers");
  return { error: null, success: "Товары добавлены в склад вне контейнера." };
}

export async function updateStockItemAction(
  _prevState: ManageStockItemState,
  formData: FormData,
): Promise<ManageStockItemState> {
  const session = await getRequiredSession();
  if (session.role !== "SUPER_ADMIN") {
    return { error: "Только SUPER_ADMIN может изменять позиции склада.", success: null };
  }

  const id = String(formData.get("id") ?? "").trim();
  const quantity = Math.floor(toNumber(formData.get("quantity")));
  const salePriceRaw = toNumber(formData.get("salePriceUSD"));
  const salePriceUSD = Number.isFinite(salePriceRaw) && salePriceRaw >= 0 ? salePriceRaw : null;

  if (!id) {
    return { error: "Не найдена позиция для изменения.", success: null };
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { error: "Количество должно быть 0 или больше.", success: null };
  }

  const existing = await prisma.containerItem.findUnique({
    where: { id },
    select: { id: true, containerId: true },
  });
  if (!existing) {
    return { error: "Позиция не найдена.", success: null };
  }

  await prisma.containerItem.update({
    where: { id },
    data: {
      quantity,
      salePriceUSD,
    },
  });

  await recalculateContainerFinancials(existing.containerId);

  revalidatePath("/stock");
  revalidatePath("/warehouse");
  revalidatePath("/containers");
  revalidatePath("/sales");
  return { error: null, success: "Позиция склада обновлена." };
}

export async function deleteStockItemAction(
  _prevState: ManageStockItemState,
  formData: FormData,
): Promise<ManageStockItemState> {
  const session = await getRequiredSession();
  if (session.role !== "SUPER_ADMIN") {
    return { error: "Только SUPER_ADMIN может удалять позиции склада.", success: null };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Не найдена позиция для удаления.", success: null };
  }

  const existing = await prisma.containerItem.findUnique({
    where: { id },
    select: { id: true, containerId: true },
  });
  if (!existing) {
    return { error: "Позиция не найдена.", success: null };
  }

  const [saleLinks, inventoryLinks] = await Promise.all([
    prisma.saleItem.findMany({
      where: { containerItemId: id },
      select: {
        sale: {
          select: {
            invoiceNumber: true,
          },
        },
      },
      take: 5,
    }),
    prisma.inventorySessionItem.findMany({
      where: { containerItemId: id },
      select: {
        inventorySession: {
          select: {
            code: true,
            title: true,
          },
        },
      },
      take: 5,
    }),
  ]);

  if (saleLinks.length > 0 || inventoryLinks.length > 0) {
    const saleInfo = saleLinks
      .map((row) => row.sale.invoiceNumber)
      .filter(Boolean)
      .join(", ");
    const inventoryInfo = inventoryLinks
      .map((row) => `${row.inventorySession.code}${row.inventorySession.title ? ` (${row.inventorySession.title})` : ""}`)
      .join(", ");

    const parts: string[] = [];
    if (saleInfo) {
      parts.push(`Продажи: ${saleInfo}`);
    }
    if (inventoryInfo) {
      parts.push(`Инвентаризации: ${inventoryInfo}`);
    }

    return {
      error: `Нельзя удалить позицию. Связи: ${parts.join(" | ")}. Используйте количество = 0 через «Изменить».`,
      success: null,
    };
  }

  await prisma.containerItem.delete({
    where: { id },
  });

  await recalculateContainerFinancials(existing.containerId);

  revalidatePath("/stock");
  revalidatePath("/warehouse");
  revalidatePath("/containers");
  revalidatePath("/sales");
  return { error: null, success: "Позиция склада удалена." };
}
