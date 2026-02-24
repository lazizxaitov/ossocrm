import { PDFDocument, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadPdfFonts, toPdfText } from "@/lib/pdf-font";
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

  const pdf = await PDFDocument.create();
  const { regular, bold, cyrillicSupported } = await loadPdfFonts(pdf);

  let page = pdf.addPage([595, 842]);
  let y = 805;

  const ensurePage = (needed = 16) => {
    if (y > needed) return;
    page = pdf.addPage([595, 842]);
    y = 805;
  };

  const drawAt = (
    x: number,
    yy: number,
    text: string,
    size = 10,
    isBold = false,
    color = rgb(0.12, 0.15, 0.2),
  ) => {
    page.drawText(toPdfText(text, cyrillicSupported), {
      x,
      y: yy,
      size,
      font: isBold ? bold : regular,
      color,
      maxWidth: 520,
      lineHeight: size + 2,
    });
  };

  const drawText = (text: string, size = 10, isBold = false, color = rgb(0.12, 0.15, 0.2)) => {
    ensurePage(size + 6);
    drawAt(36, y, text, size, isBold, color);
    y -= size + 6;
  };

  const drawSectionTitle = (text: string) => {
    y -= 4;
    drawText(text, 12, true);
  };

  const periodLabel = `${String(report.period.month).padStart(2, "0")}.${report.period.year}`;

  page.drawRectangle({
    x: 32,
    y: 742,
    width: 531,
    height: 78,
    borderColor: rgb(0.75, 0.8, 0.88),
    borderWidth: 1,
    color: rgb(0.97, 0.98, 1),
  });

  drawAt(44, 792, "OSSO", 24, true, rgb(0.05, 0.12, 0.25));
  drawAt(44, 774, "Финансовая система учета и аналитики", 9, false, rgb(0.25, 0.33, 0.45));
  drawAt(390, 794, "УТВЕРЖДЕНО", 9, true, rgb(0.1, 0.15, 0.25));
  drawAt(390, 779, "Руководитель: ____________", 8.5, false, rgb(0.2, 0.25, 0.35));
  drawAt(390, 766, "Дата: ____________", 8.5, false, rgb(0.2, 0.25, 0.35));
  drawAt(390, 753, "Подпись: ____________", 8.5, false, rgb(0.2, 0.25, 0.35));
  y = 728;

  drawText(`Отчет за период ${periodLabel}`, 16, true);
  drawText(`Статус: ${ruStatus(report.period.status)}`);
  drawText(`Диапазон: ${report.range.from.toLocaleDateString("ru-RU")} - ${report.range.to.toLocaleDateString("ru-RU")}`);

  drawSectionTitle("KPI");
  drawText(`Выручка: ${report.kpi.revenue.toFixed(2)} USD`);
  drawText(`Себестоимость: ${report.kpi.cogs.toFixed(2)} USD`);
  drawText(`Расходы: ${report.kpi.expenses.toFixed(2)} USD`);
  drawText(`Чистая прибыль: ${report.kpi.netProfit.toFixed(2)} USD`);
  drawText(`Долг: ${report.kpi.debtTotal.toFixed(2)} USD`);
  drawText(`Доступно к выплате: ${report.kpi.availableToPayout.toFixed(2)} USD`);

  drawSectionTitle("Сводка");
  drawText(`Продаж: ${report.summary.salesCount}`);
  drawText(`Продаж завершено: ${report.summary.completedSales}`);
  drawText(`Продаж частично оплачено: ${report.summary.partialSales}`);
  drawText(`Продаж в долг: ${report.summary.debtSales}`);
  drawText(`Просроченных долгов: ${report.summary.overdueDebtCount}`);
  drawText(`Сумма просроченного долга: ${report.summary.overdueDebtAmount.toFixed(2)} USD`);
  drawText(`Расходов: ${report.summary.expensesCount}`);
  drawText(`Коррекции расходов: ${report.summary.totalCorrectionsUSD.toFixed(2)} USD`);
  drawText(`Выплат инвесторам: ${report.summary.payoutsCount}`);
  drawText(`Возвратов: ${report.summary.returnsCount}`);
  drawText(`Сумма возвратов: ${report.summary.totalReturnsUSD.toFixed(2)} USD`);
  drawText(`Инвентаризаций: ${report.summary.inventorySessionsCount}`);
  drawText(`Инвентаризаций с расхождениями: ${report.summary.discrepancySessionsCount}`);
  drawText(`Контейнеров в операциях: ${report.summary.containersInvolved}`);

  drawSectionTitle("Продажи");
  if (!report.sales.length) {
    drawText("Нет данных.");
  } else {
    for (const row of report.sales) {
      drawText(
        `${row.invoiceNumber} | ${row.createdAt.toLocaleDateString("ru-RU")} | ${row.clientName} | ${ruStatus(row.status)} | Итого ${row.totalAmountUSD.toFixed(2)} | Оплачено ${row.paidAmountUSD.toFixed(2)} | Долг ${row.debtAmountUSD.toFixed(2)}`,
      );
    }
  }

  drawSectionTitle("Расходы контейнеров");
  if (!report.expenses.length) {
    drawText("Нет данных.");
  } else {
    for (const row of report.expenses) {
      drawText(
        `${row.createdAt.toLocaleDateString("ru-RU")} | ${row.containerName} | ${ruStatus(row.category)} | ${row.title} | ${row.amountUSD.toFixed(2)} + ${row.correctionSumUSD.toFixed(2)} = ${row.finalAmountUSD.toFixed(2)}`,
      );
    }
  }

  drawSectionTitle("Выплаты инвесторам");
  if (!report.payouts.length) {
    drawText("Нет данных.");
  } else {
    for (const row of report.payouts) {
      drawText(
        `${row.payoutDate.toLocaleDateString("ru-RU")} | ${row.investorName} | ${row.containerName} | ${row.amountUSD.toFixed(2)} USD`,
      );
    }
  }

  drawSectionTitle("Возвраты");
  if (!report.returns.length) {
    drawText("Нет данных.");
  } else {
    for (const row of report.returns) {
      drawText(
        `${row.returnNumber} | ${row.createdAt.toLocaleDateString("ru-RU")} | ${row.invoiceNumber} | ${row.clientName} | Позиций ${row.itemsCount} | Сумма ${row.totalReturnUSD.toFixed(2)} USD`,
      );
    }
  }

  drawSectionTitle("Инвентаризации");
  if (!report.inventory.length) {
    drawText("Нет данных.");
  } else {
    for (const row of report.inventory) {
      drawText(
        `${row.createdAt.toLocaleDateString("ru-RU")} | ${row.title} | ${ruStatus(row.status)} | Расхождения: ${row.discrepancyCount}`,
      );
    }
  }

  y -= 10;
  ensurePage(60);
  page.drawLine({
    start: { x: 36, y },
    end: { x: 250, y },
    thickness: 0.8,
    color: rgb(0.55, 0.6, 0.68),
  });
  page.drawLine({
    start: { x: 320, y },
    end: { x: 540, y },
    thickness: 0.8,
    color: rgb(0.55, 0.6, 0.68),
  });
  drawAt(36, y - 14, "Руководитель", 9, false, rgb(0.3, 0.35, 0.45));
  drawAt(320, y - 14, "Главный бухгалтер", 9, false, rgb(0.3, 0.35, 0.45));

  const bytes = await pdf.save();
  const fileName = `period-${report.period.year}-${String(report.period.month).padStart(2, "0")}.pdf`;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
