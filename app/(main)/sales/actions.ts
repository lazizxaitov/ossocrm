"use server";

import { SaleStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/lib/auth";
import { recalculateContainerFinancials } from "@/lib/container-finance";
import { nextDocumentNumber } from "@/lib/doc-number";
import { toNumber } from "@/lib/currency";
import { assertOpenPeriodById, assertOpenPeriodForDate } from "@/lib/financial-period";
import { prisma } from "@/lib/prisma";
import { SALES_MANAGE_ROLES } from "@/lib/rbac";

type SaleItemInput = {
  containerItemId: string;
  quantity: number;
  salePricePerUnitUSD: number;
};

type ReturnItemInput = {
  saleItemId: string;
  quantity: number;
};

function assertCanManage(role: string) {
  if (!SALES_MANAGE_ROLES.includes(role as (typeof SALES_MANAGE_ROLES)[number])) {
    throw new Error("РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ РґР»СЏ РІС‹РїРѕР»РЅРµРЅРёСЏ РѕРїРµСЂР°С†РёРё.");
  }
}

function computeSaleStatus(total: number, paid: number, debt: number, returnedFully = false) {
  if (returnedFully) return SaleStatus.RETURNED;
  if (debt <= 0) return SaleStatus.COMPLETED;
  if (paid > 0) return SaleStatus.PARTIALLY_PAID;
  return SaleStatus.DEBT;
}

export type CreateSaleState = {
  error: string | null;
  success: string | null;
};

export async function createSaleAction(
  _prevState: CreateSaleState,
  formData: FormData,
): Promise<CreateSaleState> {
  try {
    const session = await getRequiredSession();
    assertCanManage(session.role);

    const clientId = String(formData.get("clientId") ?? "").trim();
    const saleModeRaw = String(formData.get("saleMode") ?? "IMMEDIATE").trim().toUpperCase();
    const saleMode = ["IMMEDIATE", "DEBT", "CONSIGNMENT"].includes(saleModeRaw)
      ? (saleModeRaw as "IMMEDIATE" | "DEBT" | "CONSIGNMENT")
      : "IMMEDIATE";
    const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
    const paidNow = Math.max(0, toNumber(formData.get("paidNow")) || 0);
    const itemsJson = String(formData.get("itemsJson") ?? "[]");

    if (!clientId) {
      throw new Error("Выберите клиента.");
    }

    let itemsInput: SaleItemInput[];
    try {
      itemsInput = JSON.parse(itemsJson) as SaleItemInput[];
    } catch {
      throw new Error("Некорректные товары продажи.");
    }

    if (!Array.isArray(itemsInput) || itemsInput.length === 0) {
      throw new Error("Добавьте минимум один товар в продажу.");
    }

    for (const item of itemsInput) {
      if (!item.containerItemId || !Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new Error("Некорректное количество товара.");
      }
      if (!Number.isFinite(item.salePricePerUnitUSD) || item.salePricePerUnitUSD <= 0) {
        throw new Error("Некорректная цена продажи.");
      }
    }

    const createdSale = await prisma.$transaction(async (tx) => {
      const period = await assertOpenPeriodForDate(new Date());
      const client = await tx.client.findUnique({ where: { id: clientId } });
      if (!client) {
        throw new Error("Клиент не найден.");
      }

      const invoiceNumber = await nextDocumentNumber(tx, "INV");
      let totalAmountUSD = 0;

      const enriched: Array<{
        containerItemId: string;
        containerId: string;
        productId: string;
        quantity: number;
        costPerUnitUSD: number;
        salePricePerUnitUSD: number;
        totalUSD: number;
      }> = [];

      for (const item of itemsInput) {
        const containerItem = await tx.containerItem.findUnique({
          where: { id: item.containerItemId },
          include: { container: { select: { status: true } } },
        });
        if (!containerItem) {
          throw new Error("Позиция контейнера не найдена.");
        }
        if (containerItem.container.status !== "ARRIVED") {
          throw new Error("Продажа доступна только для товара из прибывшего контейнера.");
        }
        if (containerItem.quantity < item.quantity) {
          throw new Error("Нельзя продать больше, чем есть на складе.");
        }

        const totalUSD = item.quantity * item.salePricePerUnitUSD;
        totalAmountUSD += totalUSD;

        enriched.push({
          containerItemId: containerItem.id,
          containerId: containerItem.containerId,
          productId: containerItem.productId,
          quantity: item.quantity,
          costPerUnitUSD: containerItem.costPerUnitUSD,
          salePricePerUnitUSD: item.salePricePerUnitUSD,
          totalUSD,
        });
      }

      if (saleMode === "DEBT" || saleMode === "CONSIGNMENT") {
        if (!dueDateRaw) {
          throw new Error(saleMode === "DEBT" ? "Укажите срок оплаты." : "Укажите срок реализации.");
        }
      }
      if (saleMode === "IMMEDIATE" && paidNow <= 0) {
        throw new Error("Для оплаты сразу укажите сумму оплаты.");
      }
      if ((saleMode === "DEBT" || saleMode === "CONSIGNMENT") && client.creditLimitUSD > 0 && totalAmountUSD - paidNow > client.creditLimitUSD) {
        throw new Error("Превышен кредитный лимит клиента.");
      }

      let paidAmountUSD = Math.min(Math.max(0, paidNow), totalAmountUSD);
      let debtAmountUSD = Math.max(0, totalAmountUSD - paidAmountUSD);
      if (saleMode === "DEBT") {
        // Для продаж "В долг": что оплачено сейчас фиксируем как Payment,
        // а остаток обязательно записывается в долг по продаже.
        paidAmountUSD = Math.min(Math.max(0, paidNow), totalAmountUSD);
        debtAmountUSD = Math.max(0, totalAmountUSD - paidAmountUSD);
      }
      const status = computeSaleStatus(totalAmountUSD, paidAmountUSD, debtAmountUSD);

    const sale = await tx.sale.create({
      data: {
        invoiceNumber,
        clientId: client.id,
        totalAmountUSD,
        paidAmountUSD,
        debtAmountUSD,
        dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
        status,
        financialPeriodId: period.id,
        createdById: session.userId,
        items: {
          create: enriched.map((item) => ({
            productId: item.productId,
            containerItemId: item.containerItemId,
            quantity: item.quantity,
            costPerUnitUSD: item.costPerUnitUSD,
            salePricePerUnitUSD: item.salePricePerUnitUSD,
            totalUSD: item.totalUSD,
          })),
        },
      },
    });

      for (const item of enriched) {
        await tx.containerItem.update({
          where: { id: item.containerItemId },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      const affectedContainerIds = [...new Set(enriched.map((item) => item.containerId))];
      for (const containerId of affectedContainerIds) {
        await recalculateContainerFinancials(containerId, tx);
      }

      if (paidAmountUSD > 0) {
        await tx.payment.create({
          data: {
            saleId: sale.id,
            amountUSD: paidAmountUSD,
            paymentDate: new Date(),
            createdById: session.userId,
          },
        });
      }

      return sale;
    });

    revalidatePath("/sales");
    revalidatePath(`/sales/${createdSale.id}`);
    revalidatePath("/warehouse");
    return { error: null, success: "Продажа успешно сохранена." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Не удалось сохранить продажу.",
      success: null,
    };
  }
}

export async function addPaymentAction(formData: FormData) {
  const session = await getRequiredSession();
  assertCanManage(session.role);

  const saleId = String(formData.get("saleId") ?? "");
  const amountUSD = Math.max(0, toNumber(formData.get("amountUSD")) || 0);
  const paymentDateRaw = String(formData.get("paymentDate") ?? "").trim();

  if (!saleId || !Number.isFinite(amountUSD) || amountUSD <= 0) {
    throw new Error("РџСЂРѕРІРµСЂСЊС‚Рµ РґР°РЅРЅС‹Рµ РѕРїР»Р°С‚С‹.");
  }

  await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id: saleId } });
    if (!sale) {
      throw new Error("РџСЂРѕРґР°Р¶Р° РЅРµ РЅР°Р№РґРµРЅР°.");
    }
    await assertOpenPeriodById(sale.financialPeriodId);

    const remainingDebt = Math.max(0, sale.debtAmountUSD);
    const actualPayment = Math.min(remainingDebt, amountUSD);
    if (actualPayment <= 0) {
      throw new Error("РџРѕ РїСЂРѕРґР°Р¶Рµ РЅРµС‚ РґРѕР»РіР°.");
    }

    const newPaid = sale.paidAmountUSD + actualPayment;
    const newDebt = Math.max(0, sale.totalAmountUSD - newPaid);

    await tx.payment.create({
      data: {
        saleId,
        amountUSD: actualPayment,
        paymentDate: paymentDateRaw ? new Date(paymentDateRaw) : new Date(),
        createdById: session.userId,
      },
    });

    await tx.sale.update({
      where: { id: saleId },
      data: {
        paidAmountUSD: newPaid,
        debtAmountUSD: newDebt,
        status: computeSaleStatus(sale.totalAmountUSD, newPaid, newDebt),
      },
    });
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${saleId}`);
}

export async function createReturnAction(formData: FormData) {
  const session = await getRequiredSession();
  assertCanManage(session.role);

  const saleId = String(formData.get("saleId") ?? "");
  const itemsJson = String(formData.get("itemsJson") ?? "[]");

  let inputs: ReturnItemInput[];
  try {
    inputs = JSON.parse(itemsJson) as ReturnItemInput[];
  } catch {
    throw new Error("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Рµ РїРѕР·РёС†РёРё РІРѕР·РІСЂР°С‚Р°.");
  }

  const items = inputs.filter((item) => item.quantity > 0);
  if (!saleId || items.length === 0) {
    throw new Error("Р”РѕР±Р°РІСЊС‚Рµ С‚РѕРІР°СЂС‹ РґР»СЏ РІРѕР·РІСЂР°С‚Р°.");
  }

  await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { items: { include: { containerItem: { select: { containerId: true } } } } },
    });
    if (!sale) {
      throw new Error("РџСЂРѕРґР°Р¶Р° РЅРµ РЅР°Р№РґРµРЅР°.");
    }
    await assertOpenPeriodById(sale.financialPeriodId);

    const saleItemMap = new Map(sale.items.map((item) => [item.id, item]));
    const alreadyReturned = await tx.returnItem.findMany({
      where: { saleItem: { saleId } },
    });
    const returnedByItem = new Map<string, number>();
    for (const row of alreadyReturned) {
      returnedByItem.set(row.saleItemId, (returnedByItem.get(row.saleItemId) ?? 0) + row.quantity);
    }

    let totalReturnUSD = 0;
    const rows: Array<{
      saleItemId: string;
      quantity: number;
      amountUSD: number;
      containerItemId: string;
    }> = [];

    for (const item of items) {
      const saleItem = saleItemMap.get(item.saleItemId);
      if (!saleItem) {
        throw new Error("РџРѕР·РёС†РёСЏ РїСЂРѕРґР°Р¶Рё РЅРµ РЅР°Р№РґРµРЅР°.");
      }
      const already = returnedByItem.get(saleItem.id) ?? 0;
      const available = saleItem.quantity - already;
      if (item.quantity > available) {
        throw new Error("РљРѕР»РёС‡РµСЃС‚РІРѕ РІРѕР·РІСЂР°С‚Р° РїСЂРµРІС‹С€Р°РµС‚ РґРѕСЃС‚СѓРїРЅРѕРµ.");
      }

      const amountUSD = item.quantity * saleItem.salePricePerUnitUSD;
      totalReturnUSD += amountUSD;
      rows.push({
        saleItemId: saleItem.id,
        quantity: item.quantity,
        amountUSD,
        containerItemId: saleItem.containerItemId,
      });
    }

    const returnNumber = await nextDocumentNumber(tx, "RET");
    const createdReturn = await tx.return.create({
      data: {
        saleId,
        returnNumber,
        totalReturnUSD,
        createdById: session.userId,
      },
    });

    for (const row of rows) {
      await tx.returnItem.create({
        data: {
          returnId: createdReturn.id,
          saleItemId: row.saleItemId,
          quantity: row.quantity,
          amountUSD: row.amountUSD,
        },
      });

      await tx.containerItem.update({
        where: { id: row.containerItemId },
        data: { quantity: { increment: row.quantity } },
      });

    }

    const affectedContainerIds = [...new Set(sale.items.map((item) => item.containerItem.containerId))];
    for (const containerId of affectedContainerIds) {
      await recalculateContainerFinancials(containerId, tx);
    }

    const newTotal = Math.max(0, sale.totalAmountUSD - totalReturnUSD);
    const debtReduction = Math.min(sale.debtAmountUSD, totalReturnUSD);
    const newDebt = Math.max(0, sale.debtAmountUSD - debtReduction);
    const paidCapped = Math.min(sale.paidAmountUSD, newTotal);

    const totalReturned = (await tx.return.aggregate({
      where: { saleId },
      _sum: { totalReturnUSD: true },
    }))._sum.totalReturnUSD ?? 0;

    const isReturnedFully = totalReturned >= sale.totalAmountUSD;

    await tx.sale.update({
      where: { id: saleId },
      data: {
        totalAmountUSD: newTotal,
        debtAmountUSD: newDebt,
        paidAmountUSD: paidCapped,
        status: computeSaleStatus(newTotal, paidCapped, newDebt, isReturnedFully),
      },
    });
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${saleId}`);
  revalidatePath("/warehouse");
}



