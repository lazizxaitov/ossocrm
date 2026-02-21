"use server";

import { InventorySessionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/lib/auth";
import { generateInventoryCode, refreshSystemControlByInventory } from "@/lib/inventory";
import { INVENTORY_SESSIONS_VIEW_ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

const INVENTORY_CODE_TTL_MINUTES = 10;

export type ConfirmCodeState = {
  error: string | null;
  success: string | null;
};

export async function confirmInventoryCodeAction(
  _: ConfirmCodeState,
  formData: FormData,
): Promise<ConfirmCodeState> {
  const session = await getRequiredSession();
  if (!INVENTORY_SESSIONS_VIEW_ROLES.includes(session.role)) {
    return { error: "Недостаточно прав доступа.", success: null };
  }

  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{3}$/.test(code)) {
    return { error: "Введите 3-значный код.", success: null };
  }

  const inventorySession = await prisma.inventorySession.findUnique({
    where: { code },
  });

  if (!inventorySession) {
    return { error: "Инвентаризация с таким кодом не найдена.", success: null };
  }

  if (inventorySession.status === InventorySessionStatus.DISCREPANCY) {
    return {
      error: "Есть расхождения. Сначала обработайте расхождения, затем повторите отправку.",
      success: null,
    };
  }

  if (inventorySession.status === InventorySessionStatus.CONFIRMED) {
    return { error: null, success: `Код ${code} уже был подтвержден.` };
  }

  const ageMs = Date.now() - new Date(inventorySession.createdAt).getTime();
  const ttlMs = INVENTORY_CODE_TTL_MINUTES * 60 * 1000;
  if (ageMs > ttlMs) {
    return {
      error: `Срок действия кода истек (более ${INVENTORY_CODE_TTL_MINUTES} минут). Запустите инвентаризацию заново.`,
      success: null,
    };
  }

  await prisma.inventorySession.update({
    where: { id: inventorySession.id },
    data: {
      status: InventorySessionStatus.CONFIRMED,
      confirmedById: session.userId,
      confirmedAt: new Date(),
      sentToAdminAt: inventorySession.sentToAdminAt ?? new Date(),
    },
  });

  await refreshSystemControlByInventory();

  revalidatePath("/inventory-sessions");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse/history");
  return { error: null, success: `Код ${code} подтвержден.` };
}

export async function deletePendingInventorySessionAction(formData: FormData) {
  const session = await getRequiredSession();
  if (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN") {
    return;
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const target = await prisma.inventorySession.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!target) return;
  if (target.status === InventorySessionStatus.CONFIRMED && session.role !== "SUPER_ADMIN") {
    return;
  }

  await prisma.inventorySession.delete({
    where: { id },
  });

  await refreshSystemControlByInventory();
  revalidatePath("/inventory-sessions");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse/history");
}

export type ResolveDiscrepancyState = {
  error: string | null;
  success: string | null;
  code: string | null;
};

export async function resolveDiscrepancySessionAction(
  _: ResolveDiscrepancyState,
  formData: FormData,
): Promise<ResolveDiscrepancyState> {
  const session = await getRequiredSession();
  if (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN") {
    return { error: "Недостаточно прав для изменения статуса инвентаризации.", success: null, code: null };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Не выбрана сессия инвентаризации.", success: null, code: null };
  }

  const target = await prisma.inventorySession.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!target) {
    return { error: "Сессия инвентаризации не найдена.", success: null, code: null };
  }
  if (target.status !== InventorySessionStatus.DISCREPANCY) {
    return { error: "Статус уже не требует решения расхождений.", success: null, code: null };
  }

  const newCode = await generateInventoryCode(prisma);

  await prisma.inventorySession.update({
    where: { id: target.id },
    data: {
      status: InventorySessionStatus.PENDING,
      discrepancyCount: 0,
      code: newCode,
    },
  });

  await refreshSystemControlByInventory();
  revalidatePath("/inventory-sessions");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse/history");

  return {
    error: null,
    success: "Расхождения отмечены как решенные. Сессия переведена в ожидание подтверждения кодом.",
    code: newCode,
  };
}
