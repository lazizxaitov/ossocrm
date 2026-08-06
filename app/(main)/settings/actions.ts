"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getRequiredSession } from "@/lib/auth";
import { restoreDatabaseBackup, restoreDatabaseFromBuffer } from "@/lib/backup";
import { toNumber } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { SETTINGS_ROLES } from "@/lib/rbac";
import { resolveCostingRuleMode } from "@/lib/costing-rules";
import { recalculateContainerFinancials } from "@/lib/container-finance";
import { recalculateContainerUnitCost } from "@/lib/container-cost";

export async function updateCurrencySettingAction(formData: FormData) {
  const session = await getRequiredSession();
  if (session.role !== Role.SUPER_ADMIN) {
    throw new Error("Изменение курса доступно только суперадминистратору.");
  }

  const rate = toNumber(formData.get("cnyToUsdRate"));
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Введите корректный курс CNY → USD.");
  }

  await prisma.currencySetting.upsert({
    where: { id: 1 },
    update: {
      cnyToUsdRate: rate,
      updatedById: session.userId,
    },
    create: {
      id: 1,
      cnyToUsdRate: rate,
      updatedById: session.userId,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/settings/currency");
  revalidatePath("/containers");
}

export async function updateServerDateTimeAction(formData: FormData) {
  const session = await getRequiredSession();
  if (session.role !== Role.SUPER_ADMIN) {
    throw new Error("Изменение даты и времени доступно только суперадминистратору.");
  }

  const serverTimeAuto = String(formData.get("serverTimeAuto") ?? "") === "on";
  const serverTimeZone = String(formData.get("serverTimeZone") ?? "UTC").trim() || "UTC";
  const manualDateTimeRaw = String(formData.get("manualDateTime") ?? "").trim();
  const currentControl = await prisma.systemControl.findUnique({
    where: { id: 1 },
    select: { manualSystemTime: true },
  });

  const allowedZones = [
    "UTC",
    "Europe/Moscow",
    "Asia/Almaty",
    "Asia/Tashkent",
    "Asia/Dubai",
    "Europe/Berlin",
    "America/New_York",
  ];
  if (!allowedZones.includes(serverTimeZone)) {
    throw new Error("Выберите корректный часовой пояс.");
  }

  let manualSystemTime: Date | null = null;
  if (!serverTimeAuto) {
    if (!manualDateTimeRaw) {
      manualSystemTime = currentControl?.manualSystemTime ?? new Date();
    } else {
      const parsed = new Date(manualDateTimeRaw);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("Некорректная дата и время для ручного режима.");
      }
      manualSystemTime = parsed;
    }
  }

  await prisma.systemControl.upsert({
    where: { id: 1 },
    update: {
      serverTimeAuto,
      serverTimeZone,
      manualSystemTime,
      serverTimeOffsetMinutes: 0,
    },
    create: {
      id: 1,
      lastBackupAt: new Date(),
      inventoryCheckedAt: null,
      warehouseDiscrepancyCount: 0,
      plannedMonthlyExpensesUSD: 0,
      serverTimeOffsetMinutes: 0,
      serverTimeAuto,
      serverTimeZone,
      manualSystemTime,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function createManualBackupAction() {
  const session = await getRequiredSession();
  if (!SETTINGS_ROLES.includes(session.role)) {
    throw new Error("Недостаточно прав для создания backup.");
  }

  // Ручной backup выполняется скачиванием через /api/backup/download.
  revalidatePath("/settings");
}

export async function restoreBackupAction(formData: FormData) {
  const session = await getRequiredSession();
  if (session.role !== Role.SUPER_ADMIN) {
    throw new Error("Восстановление backup доступно только суперадминистратору.");
  }

  const fileName = String(formData.get("fileName") ?? "").trim();
  if (!fileName) {
    throw new Error("Выберите backup для восстановления.");
  }

  await restoreDatabaseBackup(fileName);

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/financial-periods");
  revalidatePath("/sales");
  revalidatePath("/containers");
  revalidatePath("/products");
  revalidatePath("/stock");
}

export async function restoreBackupFromComputerAction(formData: FormData) {
  const session = await getRequiredSession();
  if (session.role !== Role.SUPER_ADMIN) {
    throw new Error("Восстановление backup доступно только суперадминистратору.");
  }

  const file = formData.get("backupFile");
  if (!(file instanceof File)) {
    throw new Error("Выберите файл backup из компьютера.");
  }
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".db") && !lowerName.endsWith(".zip")) {
    throw new Error("Поддерживаются только файлы .db или .zip.");
  }
  if (file.size <= 0) {
    throw new Error("Файл backup пустой.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await restoreDatabaseFromBuffer(file.name, buffer);

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/financial-periods");
  revalidatePath("/sales");
  revalidatePath("/containers");
  revalidatePath("/products");
  revalidatePath("/stock");
}

function parseRole(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  if (!Object.values(Role).includes(raw as Role)) {
    throw new Error("Выберите корректную роль.");
  }
  return raw as Role;
}

function assertRoleManagePermissions(currentRole: Role, targetRole: Role) {
  if (currentRole === Role.ADMIN && targetRole === Role.SUPER_ADMIN) {
    throw new Error("Администратор не может назначать роль суперадминистратора.");
  }
}

export async function createUserAction(formData: FormData) {
  const session = await getRequiredSession();
  if (session.role !== Role.SUPER_ADMIN) {
    throw new Error("Создание пользователя доступно только суперадминистратору.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const login = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = parseRole(formData.get("role"));

  if (!name || !login || !password) {
    throw new Error("Заполните имя, логин и пароль.");
  }
  if (password.length < 6) {
    throw new Error("Минимальная длина пароля: 6 символов.");
  }

  const exists = await prisma.user.findUnique({ where: { login } });
  if (exists) {
    throw new Error("Пользователь с таким логином уже существует.");
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      name,
      login,
      password: hashed,
      role,
      isActive: true,
    },
  });

  revalidatePath("/settings");
}

export async function updateUserAccessAction(formData: FormData) {
  const session = await getRequiredSession();
  if (session.role !== Role.SUPER_ADMIN) {
    throw new Error("Изменение пользователей доступно только суперадминистратору.");
  }

  const userId = String(formData.get("userId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const login = String(formData.get("login") ?? "").trim();
  const role = parseRole(formData.get("role"));
  const password = String(formData.get("password") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "on";

  if (!userId || !name || !login) {
    throw new Error("Некорректные данные пользователя.");
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    throw new Error("Пользователь не найден.");
  }

  assertRoleManagePermissions(session.role as Role, role);

  const loginOwner = await prisma.user.findUnique({ where: { login } });
  if (loginOwner && loginOwner.id !== userId) {
    throw new Error("Логин уже занят другим пользователем.");
  }

  const data: {
    name: string;
    login: string;
    role: Role;
    isActive: boolean;
    password?: string;
  } = {
    name,
    login,
    role,
    isActive,
  };

  if (password) {
    if (password.length < 6) {
      throw new Error("Минимальная длина пароля: 6 символов.");
    }
    data.password = await bcrypt.hash(password, 12);
  }

  await prisma.user.update({
    where: { id: userId },
    data,
  });

  revalidatePath("/settings");
}

export async function updateAutoLogoutTimerAction(formData: FormData) {
  const session = await getRequiredSession();
  if (session.role !== Role.SUPER_ADMIN) {
    throw new Error("Изменение таймера автовыхода доступно только суперадминистратору.");
  }

  const minutesRaw = String(formData.get("autoLogoutMinutes") ?? "").trim();
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) {
    throw new Error("Укажите таймер от 1 до 240 минут.");
  }

  await prisma.systemControl.upsert({
    where: { id: 1 },
    update: {
      serverTimeOffsetMinutes: Math.floor(minutes),
    },
    create: {
      id: 1,
      lastBackupAt: new Date(),
      inventoryCheckedAt: null,
      warehouseDiscrepancyCount: 0,
      plannedMonthlyExpensesUSD: 0,
      serverTimeOffsetMinutes: Math.floor(minutes),
      serverTimeAuto: true,
      serverTimeZone: "UTC",
      manualSystemTime: null,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function updateCostingRatesAction(formData: FormData) {
  const session = await getRequiredSession();
  if (session.role !== Role.SUPER_ADMIN) {
    throw new Error("Изменение ставок доступно только суперадминистратору.");
  }

  const transportUsdPerCbm = Math.max(0, Number(formData.get("transportUsdPerCbm") ?? 0));
  const customsRakovinaUsd = Math.max(0, Number(formData.get("customsRakovinaUsd") ?? 0));
  const customsUnitazUsd = Math.max(0, Number(formData.get("customsUnitazUsd") ?? 0));
  const customsSifonUsd = Math.max(0, Number(formData.get("customsSifonUsd") ?? 0));
  const customsSmesitelUsd = Math.max(0, Number(formData.get("customsSmesitelUsd") ?? 0));
  const customsOynaUsd = Math.max(0, Number(formData.get("customsOynaUsd") ?? 0));

  await prisma.systemControl.upsert({
    where: { id: 1 },
    update: {
      transportUsdPerCbm,
      customsRakovinaUsd,
      customsUnitazUsd,
      customsSifonUsd,
      customsSmesitelUsd,
      customsOynaUsd,
    },
    create: {
      id: 1,
      lastBackupAt: new Date(),
      inventoryCheckedAt: null,
      warehouseDiscrepancyCount: 0,
      plannedMonthlyExpensesUSD: 0,
      serverTimeOffsetMinutes: 0,
      serverTimeAuto: true,
      serverTimeZone: "UTC",
      manualSystemTime: null,
      costingRuleMode: "CATEGORY_BASED_V2",
      transportUsdPerCbm,
      customsRakovinaUsd,
      customsUnitazUsd,
      customsSifonUsd,
      customsSmesitelUsd,
      customsOynaUsd,
    },
  });

  const containers = await prisma.container.findMany({ select: { id: true } });
  for (const container of containers) {
    await recalculateContainerUnitCost(container.id);
    await recalculateContainerFinancials(container.id);
  }

  revalidatePath("/settings");
  revalidatePath("/containers");
  revalidatePath("/containers/excel");
  revalidatePath("/products/excel");
  revalidatePath("/dashboard");
  revalidatePath("/stock");
  revalidatePath("/sales");
}

export async function updateCostingRuleModeAction(formData: FormData) {
  const session = await getRequiredSession();
  if (session.role !== Role.SUPER_ADMIN) {
    throw new Error("Изменение правила учета доступно только суперадминистратору.");
  }

  const costingRuleMode = resolveCostingRuleMode(String(formData.get("costingRuleMode") ?? ""));

  await prisma.systemControl.upsert({
    where: { id: 1 },
    update: { costingRuleMode },
    create: {
      id: 1,
      lastBackupAt: new Date(),
      inventoryCheckedAt: null,
      warehouseDiscrepancyCount: 0,
      plannedMonthlyExpensesUSD: 0,
      serverTimeOffsetMinutes: 0,
      serverTimeAuto: true,
      serverTimeZone: "UTC",
      manualSystemTime: null,
      costingRuleMode,
      transportUsdPerCbm: 85.714653,
      customsRakovinaUsd: 6.65,
      customsUnitazUsd: 18.81,
      customsSifonUsd: 0.82,
      customsSmesitelUsd: 1.47,
      customsOynaUsd: 0,
    },
  });

  const containers = await prisma.container.findMany({ select: { id: true } });
  for (const container of containers) {
    await recalculateContainerUnitCost(container.id);
    await recalculateContainerFinancials(container.id);
  }

  revalidatePath("/settings");
  revalidatePath("/containers");
  revalidatePath("/containers/excel");
  revalidatePath("/products/excel");
  revalidatePath("/dashboard");
  revalidatePath("/stock");
  revalidatePath("/sales");
}

export async function resetBusinessDataAction() {
  const session = await getRequiredSession();
  if (session.role !== Role.SUPER_ADMIN) {
    throw new Error("Сброс данных доступен только суперадминистратору.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.returnItem.deleteMany();
    await tx.payment.deleteMany();
    await tx.return.deleteMany();
    await tx.saleItem.deleteMany();
    await tx.inventorySessionItem.deleteMany();
    await tx.manualStockEntry.deleteMany();
    await tx.expenseCorrection.deleteMany();
    await tx.containerExpense.deleteMany();
    await tx.investorPayout.deleteMany();
    await tx.operatingExpense.deleteMany();
    await tx.adjustment.deleteMany();
    await tx.inventorySession.deleteMany();
    await tx.sale.deleteMany();
    await tx.containerInvestment.deleteMany();
    await tx.containerItem.deleteMany();
    await tx.container.deleteMany();
    await tx.client.deleteMany();
    await tx.financialPeriod.deleteMany();
    await tx.auditLog.deleteMany();
    await tx.documentCounter.deleteMany();
    await tx.product.deleteMany();
    await tx.productCategory.deleteMany();
    await tx.productSize.deleteMany();
    await tx.investor.deleteMany();

    await tx.systemControl.upsert({
      where: { id: 1 },
      update: {
        inventoryCheckedAt: null,
        warehouseDiscrepancyCount: 0,
        closedMonth: null,
        plannedMonthlyExpensesUSD: 0,
      },
      create: {
        id: 1,
        lastBackupAt: new Date(),
        inventoryCheckedAt: null,
        warehouseDiscrepancyCount: 0,
        closedMonth: null,
        plannedMonthlyExpensesUSD: 0,
        serverTimeOffsetMinutes: 0,
        serverTimeAuto: true,
        serverTimeZone: "UTC",
        manualSystemTime: null,
        costingRuleMode: "LEGACY",
      },
    });
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/containers");
  revalidatePath("/containers/excel");
  revalidatePath("/containers/import");
  revalidatePath("/products");
  revalidatePath("/products/excel");
  revalidatePath("/sales");
  revalidatePath("/clients");
  revalidatePath("/investors");
  revalidatePath("/investor");
  revalidatePath("/expenses");
  revalidatePath("/stock");
  revalidatePath("/warehouse");
  revalidatePath("/warehouse/containers");
  revalidatePath("/warehouse/history");
  revalidatePath("/warehouse/inventory");
  revalidatePath("/financial-periods");
  revalidatePath("/inventory-sessions");
  revalidatePath("/audit");
  revalidatePath("/categories");
  revalidatePath("/vanities");
}
