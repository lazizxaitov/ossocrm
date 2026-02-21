"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/lib/auth";
import { recalculateContainerFinancials } from "@/lib/container-finance";
import { toNumber } from "@/lib/currency";
import { assertOpenPeriodById, assertOpenPeriodForDate } from "@/lib/financial-period";
import { prisma } from "@/lib/prisma";
import { EXPENSES_ADD_ROLES, EXPENSES_CORRECTION_ROLES } from "@/lib/rbac";

function assertCanAdd(role: string) {
  if (!EXPENSES_ADD_ROLES.includes(role as (typeof EXPENSES_ADD_ROLES)[number])) {
    throw new Error("Недостаточно прав для добавления расхода.");
  }
}

function assertCanCorrect(role: string) {
  if (!EXPENSES_CORRECTION_ROLES.includes(role as (typeof EXPENSES_CORRECTION_ROLES)[number])) {
    throw new Error("Недостаточно прав для корректировки расхода.");
  }
}

export async function createContainerExpenseAction(formData: FormData) {
  const session = await getRequiredSession();
  assertCanAdd(session.role);

  const containerId = String(formData.get("containerId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const amountUSD = toNumber(formData.get("amountUSD"));
  const description = String(formData.get("description") ?? "").trim();

  if (!containerId || !title || !Number.isFinite(amountUSD) || amountUSD <= 0) {
    throw new Error("Проверьте данные расхода.");
  }

  await prisma.$transaction(async (tx) => {
    const period = await assertOpenPeriodForDate(new Date());
    const container = await tx.container.findUnique({
      where: { id: containerId },
      select: { status: true },
    });
    if (!container) {
      throw new Error("Контейнер не найден.");
    }
    if (container.status === "CLOSED") {
      throw new Error("Нельзя добавлять расходы в закрытый контейнер.");
    }

    const expense = await tx.containerExpense.create({
      data: {
        containerId,
        title,
        category: category as "LOGISTICS" | "CUSTOMS" | "STORAGE" | "TRANSPORT" | "OTHER",
        amountUSD,
        description: description || null,
        financialPeriodId: period.id,
        createdById: session.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "CREATE_EXPENSE",
        entityType: "ContainerExpense",
        entityId: expense.id,
        metadata: JSON.stringify({ containerId, amountUSD, category }),
        createdById: session.userId,
      },
    });

    await recalculateContainerFinancials(containerId, tx);
  });

  revalidatePath("/containers");
  revalidatePath(`/containers/${containerId}`);
  revalidatePath("/investors");
  revalidatePath("/investor");
}

export async function createExpenseCorrectionAction(formData: FormData) {
  const session = await getRequiredSession();
  assertCanCorrect(session.role);

  const expenseId = String(formData.get("expenseId") ?? "");
  const correctionAmountUSD = toNumber(formData.get("correctionAmountUSD"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!expenseId || !Number.isFinite(correctionAmountUSD) || !reason) {
    throw new Error("Проверьте данные корректировки.");
  }

  let containerId = "";
  await prisma.$transaction(async (tx) => {
    const expense = await tx.containerExpense.findUnique({
      where: { id: expenseId },
      include: { container: { select: { id: true, status: true } }, financialPeriod: true },
    });
    if (!expense) {
      throw new Error("Расход не найден.");
    }
    await assertOpenPeriodById(expense.financialPeriodId);
    if (expense.container.status === "CLOSED") {
      throw new Error("Нельзя корректировать расходы закрытого контейнера.");
    }

    const correction = await tx.expenseCorrection.create({
      data: {
        expenseId,
        correctionAmountUSD,
        reason,
        financialPeriodId: expense.financialPeriodId,
        createdById: session.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "CREATE_EXPENSE_CORRECTION",
        entityType: "ExpenseCorrection",
        entityId: correction.id,
        metadata: JSON.stringify({ expenseId, correctionAmountUSD }),
        createdById: session.userId,
      },
    });

    containerId = expense.container.id;
    await recalculateContainerFinancials(containerId, tx);
  });

  revalidatePath("/containers");
  revalidatePath(`/containers/${containerId}`);
  revalidatePath("/investors");
  revalidatePath("/investor");
}

export async function confirmExpenseCorrectionAction(formData: FormData) {
  const session = await getRequiredSession();
  assertCanCorrect(session.role);

  const correctionId = String(formData.get("correctionId") ?? "");
  if (!correctionId) {
    throw new Error("Корректировка не выбрана.");
  }

  let containerId = "";
  await prisma.$transaction(async (tx) => {
    const correction = await tx.expenseCorrection.findUnique({
      where: { id: correctionId },
      include: { expense: { select: { containerId: true } } },
    });
    if (!correction) {
      throw new Error("Корректировка не найдена.");
    }
    await assertOpenPeriodById(correction.financialPeriodId);

    await tx.expenseCorrection.update({
      where: { id: correctionId },
      data: { isConfirmed: true },
    });
    containerId = correction.expense.containerId;
    await recalculateContainerFinancials(containerId, tx);
  });

  revalidatePath("/containers");
  revalidatePath(`/containers/${containerId}`);
  revalidatePath("/dashboard");
}
