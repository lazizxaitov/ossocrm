import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPeriodReportData } from "@/lib/period-report";
import { PERIODS_VIEW_ROLES } from "@/lib/rbac";
import { ruStatus } from "@/lib/ru-labels";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session || !PERIODS_VIEW_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 403 });
  }

  const { id } = await params;
  const report = await getPeriodReportData(id);
  if (!report) {
    return NextResponse.json({ error: "Период не найден." }, { status: 404 });
  }

  const rows = [
    `Период,${String(report.period.month).padStart(2, "0")}.${report.period.year}`,
    `Статус,${ruStatus(report.period.status)}`,
    `Диапазон,${report.range.from.toLocaleDateString("ru-RU")} - ${report.range.to.toLocaleDateString("ru-RU")}`,
    "",
    "KPI,Значение USD",
    `Выручка,${report.kpi.revenue.toFixed(2)}`,
    `Себестоимость,${report.kpi.cogs.toFixed(2)}`,
    `Расходы,${report.kpi.expenses.toFixed(2)}`,
    `Чистая прибыль,${report.kpi.netProfit.toFixed(2)}`,
    `Долги,${report.kpi.debtTotal.toFixed(2)}`,
    `Доступно к выплате инвесторам,${report.kpi.availableToPayout.toFixed(2)}`,
    "",
    "Сводка,Значение",
    `Продаж,${report.summary.salesCount}`,
    `Продаж завершено,${report.summary.completedSales}`,
    `Продаж частично оплачено,${report.summary.partialSales}`,
    `Продаж в долг,${report.summary.debtSales}`,
    `Просроченных долгов,${report.summary.overdueDebtCount}`,
    `Сумма просроченного долга USD,${report.summary.overdueDebtAmount.toFixed(2)}`,
    `Расходов,${report.summary.expensesCount}`,
    `Сумма корректировок расходов USD,${report.summary.totalCorrectionsUSD.toFixed(2)}`,
    `Выплат инвесторам,${report.summary.payoutsCount}`,
    `Возвратов,${report.summary.returnsCount}`,
    `Сумма возвратов USD,${report.summary.totalReturnsUSD.toFixed(2)}`,
    `Инвентаризаций,${report.summary.inventorySessionsCount}`,
    `Инвентаризаций с расхождениями,${report.summary.discrepancySessionsCount}`,
    "",
    "Продажи",
    "Счет,Дата,Клиент,Статус,Товарных позиций,Итого USD,Оплачено USD,Долг USD,Срок оплаты",
    ...report.sales.map((row) =>
      [
        row.invoiceNumber,
        row.createdAt.toLocaleDateString("ru-RU"),
        row.clientName,
        ruStatus(row.status),
        row.itemsCount,
        row.totalAmountUSD.toFixed(2),
        row.paidAmountUSD.toFixed(2),
        row.debtAmountUSD.toFixed(2),
        row.dueDate ? row.dueDate.toLocaleDateString("ru-RU") : "",
      ].join(","),
    ),
    "",
    "Расходы контейнеров",
    "Дата,Контейнер,Категория,Название,Сумма USD,Коррекции USD,Итог USD,Неподтв.корректировки",
    ...report.expenses.map((row) =>
      [
        row.createdAt.toLocaleDateString("ru-RU"),
        row.containerName,
        ruStatus(row.category),
        row.title,
        row.amountUSD.toFixed(2),
        row.correctionSumUSD.toFixed(2),
        row.finalAmountUSD.toFixed(2),
        row.unconfirmedCorrections,
      ].join(","),
    ),
    "",
    "Выплаты инвесторам",
    "Дата,Инвестор,Контейнер,Сумма USD",
    ...report.payouts.map((row) =>
      [row.payoutDate.toLocaleDateString("ru-RU"), row.investorName, row.containerName, row.amountUSD.toFixed(2)].join(","),
    ),
    "",
    "Возвраты",
    "Номер возврата,Дата,Счет,Клиент,Позиции,Сумма возврата USD",
    ...report.returns.map((row) =>
      [
        row.returnNumber,
        row.createdAt.toLocaleDateString("ru-RU"),
        row.invoiceNumber,
        row.clientName,
        row.itemsCount,
        row.totalReturnUSD.toFixed(2),
      ].join(","),
    ),
    "",
    "Инвентаризации",
    "Дата,Название,Статус,Расхождения",
    ...report.inventory.map((row) =>
      [row.createdAt.toLocaleDateString("ru-RU"), row.title, ruStatus(row.status), row.discrepancyCount].join(","),
    ),
  ];

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="period-${report.period.year}-${String(report.period.month).padStart(2, "0")}.csv"`,
    },
  });
}
