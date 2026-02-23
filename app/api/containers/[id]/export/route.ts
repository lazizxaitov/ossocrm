import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { CONTAINERS_VIEW_ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

type RouteParams = {
  params: Promise<{ id: string }>;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toCell(value: string | number) {
  if (typeof value === "number") {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function formatDate(value: Date | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ru-RU");
}

function formatNumber(value: number | null | undefined, fractionDigits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return Number(value.toFixed(fractionDigits));
}

export async function GET(_: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session || !CONTAINERS_VIEW_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 403 });
  }

  const { id } = await params;
  const container = await prisma.container.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: {
            include: {
              category: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!container) {
    return NextResponse.json({ error: "Контейнер не найден." }, { status: 404 });
  }

  const totalQty = container.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalByItems = container.items.reduce((sum, item) => sum + (item.lineTotalUSD ?? 0), 0);
  const totalCbm = container.items.reduce((sum, item) => sum + (item.totalCbm ?? 0), 0);
  const totalKg = container.items.reduce((sum, item) => sum + (item.kg ?? 0), 0);

  const topRows = [
    ["Контейнер", container.name],
    ["Статус", container.status],
    ["Дата закупки", formatDate(container.purchaseDate)],
    ["Дата прибытия", formatDate(container.arrivalDate)],
    ["Курс CNY → USD", formatNumber(container.exchangeRate, 4)],
    ["Закупка CNY", formatNumber(container.totalPurchaseCNY, 2)],
    ["Закупка USD", formatNumber(container.totalPurchaseUSD, 2)],
    ["Расходы USD", formatNumber(container.totalExpensesUSD, 2)],
    ["Итого позиций", container.items.length],
    ["Общее количество (QTY)", totalQty],
    ["Сумма товаров (USD)", formatNumber(totalByItems, 2)],
    ["Итого KG", formatNumber(totalKg, 2)],
    ["Итого TOTAL CBM", formatNumber(totalCbm, 4)],
  ];

  const headerRow = [
    "№",
    "Категория",
    "Модель / Товар",
    "SKU",
    "Размер",
    "Цвет",
    "QTY (set)",
    "Цена за ед. (USD)",
    "Сумма (USD)",
    "CBM",
    "KG",
    "TOTAL CBM",
    "Цена продажи (USD)",
  ];

  const dataRows = container.items.map((item, index) => [
    index + 1,
    item.product.category?.name ?? "Без категории",
    item.product.name,
    item.product.sku,
    item.sizeLabel ?? item.product.size ?? "",
    item.color ?? "",
    item.quantity,
    formatNumber(item.unitPriceUSD, 2),
    formatNumber(item.lineTotalUSD, 2),
    formatNumber(item.cbm, 4),
    formatNumber(item.kg, 2),
    formatNumber(item.totalCbm, 4),
    formatNumber(item.salePriceUSD, 2),
  ]);

  const xmlRows = [
    ...topRows.map((row) => `<Row>${toCell(String(row[0]))}${toCell((row[1] ?? "").toString())}</Row>`),
    "<Row/>",
    `<Row>${headerRow.map((cell) => toCell(cell)).join("")}</Row>`,
    ...dataRows.map((row) => `<Row>${row.map((cell) => toCell(typeof cell === "number" ? cell : String(cell ?? ""))).join("")}</Row>`),
  ].join("");

  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Worksheet ss:Name="Контейнер">
    <Table>
      ${xmlRows}
    </Table>
  </Worksheet>
</Workbook>`;

  const safeName = container.name.replace(/[\\/:*?"<>|]/g, "_");
  const fileName = `container-${safeName || container.id}.xls`;

  return new NextResponse(workbook, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
