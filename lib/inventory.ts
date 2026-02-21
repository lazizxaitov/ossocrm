import { InventorySessionStatus, type PrismaClient, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function canAccessWarehouseApi(role: Role) {
  return role === "WAREHOUSE" || role === "ADMIN" || role === "SUPER_ADMIN";
}

export async function generateInventoryCode(db: PrismaClient = prisma) {
  for (let i = 0; i < 50; i++) {
    const code = String(Math.floor(100 + Math.random() * 900));
    const existing = await db.inventorySession.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Не удалось сгенерировать код инвентаризации.");
}

export async function refreshSystemControlByInventory(db: PrismaClient = prisma) {
  const discrepancyCount = await db.inventorySession.count({
    where: { status: InventorySessionStatus.DISCREPANCY },
  });

  await db.systemControl.upsert({
    where: { id: 1 },
    update: {
      warehouseDiscrepancyCount: discrepancyCount,
      ...(discrepancyCount === 0 ? { inventoryCheckedAt: new Date() } : {}),
    },
    create: {
      id: 1,
      lastBackupAt: new Date(),
      warehouseDiscrepancyCount: discrepancyCount,
      inventoryCheckedAt: discrepancyCount === 0 ? new Date() : null,
      plannedMonthlyExpensesUSD: 0,
    },
  });
}
