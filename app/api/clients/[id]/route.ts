import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CLIENTS_MANAGE_ROLES } from "@/lib/rbac";

type RouteParams = { params: Promise<{ id: string }> };

type DeleteResponse = {
  ok?: boolean;
  error?: string;
};

export async function DELETE(_: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session || !CLIENTS_MANAGE_ROLES.includes(session.role)) {
    return NextResponse.json<DeleteResponse>({ error: "Недостаточно прав для удаления клиентов." }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json<DeleteResponse>({ error: "Не указан идентификатор клиента." }, { status: 400 });
  }

  try {
    const salesCount = await prisma.sale.count({ where: { clientId: id } });
    if (salesCount > 0) {
      return NextResponse.json<DeleteResponse>(
        { error: "Нельзя удалить клиента: у него есть продажи/долги." },
        { status: 400 },
      );
    }

    await prisma.client.delete({ where: { id } });
    return NextResponse.json<DeleteResponse>({ ok: true });
  } catch (error) {
    return NextResponse.json<DeleteResponse>(
      { error: error instanceof Error ? error.message : "Не удалось удалить клиента." },
      { status: 500 },
    );
  }
}

