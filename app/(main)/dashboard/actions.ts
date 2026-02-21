"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/lib/auth";
import {
  buildMonthCloseBlockersForPeriod,
  buildMonthCloseChecklistForPeriod,
  type MonthCloseChecklistKey,
} from "@/lib/dashboard";
import { getCurrentFinancialPeriod } from "@/lib/financial-period";
import { prisma } from "@/lib/prisma";
import { PERIODS_MANAGE_ROLES } from "@/lib/rbac";

export async function closeCurrentMonthAction(formData: FormData) {
  const session = await getRequiredSession();
  if (!PERIODS_MANAGE_ROLES.includes(session.role)) {
    throw new Error("Недостаточно прав для закрытия месяца.");
  }

  const period = await getCurrentFinancialPeriod();
  const requiredChecks: MonthCloseChecklistKey[] = [
    "no_debts",
    "no_issues",
    "no_open_deals",
    "inventory_confirmed",
  ];

  const unchecked = requiredChecks.filter((key) => String(formData.get(`confirm_${key}`) ?? "") !== "on");
  if (unchecked.length > 0) {
    throw new Error("Подтвердите все пункты чек-листа перед закрытием месяца.");
  }

  const checklist = await buildMonthCloseChecklistForPeriod(period.id);
  const failed = checklist.filter((item) => !item.ok);
  if (failed.length > 0) {
    throw new Error(`Нельзя закрыть месяц: ${failed.map((item) => item.reason ?? item.label).join(" ")}`);
  }

  const blockers = await buildMonthCloseBlockersForPeriod(period.id);
  if (blockers.length > 0) {
    throw new Error(`Нельзя закрыть месяц: ${blockers.join(" ")}`);
  }

  await prisma.financialPeriod.update({
    where: { id: period.id },
    data: {
      status: "LOCKED",
      lockedById: session.userId,
      lockedAt: new Date(),
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

  revalidatePath("/dashboard");
  revalidatePath("/financial-periods");
}
