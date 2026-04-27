import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRODUCTS_MANAGE_ROLES } from "@/lib/rbac";

type CreateCategoryPayload = {
  name?: string;
  description?: string;
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

  const categories = await prisma.productCategory.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true },
  });

  return NextResponse.json({ ok: true, categories });
}

export async function POST(request: Request) {
  const session = await requireManagerAccess();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещен." }, { status: 403 });
  }

  let payload: CreateCategoryPayload;
  try {
    payload = (await request.json()) as CreateCategoryPayload;
  } catch {
    return NextResponse.json({ error: "Некорректный формат запроса." }, { status: 400 });
  }

  const name = String(payload.name ?? "").trim();
  const description = String(payload.description ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "Введите название категории." }, { status: 400 });
  }

  const category = await prisma.productCategory.upsert({
    where: { name },
    update: {
      description: description || undefined,
    },
    create: {
      name,
      description: description || null,
    },
    select: { id: true, name: true, description: true },
  });

  return NextResponse.json({ ok: true, category });
}

