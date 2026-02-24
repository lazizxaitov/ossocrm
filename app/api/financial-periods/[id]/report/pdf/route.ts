import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

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

  drawAtSafe(44, 792, "OSSO", 24, true, rgb(0.05, 0.12, 0.25));
  drawAtSafe(44, 774, "Otchet finansovogo ucheta i analitiki", 9, false, rgb(0.25, 0.33, 0.45));
  drawAtSafe(390, 794, "UTVERZHDENO", 9, true, rgb(0.1, 0.15, 0.25));
  drawAtSafe(390, 779, "Rukovoditel: ____________", 8.5, false, rgb(0.2, 0.25, 0.35));
  drawAtSafe(390, 766, "Data: ____________", 8.5, false, rgb(0.2, 0.25, 0.35));
  drawAtSafe(390, 753, "Podpis: ____________", 8.5, false, rgb(0.2, 0.25, 0.35));
  y = 728;

  drawText(`Otchet za period ${periodLabel}`, 16, true);
  drawText(`Sostoyanie: ${ruStatus(report.period.status)}`);
  drawText(
    `Diapazon: ${report.range.from.toLocaleDateString("ru-RU")} - ${report.range.to.toLocaleDateString("ru-RU")}`,
  );

  drawSectionTitle("KPI");
  drawText(`Vyruchka: ${report.kpi.revenue.toFixed(2)} USD`);
  drawText(`Sebestoimost: ${report.kpi.cogs.toFixed(2)} USD`);
  drawText(`Raskhody: ${report.kpi.expenses.toFixed(2)} USD`);
  drawText(`Chistaya pribyl: ${report.kpi.netProfit.toFixed(2)} USD`);
  drawText(`Dolg: ${report.kpi.debtTotal.toFixed(2)} USD`);
  drawText(`Dostupno k vyplate: ${report.kpi.availableToPayout.toFixed(2)} USD`);

  drawSectionTitle("Svodka");
  drawText(`Prodazh: ${report.summary.salesCount}`);
  drawText(`Prodazh zaversheno: ${report.summary.completedSales}`);
  drawText(`Prodazh chastichno oplacheno: ${report.summary.partialSales}`);
  drawText(`Prodazh v dolg: ${report.summary.debtSales}`);
  drawText(`Prosrochennykh dolgov: ${report.summary.overdueDebtCount}`);
  drawText(`Summa prosrochennogo dolga: ${report.summary.overdueDebtAmount.toFixed(2)} USD`);
  drawText(`Raskhodov: ${report.summary.expensesCount}`);
  drawText(`Korrektsii raskhodov: ${report.summary.totalCorrectionsUSD.toFixed(2)} USD`);
  drawText(`Vyplat investoram: ${report.summary.payoutsCount}`);
  drawText(`Inventarizatsii: ${report.summary.inventorySessionsCount}`);
  drawText(`Inventarizatsii s raskhozhdeniyami: ${report.summary.discrepancySessionsCount}`);
  drawText(`Konteynerov v operatsiyakh: ${report.summary.containersInvolved}`);

  drawSectionTitle("Prodazhi");
  if (!report.sales.length) {
    drawText("Net dannykh.");
  } else {
    for (const row of report.sales) {
      drawText(
        `${row.invoiceNumber} | ${row.createdAt.toLocaleDateString("ru-RU")} | ${row.clientName} | ${ruStatus(row.status)} | Itogo ${row.totalAmountUSD.toFixed(2)} | Oplacheno ${row.paidAmountUSD.toFixed(2)} | Dolg ${row.debtAmountUSD.toFixed(2)}`,
      );
    }
  }

  drawSectionTitle("Raskhody konteynerov");
  if (!report.expenses.length) {
    drawText("Net dannykh.");
  } else {
    for (const row of report.expenses) {
      drawText(
        `${row.createdAt.toLocaleDateString("ru-RU")} | ${row.containerName} | ${ruStatus(row.category)} | ${row.title} | ${row.amountUSD.toFixed(2)} + ${row.correctionSumUSD.toFixed(2)} = ${row.finalAmountUSD.toFixed(2)}`,
      );
    }
  }

  drawSectionTitle("Vyplaty investoram");
  if (!report.payouts.length) {
    drawText("Net dannykh.");
  } else {
    for (const row of report.payouts) {
      drawText(
        `${row.payoutDate.toLocaleDateString("ru-RU")} | ${row.investorName} | ${row.containerName} | ${row.amountUSD.toFixed(2)} USD`,
      );
    }
  }

  drawSectionTitle("Inventarizatsii");
  if (!report.inventory.length) {
    drawText("Net dannykh.");
  } else {
    for (const row of report.inventory) {
      drawText(
        `${row.createdAt.toLocaleDateString("ru-RU")} | ${row.title} | ${ruStatus(row.status)} | Raskhozhdeniya: ${row.discrepancyCount}`,
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
  drawAtSafe(36, y - 14, "Rukovoditel", 9, false, rgb(0.3, 0.35, 0.45));
  drawAtSafe(320, y - 14, "Glavnyy bukhgalter", 9, false, rgb(0.3, 0.35, 0.45));

  const bytes = await pdf.save();
  const fileName = `period-${report.period.year}-${String(report.period.month).padStart(2, "0")}.pdf`;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
