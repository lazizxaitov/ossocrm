import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBrandLogoDataUri } from "@/lib/brand-logo";
import { getPeriodReportData } from "@/lib/period-report";
import { PERIODS_VIEW_ROLES } from "@/lib/rbac";

type RouteParams = { params: Promise<{ id: string }> };

function esc(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function table(headers: string[], rows: string[][]) {
  return `
    <table>
      <thead>
        <tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
          .join("")}
      </tbody>
    </table>
  `;
}

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
  const logoDataUri = await getBrandLogoDataUri(true);

  const monthLabel = `${String(report.period.month).padStart(2, "0")}.${report.period.year}`;
  const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Отчет за период ${monthLabel}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 8px 0; }
    h2 { font-size: 15px; margin: 20px 0 8px; }
    p { margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    .head { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    .head td { border: none; vertical-align: top; padding: 0; }
    .brand { font-size: 28px; font-weight: 700; letter-spacing: 1px; color: #0f172a; }
    .brand-logo { width: 118px; height: auto; display: block; border-radius: 6px; }
    .sub { color: #334155; font-size: 12px; margin-top: 2px; }
    .approve { border: 1px solid #cbd5e1; padding: 10px; width: 260px; margin-left: auto; font-size: 11px; }
    .approve p { margin: 2px 0; }
    .line { display: inline-block; min-width: 130px; border-bottom: 1px solid #475569; height: 12px; vertical-align: bottom; }
    .footer-sign { margin-top: 24px; width: 100%; border-collapse: collapse; }
    .footer-sign td { width: 50%; border: none; padding-top: 18px; }
    .sign-label { color: #475569; margin-bottom: 16px; }
  </style>
</head>
<body>
  <table class="head">
    <tr>
      <td>
        ${logoDataUri ? `<img src="${logoDataUri}" alt="OSSO" class="brand-logo" />` : `<div class="brand">OSSO</div>`}
        <div class="sub">Финансовая система учета и аналитики</div>
      </td>
      <td>
        <div class="approve">
          <p><strong>УТВЕРЖДЕНО</strong></p>
          <p>Руководитель: <span class="line"></span></p>
          <p>Дата: <span class="line"></span></p>
          <p>Подпись: <span class="line"></span></p>
        </div>
      </td>
    </tr>
  </table>

  <h1>Отчет по финансовому периоду ${esc(monthLabel)}</h1>
  <p><strong>Статус:</strong> ${esc(report.period.status)}</p>
  <p><strong>Диапазон:</strong> ${esc(report.range.from.toLocaleDateString("ru-RU"))} - ${esc(report.range.to.toLocaleDateString("ru-RU"))}</p>

  <h2>KPI</h2>
  ${table(
    ["Показатель", "Значение"],
    [
      ["Выручка", report.kpi.revenue.toFixed(2)],
      ["Себестоимость", report.kpi.cogs.toFixed(2)],
      ["Расходы", report.kpi.expenses.toFixed(2)],
      ["Чистая прибыль", report.kpi.netProfit.toFixed(2)],
      ["Долги", report.kpi.debtTotal.toFixed(2)],
      ["Доступно к выплате инвесторам", report.kpi.availableToPayout.toFixed(2)],
    ],
  )}

  <h2>Сводка</h2>
  ${table(
    ["Метрика", "Значение"],
    [
      ["Продаж", String(report.summary.salesCount)],
      ["Продаж COMPLETED", String(report.summary.completedSales)],
      ["Продаж PARTIALLY_PAID", String(report.summary.partialSales)],
      ["Продаж DEBT", String(report.summary.debtSales)],
      ["Просроченных долгов", String(report.summary.overdueDebtCount)],
      ["Сумма просроченного долга USD", report.summary.overdueDebtAmount.toFixed(2)],
      ["Расходов", String(report.summary.expensesCount)],
      ["Сумма корректировок расходов USD", report.summary.totalCorrectionsUSD.toFixed(2)],
      ["Выплат инвесторам", String(report.summary.payoutsCount)],
      ["Инвентаризаций", String(report.summary.inventorySessionsCount)],
      ["Инвентаризаций с расхождениями", String(report.summary.discrepancySessionsCount)],
      ["Контейнеров в операциях", String(report.summary.containersInvolved)],
    ],
  )}

  <h2>Продажи</h2>
  ${table(
    ["Invoice", "Дата", "Клиент", "Статус", "Позиции", "Итого USD", "Оплачено USD", "Долг USD", "Срок оплаты"],
    report.sales.map((row) => [
      row.invoiceNumber,
      row.createdAt.toLocaleDateString("ru-RU"),
      row.clientName,
      row.status,
      String(row.itemsCount),
      row.totalAmountUSD.toFixed(2),
      row.paidAmountUSD.toFixed(2),
      row.debtAmountUSD.toFixed(2),
      row.dueDate ? row.dueDate.toLocaleDateString("ru-RU") : "-",
    ]),
  )}

  <h2>Расходы контейнеров</h2>
  ${table(
    ["Дата", "Контейнер", "Категория", "Название", "Сумма USD", "Коррекции USD", "Итог USD", "Неподтв. корректировки"],
    report.expenses.map((row) => [
      row.createdAt.toLocaleDateString("ru-RU"),
      row.containerName,
      row.category,
      row.title,
      row.amountUSD.toFixed(2),
      row.correctionSumUSD.toFixed(2),
      row.finalAmountUSD.toFixed(2),
      String(row.unconfirmedCorrections),
    ]),
  )}

  <h2>Выплаты инвесторам</h2>
  ${table(
    ["Дата", "Инвестор", "Контейнер", "Сумма USD"],
    report.payouts.map((row) => [
      row.payoutDate.toLocaleDateString("ru-RU"),
      row.investorName,
      row.containerName,
      row.amountUSD.toFixed(2),
    ]),
  )}

  <h2>Инвентаризации</h2>
  ${table(
    ["Дата", "Название", "Статус", "Расхождения"],
    report.inventory.map((row) => [
      row.createdAt.toLocaleDateString("ru-RU"),
      row.title,
      row.status,
      String(row.discrepancyCount),
    ]),
  )}

  <table class="footer-sign">
    <tr>
      <td>
        <div class="sign-label">Руководитель</div>
        <div class="line"></div>
      </td>
      <td>
        <div class="sign-label">Главный бухгалтер</div>
        <div class="line"></div>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const fileName = `period-${report.period.year}-${String(report.period.month).padStart(2, "0")}.doc`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
