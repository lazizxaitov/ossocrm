import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { computeInvestorProfit } from "@/lib/investor";
import { prisma } from "@/lib/prisma";
import { INVESTOR_PORTAL_ROLES } from "@/lib/rbac";

export async function GET() {
  const session = await getSession();
  if (!session || !INVESTOR_PORTAL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { investorId: true },
  });

  if (!user?.investorId) {
    return NextResponse.json({ error: "Профиль инвестора не найден." }, { status: 404 });
  }

  const investor = await prisma.investor.findUnique({
    where: { id: user.investorId },
    include: {
      investments: {
        include: { container: true },
      },
      payouts: true,
    },
  });

  if (!investor) {
    return NextResponse.json({ error: "Инвестор не найден." }, { status: 404 });
  }

  const paidByContainer = new Map<string, number>();
  for (const payout of investor.payouts) {
    paidByContainer.set(payout.containerId, (paidByContainer.get(payout.containerId) ?? 0) + payout.amountUSD);
  }

  const header = [
    "Контейнер",
    "Вложено USD",
    "Доля %",
    "Прибыль USD",
    "Выплачено USD",
    "Остаток USD",
  ].join(",");

  const rows = investor.investments.map((row) => {
    const profit = computeInvestorProfit(row.container.netProfitUSD, row.percentageShare);
    const paid = paidByContainer.get(row.containerId) ?? 0;
    const remaining = profit - paid;
    return [
      row.container.name,
      row.investedAmountUSD.toFixed(2),
      row.percentageShare.toFixed(4),
      profit.toFixed(2),
      paid.toFixed(2),
      remaining.toFixed(2),
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"investor-report-${new Date().toISOString().slice(0, 10)}.csv\"`,
    },
  });
}
