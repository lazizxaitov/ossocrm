import { InventorySessionStatus } from "@prisma/client";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertOpenPeriodById, getCurrentFinancialPeriod } from "@/lib/financial-period";
import { canAccessWarehouseApi, generateInventoryCode, refreshSystemControlByInventory } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

type SubmitPayload = {
  title?: string;
  items?: Array<{
    containerItemId: string;
    actualQuantity: number;
  }>;
};

export async function GET() {
  const session = await getSession();
  if (!session || !canAccessWarehouseApi(session.role)) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 403 });
  }

  const items = await prisma.containerItem.findMany({
    where: { container: { status: "ARRIVED" } },
    include: {
      product: { select: { name: true, sku: true } },
      container: { select: { name: true, status: true } },
    },
    orderBy: [{ product: { name: "asc" } }, { container: { name: "asc" } }],
  });

  return NextResponse.json({
    rows: items.map((item) => ({
      containerItemId: item.id,
      productId: item.productId,
      productName: item.product.name,
      sku: item.product.sku,
      containerId: item.containerId,
      containerName: item.container.name,
      containerStatus: item.container.status,
    })),
    total: items.length,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !canAccessWarehouseApi(session.role)) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 403 });
  }

  let payload: SubmitPayload;
  try {
    payload = (await request.json()) as SubmitPayload;
  } catch {
    return NextResponse.json({ error: "Некорректный формат запроса." }, { status: 400 });
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return NextResponse.json({ error: "Передайте фактические количества." }, { status: 400 });
  }

  const normalized = payload.items.map((row) => ({
    containerItemId: String(row.containerItemId ?? ""),
    actualQuantity: Number(row.actualQuantity ?? 0),
  }));

  if (normalized.some((row) => !row.containerItemId || !Number.isFinite(row.actualQuantity) || row.actualQuantity < 0)) {
    return NextResponse.json({ error: "Количество должно быть числом от 0." }, { status: 400 });
  }

  const itemIds = [...new Set(normalized.map((row) => row.containerItemId))];
  const systemItems = await prisma.containerItem.findMany({
    where: { id: { in: itemIds } },
    include: {
      product: { select: { name: true, sku: true } },
      container: { select: { name: true, status: true } },
    },
  });

  if (systemItems.length !== itemIds.length) {
    return NextResponse.json({ error: "Часть складских позиций не найдена." }, { status: 404 });
  }

  if (systemItems.some((item) => item.container.status !== "ARRIVED")) {
    return NextResponse.json(
      { error: "Инвентаризация доступна только для прибывших контейнеров." },
      { status: 400 },
    );
  }

  let currentPeriodId = "";
  try {
    const currentPeriod = await getCurrentFinancialPeriod();
    await assertOpenPeriodById(currentPeriod.id);
    currentPeriodId = currentPeriod.id;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Период закрыт для инвентаризации." },
      { status: 400 },
    );
  }
  const actualById = new Map(normalized.map((row) => [row.containerItemId, Math.floor(row.actualQuantity)]));

  const itemRows = systemItems.map((item) => {
    const actualQuantity = actualById.get(item.id) ?? 0;
    const difference = actualQuantity - item.quantity;
    return {
      containerItemId: item.id,
      containerId: item.containerId,
      productId: item.productId,
      productName: item.product.name,
      sku: item.product.sku,
      containerName: item.container.name,
      systemQuantity: item.quantity,
      actualQuantity,
      difference,
    };
  });

  const discrepancyRows = itemRows.filter((row) => row.difference !== 0);
  const status =
    discrepancyRows.length > 0 ? InventorySessionStatus.DISCREPANCY : InventorySessionStatus.PENDING;
  const code =
    status === InventorySessionStatus.DISCREPANCY
      ? `DISC-${randomUUID()}`
      : await generateInventoryCode();

  const created = await prisma.$transaction(async (tx) => {
    const sessionRecord = await tx.inventorySession.create({
      data: {
        title: payload.title?.trim() || `Инвентаризация ${new Date().toLocaleString("ru-RU")}`,
        code,
        status,
        discrepancyCount: discrepancyRows.length,
        financialPeriodId: currentPeriodId,
        createdById: session.userId,
      },
    });

    await tx.inventorySessionItem.createMany({
      data: itemRows.map((row) => ({
        inventorySessionId: sessionRecord.id,
        productId: row.productId,
        containerId: row.containerId,
        containerItemId: row.containerItemId,
        systemQuantity: row.systemQuantity,
        actualQuantity: row.actualQuantity,
        difference: row.difference,
      })),
    });

    return sessionRecord;
  });

  await refreshSystemControlByInventory();

  const shortage = discrepancyRows
    .filter((row) => row.difference < 0)
    .map((row) => ({
      productName: row.productName,
      sku: row.sku,
      containerName: row.containerName,
      systemQuantity: row.systemQuantity,
      actualQuantity: row.actualQuantity,
      difference: row.difference,
    }));
  const excess = discrepancyRows
    .filter((row) => row.difference > 0)
    .map((row) => ({
      productName: row.productName,
      sku: row.sku,
      containerName: row.containerName,
      systemQuantity: row.systemQuantity,
      actualQuantity: row.actualQuantity,
      difference: row.difference,
    }));

  return NextResponse.json({
    sessionId: created.id,
    code: created.status === InventorySessionStatus.DISCREPANCY ? null : created.code,
    status: created.status,
    discrepancyCount: discrepancyRows.length,
    shortage,
    excess,
  });
}
