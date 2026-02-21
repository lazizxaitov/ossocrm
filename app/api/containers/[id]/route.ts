import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Удаление доступно только супер-админу." }, { status: 403 });
  }

  const { id } = await context.params;
  const containerId = String(id ?? "").trim();
  if (!containerId) {
    return NextResponse.json({ error: "Контейнер не найден." }, { status: 400 });
  }

  try {
    await prisma.container.delete({
      where: { id: containerId },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Контейнер не найден." }, { status: 404 });
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "Контейнер связан с продажами, выплатами или расходами и не может быть удален." },
          { status: 400 },
        );
      }
    }
    return NextResponse.json({ error: "Не удалось удалить контейнер." }, { status: 500 });
  }
}
