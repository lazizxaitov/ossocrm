"use server";

import { InventorySessionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/lib/auth";
import { refreshSystemControlByInventory } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

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
};

export async function resolveDiscrepancySessionAction(
  _: ResolveDiscrepancyState,
  formData: FormData,
): Promise<ResolveDiscrepancyState> {
  const session = await getRequiredSession();
  if (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN") {
    return { error: "Недостаточно прав для изменения статуса инвентаризации.", success: null };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Не выбрана сессия инвентаризации.", success: null };
  }

  const target = await prisma.inventorySession.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!target) {
    return { error: "Сессия инвентаризации не найдена.", success: null };
  }
  if (target.status !== InventorySessionStatus.DISCREPANCY) {
    return { error: "Статус уже не требует решения расхождений.", success: null };
  }

  await prisma.inventorySession.update({
    where: { id: target.id },
    data: {
      status: InventorySessionStatus.CONFIRMED,
      discrepancyCount: 0,
      confirmedById: session.userId,
      confirmedAt: new Date(),
      sentToAdminAt: new Date(),
    },
  });

  await refreshSystemControlByInventory();
  revalidatePath("/inventory-sessions");
  revalidatePath("/dashboard");
  revalidatePath("/warehouse/history");

  return {
    error: null,
    success: "Расхождения отмечены как решенные. Сессия подтверждена.",
  };
}
