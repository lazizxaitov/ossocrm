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

  const drawAtSafe = (
    x: number,
    yy: number,
    text: string,
    size = 10,
    isBold = false,
    color = rgb(0.12, 0.15, 0.2),
  ) => {
    const drawRaw = (value: string) =>
      page.drawText(value, {
        x,
        y: yy,
        size,
        font: isBold ? bold : regular,
        color,
        maxWidth: 520,
        lineHeight: size + 2,
      });
    try {
      drawRaw(text);
    } catch {
      drawRaw(text.replace(/[^\x20-\x7E]/g, " "));
    }
  };

  const drawText = (text: string, size = 10, isBold = false, color = rgb(0.12, 0.15, 0.2)) => {
    ensurePage(size + 6);
    drawAtSafe(36, y, text, size, isBold, color);
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
    drawAtSafe(44, 792, "OSSO", 24, true, rgb(0.05, 0.12, 0.25));
  }

  drawAtSafe(44, 774, "Financial accounting and analytics system", 9, false, rgb(0.25, 0.33, 0.45));
  drawAtSafe(390, 794, "APPROVED", 9, true, rgb(0.1, 0.15, 0.25));
  drawAtSafe(390, 779, "Director: ____________", 8.5, false, rgb(0.2, 0.25, 0.35));
  drawAtSafe(390, 766, "Date: ____________", 8.5, false, rgb(0.2, 0.25, 0.35));
  drawAtSafe(390, 753, "Signature: ____________", 8.5, false, rgb(0.2, 0.25, 0.35));
  y = 728;

  drawText(`Period report ${periodLabel}`, 16, true);
  drawText(`Status: ${report.period.status}`);
  drawText(
    `Range: ${report.range.from.toLocaleDateString("ru-RU")} - ${report.range.to.toLocaleDateString("ru-RU")}`,
  );

  drawSectionTitle("KPI");
  drawText(`Revenue: ${report.kpi.revenue.toFixed(2)} USD`);
  drawText(`COGS: ${report.kpi.cogs.toFixed(2)} USD`);
  drawText(`Expenses: ${report.kpi.expenses.toFixed(2)} USD`);
  drawText(`Net profit: ${report.kpi.netProfit.toFixed(2)} USD`);
  drawText(`Debt: ${report.kpi.debtTotal.toFixed(2)} USD`);
  drawText(`Available to payout: ${report.kpi.availableToPayout.toFixed(2)} USD`);

  drawSectionTitle("Summary");
  drawText(`Sales: ${report.summary.salesCount}`);
  drawText(`Completed sales: ${report.summary.completedSales}`);
  drawText(`Partially paid sales: ${report.summary.partialSales}`);
  drawText(`Debt sales: ${report.summary.debtSales}`);
  drawText(`Overdue debts: ${report.summary.overdueDebtCount}`);
  drawText(`Overdue amount: ${report.summary.overdueDebtAmount.toFixed(2)} USD`);
  drawText(`Expenses count: ${report.summary.expensesCount}`);
  drawText(`Expense corrections: ${report.summary.totalCorrectionsUSD.toFixed(2)} USD`);
  drawText(`Investor payouts: ${report.summary.payoutsCount}`);
  drawText(`Inventory sessions: ${report.summary.inventorySessionsCount}`);
  drawText(`Sessions with discrepancy: ${report.summary.discrepancySessionsCount}`);
  drawText(`Containers involved: ${report.summary.containersInvolved}`);

  drawSectionTitle("Sales");
  if (!report.sales.length) {
    drawText("No data.");
  } else {
    for (const row of report.sales) {
      drawText(
        `${row.invoiceNumber} | ${row.createdAt.toLocaleDateString("ru-RU")} | ${row.clientName} | ${row.status} | Total ${row.totalAmountUSD.toFixed(2)} | Paid ${row.paidAmountUSD.toFixed(2)} | Debt ${row.debtAmountUSD.toFixed(2)}`,
      );
    }
  }

  drawSectionTitle("Container expenses");
  if (!report.expenses.length) {
    drawText("No data.");
  } else {
    for (const row of report.expenses) {
      drawText(
        `${row.createdAt.toLocaleDateString("ru-RU")} | ${row.containerName} | ${row.category} | ${row.title} | ${row.amountUSD.toFixed(2)} + ${row.correctionSumUSD.toFixed(2)} = ${row.finalAmountUSD.toFixed(2)}`,
      );
    }
  }

  drawSectionTitle("Investor payouts");
  if (!report.payouts.length) {
    drawText("No data.");
  } else {
    for (const row of report.payouts) {
      drawText(
        `${row.payoutDate.toLocaleDateString("ru-RU")} | ${row.investorName} | ${row.containerName} | ${row.amountUSD.toFixed(2)} USD`,
      );
    }
  }

  drawSectionTitle("Inventory");
  if (!report.inventory.length) {
    drawText("No data.");
  } else {
    for (const row of report.inventory) {
      drawText(
        `${row.createdAt.toLocaleDateString("ru-RU")} | ${row.title} | ${row.status} | Diff: ${row.discrepancyCount}`,
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
  drawAtSafe(36, y - 14, "Director", 9, false, rgb(0.3, 0.35, 0.45));
  drawAtSafe(320, y - 14, "Chief accountant", 9, false, rgb(0.3, 0.35, 0.45));

  const bytes = await pdf.save();
  const fileName = `period-${report.period.year}-${String(report.period.month).padStart(2, "0")}.pdf`;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
