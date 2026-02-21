import { InventorySessionStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessWarehouseApi } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

type CorrectionPayload = { sessionId?: string };

// Inventory must be non-destructive: this endpoint no longer changes stock quantities.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !canAccessWarehouseApi(session.role)) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 403 });
  }

  let payload: CorrectionPayload;
  try {
    payload = (await request.json()) as CorrectionPayload;
  } catch {
    return NextResponse.json({ error: "Некорректный формат запроса." }, { status: 400 });
  }

  const sessionId = String(payload.sessionId ?? "");
  if (!sessionId) {
    return NextResponse.json({ error: "Не указан идентификатор инвентаризации." }, { status: 400 });
  }

  const inventorySession = await prisma.inventorySession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true, createdById: true },
  });

  if (!inventorySession) {
    return NextResponse.json({ error: "Инвентаризация не найдена." }, { status: 404 });
  }

  const isAdmin = session.role === "SUPER_ADMIN" || session.role === "ADMIN";
  if (!isAdmin && inventorySession.createdById !== session.userId) {
    return NextResponse.json({ error: "Недостаточно прав." }, { status: 403 });
  }

  if (inventorySession.status !== InventorySessionStatus.DISCREPANCY) {
    return NextResponse.json({ error: "Корректировка доступна только при расхождениях." }, { status: 400 });
  }

  await prisma.inventorySession.update({
    where: { id: inventorySession.id },
    data: { sentToAdminAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    message: "Расхождения отмечены и отправлены администратору. Остатки не изменялись.",
  });
}
