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
    const container = await prisma.container.findUnique({
      where: { id: containerId },
      select: { id: true, status: true },
    });

    if (!container) {
      return NextResponse.json({ error: "Контейнер не найден." }, { status: 404 });
    }

    const salesLinks = await prisma.saleItem.count({
      where: { containerItem: { containerId } },
    });

    if (salesLinks > 0) {
      return NextResponse.json(
        {
          error: `Контейнер связан с продажами (${salesLinks}). Удаление запрещено, чтобы не повредить финансовую историю.`,
        },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.inventorySessionItem.deleteMany({ where: { containerId } });
      await tx.manualStockEntry.deleteMany({ where: { containerId } });
      await tx.expenseCorrection.deleteMany({ where: { expense: { containerId } } });
      await tx.containerExpense.deleteMany({ where: { containerId } });
      await tx.investorPayout.deleteMany({ where: { containerId } });
      await tx.containerInvestment.deleteMany({ where: { containerId } });
      await tx.containerItem.deleteMany({ where: { containerId } });
      await tx.container.delete({ where: { id: containerId } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Контейнер не найден." }, { status: 404 });
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "Контейнер связан с другими данными и не может быть удален." },
          { status: 400 },
        );
      }
    }

    return NextResponse.json({ error: "Не удалось удалить контейнер." }, { status: 500 });
  }
}
