"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequiredSession } from "@/lib/auth";
import { toNumber } from "@/lib/currency";
import { assertOpenPeriodForDate } from "@/lib/financial-period";
import { computeInvestorProfit, recalculateContainerInvestmentShares } from "@/lib/investor";
import { prisma } from "@/lib/prisma";
import { INVESTORS_MANAGE_ROLES } from "@/lib/rbac";

function assertCanManage(role: string) {
  if (!INVESTORS_MANAGE_ROLES.includes(role as (typeof INVESTORS_MANAGE_ROLES)[number])) {
    throw new Error("Недостаточно прав для управления инвесторами.");
  }
}

export async function createInvestorAction(formData: FormData) {
  const session = await getRequiredSession();
  assertCanManage(session.role);

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const login = String(formData.get("login") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim();

  if (!name) {
    throw new Error("Укажите имя инвестора.");
  }

  const investor = await prisma.investor.create({
    data: {
      name,
      phone: phone || null,
    },
  });

  if (login || userId) {
    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : await prisma.user.findUnique({ where: { login } });
    if (user && user.role === "INVESTOR") {
      await prisma.user.update({
        where: { id: user.id },
        data: { investorId: investor.id },
      });
    }
  }

  revalidatePath("/investors");
  revalidatePath("/investor");
}

export async function addContainerInvestmentAction(formData: FormData) {
  const session = await getRequiredSession();
  assertCanManage(session.role);

  const containerId = String(formData.get("containerId") ?? "");
  const investorId = String(formData.get("investorId") ?? "");
  const investedAmountUSD = toNumber(formData.get("investedAmountUSD"));

  if (!containerId || !investorId || !Number.isFinite(investedAmountUSD) || investedAmountUSD <= 0) {
    throw new Error("Проверьте данные инвестиции.");
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.containerInvestment.findUnique({
      where: { containerId_investorId: { containerId, investorId } },
    });
    if (existing) {
      await tx.containerInvestment.update({
        where: { id: existing.id },
        data: { investedAmountUSD: existing.investedAmountUSD + investedAmountUSD },
      });
    } else {
      await tx.containerInvestment.create({
        data: {
          containerId,
          investorId,
          investedAmountUSD,
          percentageShare: 0,
        },
      });
    }
    await recalculateContainerInvestmentShares(containerId, tx);
  });

  revalidatePath("/containers");
  revalidatePath(`/containers/${containerId}`);
  revalidatePath("/investors");
}

export async function createInvestorPayoutAction(formData: FormData) {
  const session = await getRequiredSession();
  assertCanManage(session.role);

  const investorId = String(formData.get("investorId") ?? "");
  const containerId = String(formData.get("containerId") ?? "");
  const amountUSD = toNumber(formData.get("amountUSD"));
  const payoutDateRaw = String(formData.get("payoutDate") ?? "").trim();

  if (!containerId) {
    throw new Error("Не указан контейнер.");
  }

  try {
    if (!investorId || !Number.isFinite(amountUSD) || amountUSD <= 0) {
      throw new Error("Проверьте данные выплаты.");
    }

    await prisma.$transaction(async (tx) => {
      const period = await assertOpenPeriodForDate(new Date());
      const [container, investment] = await Promise.all([
        tx.container.findUnique({ where: { id: containerId } }),
        tx.containerInvestment.findUnique({
          where: { containerId_investorId: { containerId, investorId } },
        }),
      ]);

      if (!container || !investment) {
        throw new Error("Инвестор не привязан к контейнеру.");
      }
      if (container.status === "IN_TRANSIT") {
        throw new Error("Выплата инвестору доступна только после прибытия контейнера.");
      }

      const soldItems = await tx.saleItem.findMany({
        where: { containerItem: { containerId } },
        select: {
          quantity: true,
          salePricePerUnitUSD: true,
          costPerUnitUSD: true,
          returnItems: { select: { quantity: true } },
        },
      });

      const realizedSalesProfitUSD = soldItems.reduce((sum, item) => {
        const returnedQty = item.returnItems.reduce((retSum, row) => retSum + row.quantity, 0);
        const effectiveQty = Math.max(0, item.quantity - returnedQty);
        return sum + effectiveQty * (item.salePricePerUnitUSD - item.costPerUnitUSD);
      }, 0);
      const realizedNetProfitUSD = realizedSalesProfitUSD - container.totalExpensesUSD;

      const paid = (
        await tx.investorPayout.aggregate({
          where: { containerId, investorId },
          _sum: { amountUSD: true },
        })
      )._sum.amountUSD ?? 0;

      const shareAmountUSD = computeInvestorProfit(realizedNetProfitUSD, investment.percentageShare);
      const available = Math.max(0, shareAmountUSD - paid);

      if (amountUSD > available + 0.0001) {
        throw new Error("Сумма выплаты превышает доступную сумму из реальной прибыли.");
      }

      await tx.investorPayout.create({
        data: {
          investorId,
          containerId,
          amountUSD,
          payoutDate: payoutDateRaw ? new Date(payoutDateRaw) : new Date(),
          financialPeriodId: period.id,
          createdById: session.userId,
        },
      });
    });

    revalidatePath("/investors");
    revalidatePath("/containers");
    revalidatePath(`/containers/${containerId}`);
    revalidatePath("/investor");
    redirect(`/containers/${containerId}?success=${encodeURIComponent("Выплата инвестору проведена.")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось провести выплату инвестору.";
    redirect(`/containers/${containerId}?error=${encodeURIComponent(message)}`);
  }
}
