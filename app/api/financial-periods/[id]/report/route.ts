import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { computeKpis, rangeFromPeriod } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { PERIODS_VIEW_ROLES } from "@/lib/rbac";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session || !PERIODS_VIEW_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 403 });
  }

  const { id } = await params;
  const period = await prisma.financialPeriod.findUnique({ where: { id } });
  if (!period) {
    return NextResponse.json({ error: "Период не найден." }, { status: 404 });
  }

  const { from, to } = rangeFromPeriod(period.year, period.month);
  const kpi = await computeKpis({ from, to });
  const rows = [
    "Метрика,Значение USD",
    `Выручка,${kpi.revenue.toFixed(2)}`,
    `Себестоимость,${kpi.cogs.toFixed(2)}`,
    `Расходы,${kpi.expenses.toFixed(2)}`,
    `Чистая прибыль,${kpi.netProfit.toFixed(2)}`,
    `Долги,${kpi.debtTotal.toFixed(2)}`,
    `Доступно к выплате инвесторам,${kpi.availableToPayout.toFixed(2)}`,
  ];

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"period-${period.year}-${String(period.month).padStart(2, "0")}.csv\"`,
    },
  });
}
