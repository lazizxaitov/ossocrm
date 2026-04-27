import { InventorySessionStatus, type PrismaClient, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function canAccessWarehouseApi(role: Role) {
  return role === "WAREHOUSE" || role === "ADMIN" || role === "SUPER_ADMIN";
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
