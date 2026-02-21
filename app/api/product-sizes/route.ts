import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRODUCTS_MANAGE_ROLES } from "@/lib/rbac";

type CreateSizePayload = {
  name?: string;
};

type UpdateSizePayload = {
  id?: string;
  name?: string;
};

type DeleteSizePayload = {
  id?: string;
};

async function requireManagerAccess() {
  const session = await getSession();
  if (!session || !PRODUCTS_MANAGE_ROLES.includes(session.role)) {
    return null;
  }
  return session;
}

export async function GET() {
  const session = await requireManagerAccess();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 403 });
  }

  const sizes = await prisma.productSize.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json({ ok: true, sizes });
}

export async function POST(request: Request) {
  const session = await requireManagerAccess();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 403 });
  }

  let payload: CreateSizePayload;
  try {
    payload = (await request.json()) as CreateSizePayload;
  } catch {
    return NextResponse.json({ error: "Некорректный формат запроса." }, { status: 400 });
  }

  const name = String(payload.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Введите название размера." }, { status: 400 });
  }

  const size = await prisma.productSize.upsert({
    where: { name },
    update: {},
    create: { name },
    select: { id: true, name: true },
  });

  return NextResponse.json({ ok: true, size });
}

export async function PATCH(request: Request) {
  const session = await requireManagerAccess();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 403 });
  }

  let payload: UpdateSizePayload;
  try {
    payload = (await request.json()) as UpdateSizePayload;
  } catch {
    return NextResponse.json({ error: "Некорректный формат запроса." }, { status: 400 });
  }

  const id = String(payload.id ?? "").trim();
  const name = String(payload.name ?? "").trim();

  if (!id || !name) {
    return NextResponse.json({ error: "Нужно указать размер и новое имя." }, { status: 400 });
  }

  const existing = await prisma.productSize.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Размер не найден." }, { status: 404 });
  }

  const duplicate = await prisma.productSize.findFirst({
    where: { name, NOT: { id } },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: "Такой размер уже существует." }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.productSize.update({
      where: { id },
      data: { name },
      select: { id: true, name: true },
    });
    await tx.product.updateMany({
      where: { size: existing.name },
      data: { size: name },
    });
    return row;
  });

  return NextResponse.json({ ok: true, size: updated });
}

export async function DELETE(request: Request) {
  const session = await requireManagerAccess();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 403 });
  }

  let payload: DeleteSizePayload;
  try {
    payload = (await request.json()) as DeleteSizePayload;
  } catch {
    return NextResponse.json({ error: "Некорректный формат запроса." }, { status: 400 });
  }

  const id = String(payload.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Нужно указать размер." }, { status: 400 });
  }

  const existing = await prisma.productSize.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Размер не найден." }, { status: 404 });
  }

  const usedCount = await prisma.product.count({
    where: { size: existing.name },
  });
  if (usedCount > 0) {
    return NextResponse.json(
      { error: "Размер используется в товарах. Сначала измените размер у товаров." },
      { status: 400 },
    );
  }

  await prisma.productSize.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}
