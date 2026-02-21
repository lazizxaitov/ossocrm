import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessWarehouseApi } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

type SendPayload = { sessionId?: string };

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !canAccessWarehouseApi(session.role)) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 403 });
  }

  let payload: SendPayload;
  try {
    payload = (await request.json()) as SendPayload;
  } catch {
    return NextResponse.json({ error: "Некорректный формат запроса." }, { status: 400 });
  }

  const sessionId = String(payload.sessionId ?? "");
  if (!sessionId) {
    return NextResponse.json({ error: "Не указан идентификатор инвентаризации." }, { status: 400 });
  }

  const inventorySession = await prisma.inventorySession.findUnique({
    where: { id: sessionId },
    select: { id: true, createdById: true },
  });

  if (!inventorySession) {
    return NextResponse.json({ error: "Инвентаризация не найдена." }, { status: 404 });
  }

  const isAdmin = session.role === "SUPER_ADMIN" || session.role === "ADMIN";
  if (!isAdmin && inventorySession.createdById !== session.userId) {
    return NextResponse.json({ error: "Недостаточно прав." }, { status: 403 });
  }

  await prisma.inventorySession.update({
    where: { id: sessionId },
    data: { sentToAdminAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
