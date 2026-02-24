"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequiredSession } from "@/lib/auth";
import { buildMonthCloseBlockersForPeriod } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { PERIODS_MANAGE_ROLES, PERIODS_UNLOCK_ROLES } from "@/lib/rbac";

function redirectWithError(message: string) {
  redirect(`/financial-periods?error=${encodeURIComponent(message)}`);
}

function redirectWithSuccess(message: string) {
  redirect(`/financial-periods?success=${encodeURIComponent(message)}`);
}

export async function lockFinancialPeriodAction(formData: FormData) {
  const session = await getRequiredSession();
  if (!PERIODS_MANAGE_ROLES.includes(session.role)) {
    redirectWithError("Недостаточно прав для закрытия периода.");
  }

  const periodId = String(formData.get("periodId") ?? "");
  if (!periodId) {
    redirectWithError("Период не выбран.");
  }

  const blockers = await buildMonthCloseBlockersForPeriod(periodId);
  if (blockers.length > 0) {
    redirectWithError(`Нельзя закрыть период: ${blockers.join(" ")}`);
  }

  const period = await prisma.financialPeriod.update({
    where: { id: periodId },
    data: {
      status: "LOCKED",
      lockedById: session.userId,
      lockedAt: new Date(),
      lockReason: "Закрытие периода",
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "LOCK_FINANCIAL_PERIOD",
      entityType: "FinancialPeriod",
      entityId: period.id,
      metadata: JSON.stringify({ month: period.month, year: period.year }),
      createdById: session.userId,
    },
  });

  revalidatePath("/financial-periods");
  revalidatePath("/dashboard");
  redirectWithSuccess("Период успешно закрыт.");
}

export async function unlockFinancialPeriodAction(formData: FormData) {
  const session = await getRequiredSession();
  if (!PERIODS_UNLOCK_ROLES.includes(session.role)) {
    redirectWithError("Разблокировка доступна только суперадминистратору.");
  }

  const periodId = String(formData.get("periodId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!periodId || !reason) {
    redirectWithError("Укажите причину разблокировки.");
  }

  const period = await prisma.financialPeriod.update({
    where: { id: periodId },
    data: {
      status: "OPEN",
      lockedById: null,
      lockedAt: null,
      unlockReason: reason,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "UNLOCK_FINANCIAL_PERIOD",
      entityType: "FinancialPeriod",
      entityId: period.id,
      metadata: JSON.stringify({ reason, month: period.month, year: period.year }),
      createdById: session.userId,
    },
  });

  revalidatePath("/financial-periods");
  revalidatePath("/dashboard");
  redirectWithSuccess("Период успешно разблокирован.");
}
