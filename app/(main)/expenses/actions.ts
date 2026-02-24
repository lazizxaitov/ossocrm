"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getRequiredSession } from "@/lib/auth";
import { assertOpenPeriodForDate } from "@/lib/financial-period";
import { prisma } from "@/lib/prisma";
import { EXPENSES_ADD_ROLES } from "@/lib/rbac";

function assertCanAdd(role: string) {
  if (!EXPENSES_ADD_ROLES.includes(role as (typeof EXPENSES_ADD_ROLES)[number])) {
    throw new Error("Недостаточно прав для добавления расхода.");
  }
}

function redirectWithError(message: string) {
  redirect(`/expenses?error=${encodeURIComponent(message)}`);
}

function redirectWithSuccess(message: string) {
  redirect(`/expenses?success=${encodeURIComponent(message)}`);
}

export async function createOperatingExpenseAction(formData: FormData) {
  try {
    const session = await getRequiredSession();
    assertCanAdd(session.role);

    const title = String(formData.get("title") ?? "").trim();
    const amountRaw = Number(String(formData.get("amountUSD") ?? "").replace(",", "."));
    const spentAtRaw = String(formData.get("spentAt") ?? "").trim();
    const investorId = String(formData.get("investorId") ?? "").trim();

    if (!title) throw new Error("Укажите название расхода.");
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) throw new Error("Сумма расхода должна быть больше 0.");
    if (!spentAtRaw) throw new Error("Укажите дату и время расхода.");
    if (!investorId) throw new Error("Выберите инвестора, с кого списывается расход.");

    const spentAt = new Date(spentAtRaw);
    if (Number.isNaN(spentAt.getTime())) throw new Error("Некорректная дата и время расхода.");

    const [investor, period] = await Promise.all([
      prisma.investor.findUnique({ where: { id: investorId }, select: { id: true } }),
      assertOpenPeriodForDate(spentAt),
    ]);

    if (!investor) throw new Error("Инвестор не найден.");

    await prisma.$transaction(async (tx) => {
      const row = await tx.operatingExpense.create({
        data: {
          title,
          amountUSD: amountRaw,
          spentAt,
          investorId,
          financialPeriodId: period.id,
          createdById: session.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "CREATE_OPERATING_EXPENSE",
          entityType: "OPERATING_EXPENSE",
          entityId: row.id,
          metadata: JSON.stringify({ title, amountUSD: amountRaw, investorId, spentAt: spentAt.toISOString() }),
          createdById: session.userId,
        },
      });
    });

    revalidatePath("/expenses");
    revalidatePath("/dashboard");
    redirectWithSuccess("Расход добавлен.");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirectWithError(error instanceof Error ? error.message : "Не удалось добавить расход.");
  }
}
