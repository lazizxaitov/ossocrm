import { PDFDocument, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { formatUsd } from "@/lib/currency";
import { fitPdfText, loadPdfFonts, toPdfText } from "@/lib/pdf-font";
import { prisma } from "@/lib/prisma";
import { SALES_VIEW_ROLES } from "@/lib/rbac";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session || !SALES_VIEW_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 403 });
  }

  const { id } = await params;
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      client: true,
      items: {
        include: {
          product: {
            include: {
              category: { select: { name: true } },
            },
          },
        },
      },
      returns: {
        orderBy: { createdAt: "asc" },
        select: { id: true, returnNumber: true, createdAt: true, totalReturnUSD: true },
      },
    },
  });

  if (!sale) {
    return NextResponse.json({ error: "Продажа не найдена." }, { status: 404 });
  }

  const returnIds = sale.returns.map((ret) => ret.id);
  const exchangeReturnIds = new Set<string>();
  if (returnIds.length > 0) {
    const returnLogs = await prisma.auditLog.findMany({
      where: {
        action: "CREATE_RETURN",
        entityType: "Return",
        entityId: { in: returnIds },
      },
      select: { entityId: true, metadata: true },
    });
    for (const log of returnLogs) {
      try {
        const meta = log.metadata ? (JSON.parse(log.metadata) as { mode?: string }) : null;
        if (meta?.mode === "exchange") {
          exchangeReturnIds.add(log.entityId);
        }
      } catch {
        // ignore broken metadata
      }
    }
  }

  const totalsByCategory = sale.items.reduce(
    (acc, item) => {
      const category = item.product.category?.name ?? "";
      if (category === "Тумбы") {
        acc.vanity += item.totalUSD;
      } else if (category === "Аксессуары" || item.product.name.toLowerCase().includes("аксессуар")) {
        acc.accessory += item.totalUSD;
      } else {
        acc.plumbing += item.totalUSD;
      }
      return acc;
    },
    { plumbing: 0, vanity: 0, accessory: 0 },
  );

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const { regular, bold, cyrillicSupported } = await loadPdfFonts(pdf);

  const draw = (text: string, x: number, y: number, size = 10, isBold = false) => {
    page.drawText(toPdfText(text, cyrillicSupported), {
      x,
      y,
      size,
      font: isBold ? bold : regular,
      color: rgb(0.1, 0.1, 0.12),
    });
  };

  let y = 800;
  draw("OSSO", 40, y, 18, true);
  y -= 24;
  draw("Счет", 40, y, 14, true);
  y -= 18;
  draw(`Номер: ${sale.invoiceNumber}`, 40, y);
  y -= 14;
  draw(`Дата: ${new Date(sale.createdAt).toLocaleString("ru-RU")}`, 40, y);
  y -= 14;
  draw(`Клиент: ${sale.client.name}`, 40, y);
  y -= 26;

  draw("Товар", 40, y, 10, true);
  draw("Кол-во", 290, y, 10, true);
  draw("Цена", 370, y, 10, true);
  draw("Сумма", 470, y, 10, true);
  y -= 12;
  page.drawLine({
    start: { x: 40, y },
    end: { x: 555, y },
    thickness: 0.7,
    color: rgb(0.7, 0.7, 0.75),
  });
  y -= 14;

  for (const item of sale.items) {
    const rowText = `${item.product.name} (${item.product.sku})`;
    const fitted = fitPdfText(toPdfText(rowText, cyrillicSupported), regular, 10, 235);
    draw(fitted, 40, y);
    draw(String(item.quantity), 290, y);
    draw(`$${item.salePricePerUnitUSD.toFixed(2)}`, 370, y);
    draw(formatUsd(item.totalUSD), 470, y);
    y -= 16;
    if (y < 190) break;
  }

  y -= 8;
  page.drawLine({
    start: { x: 40, y },
    end: { x: 555, y },
    thickness: 0.7,
    color: rgb(0.7, 0.7, 0.75),
  });
  y -= 18;

  draw(`Итого: ${formatUsd(sale.totalAmountUSD)}`, 360, y, 11, true);
  y -= 14;
  draw(`Сантехника: ${formatUsd(totalsByCategory.plumbing)}`, 320, y, 10);
  y -= 12;
  draw(`Тумбы: ${formatUsd(totalsByCategory.vanity)}`, 320, y, 10);
  y -= 12;
  if (totalsByCategory.accessory > 0) {
    draw(`Аксессуары: ${formatUsd(totalsByCategory.accessory)}`, 320, y, 10);
    y -= 12;
  }
  draw(`Оплачено: ${formatUsd(sale.paidAmountUSD)}`, 360, y, 11, true);
  y -= 14;
  draw(`Долг: ${formatUsd(sale.debtAmountUSD)}`, 360, y, 11, true);
  y -= 24;

  draw("История возвратов", 40, y, 11, true);
  y -= 14;
  if (!sale.returns.length) {
    draw("Возвратов по этому счету нет.", 40, y, 10);
  } else {
    for (const ret of sale.returns) {
      const modeLabel = exchangeReturnIds.has(ret.id) ? " | Замена" : "";
      const line = `${ret.returnNumber} | ${ret.createdAt.toLocaleDateString("ru-RU")} | ${formatUsd(ret.totalReturnUSD)}${modeLabel}`;
      draw(line, 40, y, 10);
      y -= 14;
      if (y < 36) break;
    }
  }

  const bytes = await pdf.save();
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${sale.invoiceNumber}.pdf"`,
    },
  });
}
