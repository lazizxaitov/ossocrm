import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("admin123", 12);

  const admin = await prisma.user.upsert({
    where: { login: "admin" },
    update: {
      name: "Super Admin",
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      name: "Super Admin",
      login: "admin",
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
  });

  await prisma.currencySetting.upsert({
    where: { id: 1 },
    update: {
      cnyToUsdRate: 0.14,
      updatedById: admin.id,
    },
    create: {
      id: 1,
      cnyToUsdRate: 0.14,
      updatedById: admin.id,
    },
  });

  await prisma.investor.upsert({
    where: { id: "osso-company-investor" },
    update: {
      name: "OSSO Company",
      phone: null,
    },
    create: {
      id: "osso-company-investor",
      name: "OSSO Company",
      phone: null,
    },
  });

  await prisma.systemControl.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      lastBackupAt: new Date(),
      inventoryCheckedAt: new Date(),
      warehouseDiscrepancyCount: 0,
      closedMonth: null,
      plannedMonthlyExpensesUSD: 0,
      serverTimeOffsetMinutes: 0,
      serverTimeAuto: true,
      serverTimeZone: "UTC",
      manualSystemTime: null,
    },
  });

  const now = new Date();
  await prisma.financialPeriod.upsert({
    where: {
      month_year: {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      },
    },
    update: {},
    create: {
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      status: "OPEN",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
