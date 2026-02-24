import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { recalculateContainerFinancials } from "@/lib/container-finance";
import { assertOpenPeriodById } from "@/lib/financial-period";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

type DeleteResponse = {
  ok?: boolean;
  error?: string;
};

export async function DELETE(_: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json<DeleteResponse>(
      { error: "Удаление продажи доступно только суперадмину." },
      { status: 403 },
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json<DeleteResponse>({ error: "Не указан идентификатор продажи." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              returnItems: true,
              containerItem: { select: { id: true, containerId: true } },
            },
          },
          returns: { select: { id: true } },
          payments: { select: { id: true } },
        },
      });

      if (!sale) {
        throw new Error("Продажа не найдена.");
      }

      await assertOpenPeriodById(sale.financialPeriodId);

      const affectedContainerIds = new Set<string>();
      for (const item of sale.items) {
        const returnedQty = item.returnItems.reduce((sum, row) => sum + row.quantity, 0);
        const qtyToRestore = item.quantity - returnedQty;
        if (qtyToRestore > 0) {
          await tx.containerItem.update({
            where: { id: item.containerItem.id },
            data: { quantity: { increment: qtyToRestore } },
          });
        }
        affectedContainerIds.add(item.containerItem.containerId);
      }

      await tx.returnItem.deleteMany({
        where: { saleItem: { saleId: sale.id } },
      });
      await tx.return.deleteMany({ where: { saleId: sale.id } });
      await tx.payment.deleteMany({ where: { saleId: sale.id } });
      await tx.sale.delete({ where: { id: sale.id } });

      for (const containerId of affectedContainerIds) {
        await recalculateContainerFinancials(containerId, tx);
      }

      await tx.auditLog.create({
        data: {
          action: "DELETE_SALE",
          entityType: "Sale",
          entityId: sale.id,
          createdById: session.userId,
          metadata: JSON.stringify({
            invoiceNumber: sale.invoiceNumber,
            returnsCount: sale.returns.length,
            paymentsCount: sale.payments.length,
            itemsCount: sale.items.length,
          }),
        },
      });
    });

    return NextResponse.json<DeleteResponse>({ ok: true });
  } catch (error) {
    return NextResponse.json<DeleteResponse>(
      { error: error instanceof Error ? error.message : "Не удалось удалить продажу." },
      { status: 500 },
    );
  }
}
