import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBrandLogoBytes } from "@/lib/brand-logo";
import { getPeriodReportData } from "@/lib/period-report";
import { PERIODS_VIEW_ROLES } from "@/lib/rbac";

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
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await getBrandLogoBytes(true);
  let logoImage: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  if (logoBytes) {
    try {
      logoImage = await pdf.embedPng(logoBytes);
    } catch {
      logoImage = null;
    }
  }

  let page = pdf.addPage([595, 842]);
  let y = 805;

  const ensurePage = (needed = 16) => {
    if (y > needed) return;
    page = pdf.addPage([595, 842]);
    y = 805;
  };

  const drawText = (text: string, size = 10, isBold = false, color = rgb(0.12, 0.15, 0.2)) => {
    ensurePage(size + 6);
    const drawRaw = (value: string) =>
      page.drawText(value, {
        x: 36,
        y,
        size,
        font: isBold ? bold : regular,
        color,
        maxWidth: 520,
        lineHeight: size + 2,
      });
    try {
      drawRaw(text);
    } catch {
      // Fallback avoids HTTP 500 when unsupported glyphs are present.
      const safe = text.replace(/[^\x20-\x7E]/g, " ");
      drawRaw(safe);
    }
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
  if (logoImage) {
    const targetWidth = 86;
    const scale = targetWidth / logoImage.width;
    page.drawImage(logoImage, {
      x: 44,
      y: 764,
      width: targetWidth,
      height: logoImage.height * scale,
    });
  } else {
    page.drawText("OSSO", {
      x: 44,
      y: 792,
      size: 24,
      font: bold,
      color: rgb(0.05, 0.12, 0.25),
    });
  }
  page.drawText("Финансовая система учета и аналитики", {
    x: 44,
    y: 774,
    size: 9,
    font: regular,
    color: rgb(0.25, 0.33, 0.45),
  });
  page.drawText("УТВЕРЖДЕНО", {
    x: 390,
    y: 794,
    size: 9,
    font: bold,
    color: rgb(0.1, 0.15, 0.25),
  });
  page.drawText("Руководитель: ____________", {
    x: 390,
    y: 779,
    size: 8.5,
    font: regular,
    color: rgb(0.2, 0.25, 0.35),
  });
  page.drawText("Дата: ____________", {
    x: 390,
    y: 766,
    size: 8.5,
    font: regular,
    color: rgb(0.2, 0.25, 0.35),
  });
  page.drawText("Подпись: ____________", {
    x: 390,
    y: 753,
    size: 8.5,
    font: regular,
    color: rgb(0.2, 0.25, 0.35),
  });
  y = 728;

  drawText(`Отчет по финансовому периоду ${periodLabel}`, 16, true);
  drawText(`Статус: ${report.period.status}`, 10);
  drawText(
    `Диапазон: ${report.range.from.toLocaleDateString("ru-RU")} - ${report.range.to.toLocaleDateString("ru-RU")}`,
    10,
  );

  drawSectionTitle("KPI");
  drawText(`Выручка: ${report.kpi.revenue.toFixed(2)} USD`);
  drawText(`Себестоимость: ${report.kpi.cogs.toFixed(2)} USD`);
  drawText(`Расходы: ${report.kpi.expenses.toFixed(2)} USD`);
  drawText(`Чистая прибыль: ${report.kpi.netProfit.toFixed(2)} USD`);
  drawText(`Долги: ${report.kpi.debtTotal.toFixed(2)} USD`);
  drawText(`Доступно к выплате инвесторам: ${report.kpi.availableToPayout.toFixed(2)} USD`);

  drawSectionTitle("Сводка");
  drawText(`Продаж: ${report.summary.salesCount}`);
  drawText(`Продаж COMPLETED: ${report.summary.completedSales}`);
  drawText(`Продаж PARTIALLY_PAID: ${report.summary.partialSales}`);
  drawText(`Продаж DEBT: ${report.summary.debtSales}`);
  drawText(`Просроченных долгов: ${report.summary.overdueDebtCount}`);
  drawText(`Сумма просроченного долга: ${report.summary.overdueDebtAmount.toFixed(2)} USD`);
  drawText(`Расходов: ${report.summary.expensesCount}`);
  drawText(`Корректировки расходов: ${report.summary.totalCorrectionsUSD.toFixed(2)} USD`);
  drawText(`Выплат инвесторам: ${report.summary.payoutsCount}`);
  drawText(`Инвентаризаций: ${report.summary.inventorySessionsCount}`);
  drawText(`Инвентаризаций с расхождениями: ${report.summary.discrepancySessionsCount}`);
  drawText(`Контейнеров в операциях: ${report.summary.containersInvolved}`);

  drawSectionTitle("Продажи");
  if (report.sales.length === 0) {
    drawText("Нет данных.");
  } else {
    for (const row of report.sales) {
      drawText(
        `${row.invoiceNumber} | ${row.createdAt.toLocaleDateString("ru-RU")} | ${row.clientName} | ${row.status} | Итого ${row.totalAmountUSD.toFixed(2)} | Оплачено ${row.paidAmountUSD.toFixed(2)} | Долг ${row.debtAmountUSD.toFixed(2)}`
      );
    }
  }

  drawSectionTitle("Расходы контейнеров");
  if (report.expenses.length === 0) {
    drawText("Нет данных.");
  } else {
    for (const row of report.expenses) {
      drawText(
        `${row.createdAt.toLocaleDateString("ru-RU")} | ${row.containerName} | ${row.category} | ${row.title} | ${row.amountUSD.toFixed(2)} + ${row.correctionSumUSD.toFixed(2)} = ${row.finalAmountUSD.toFixed(2)}`
      );
    }
  }

  drawSectionTitle("Выплаты инвесторам");
  if (report.payouts.length === 0) {
    drawText("Нет данных.");
  } else {
    for (const row of report.payouts) {
      drawText(
        `${row.payoutDate.toLocaleDateString("ru-RU")} | ${row.investorName} | ${row.containerName} | ${row.amountUSD.toFixed(2)} USD`
      );
    }
  }

  drawSectionTitle("Инвентаризации");
  if (report.inventory.length === 0) {
    drawText("Нет данных.");
  } else {
    for (const row of report.inventory) {
      drawText(
        `${row.createdAt.toLocaleDateString("ru-RU")} | ${row.title} | ${row.status} | Расхождения: ${row.discrepancyCount}`,
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
  page.drawText("Руководитель", {
    x: 36,
    y: y - 14,
    size: 9,
    font: regular,
    color: rgb(0.3, 0.35, 0.45),
  });
  page.drawText("Главный бухгалтер", {
    x: 320,
    y: y - 14,
    size: 9,
    font: regular,
    color: rgb(0.3, 0.35, 0.45),
  });

  const bytes = await pdf.save();
  const fileName = `period-${report.period.year}-${String(report.period.month).padStart(2, "0")}.pdf`;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
