import { InventorySessionStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { ConfirmCodeForm } from "@/app/(main)/inventory-sessions/confirm-code-form";
import { DeleteSessionButton } from "@/app/(main)/inventory-sessions/delete-session-button";
import { DiscrepancyDetailsModal } from "@/app/(main)/inventory-sessions/discrepancy-details-modal";
import { getRequiredSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_SESSIONS_VIEW_ROLES } from "@/lib/rbac";

type HistoryEvent = {
  timestamp: number;
  at: string;
  action: string;
  details: string;
};

function statusLabel(status: InventorySessionStatus) {
  if (status === InventorySessionStatus.PENDING) return "Ожидает подтверждения";
  if (status === InventorySessionStatus.CONFIRMED) return "Подтверждена";
  return "Есть расхождения";
}

export default async function InventorySessionsPage() {
  const session = await getRequiredSession();
  if (!INVENTORY_SESSIONS_VIEW_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const canDeletePending = session.role === "SUPER_ADMIN" || session.role === "ADMIN";
  const canDeleteConfirmed = session.role === "SUPER_ADMIN";

  const sessions = await prisma.inventorySession.findMany({
    include: {
      createdBy: { select: { name: true } },
      confirmedBy: { select: { name: true } },
      items: {
        where: { difference: { not: 0 } },
        select: {
          systemQuantity: true,
          actualQuantity: true,
          difference: true,
          product: { select: { id: true, name: true, sku: true } },
          container: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const allProductIds = [...new Set(sessions.flatMap((sessionRow) => sessionRow.items.map((item) => item.product.id)))];

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const historyByProductId: Record<string, HistoryEvent[]> = Object.fromEntries(
    allProductIds.map((productId) => [productId, [] as HistoryEvent[]]),
  );

  if (allProductIds.length > 0) {
    const [manualEntries, saleEntries, returnEntries, inventoryEntries] = await Promise.all([
      prisma.manualStockEntry.findMany({
        where: {
          productId: { in: allProductIds },
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        select: {
          productId: true,
          createdAt: true,
          quantity: true,
          reason: true,
          container: { select: { name: true } },
        },
      }),
      prisma.saleItem.findMany({
        where: {
          productId: { in: allProductIds },
          sale: { createdAt: { gte: monthStart, lt: monthEnd } },
        },
        select: {
          productId: true,
          quantity: true,
          totalUSD: true,
          sale: { select: { createdAt: true, invoiceNumber: true } },
        },
      }),
      prisma.returnItem.findMany({
        where: {
          saleItem: { productId: { in: allProductIds } },
          return: { createdAt: { gte: monthStart, lt: monthEnd } },
        },
        select: {
          quantity: true,
          amountUSD: true,
          return: { select: { createdAt: true, returnNumber: true } },
          saleItem: { select: { productId: true } },
        },
      }),
      prisma.inventorySessionItem.findMany({
        where: {
          productId: { in: allProductIds },
          difference: { not: 0 },
          inventorySession: { createdAt: { gte: monthStart, lt: monthEnd } },
        },
        select: {
          productId: true,
          difference: true,
          systemQuantity: true,
          actualQuantity: true,
          inventorySession: { select: { createdAt: true, code: true, status: true } },
        },
      }),
    ]);

    for (const row of manualEntries) {
      historyByProductId[row.productId]?.push({
        timestamp: row.createdAt.getTime(),
        at: new Date(row.createdAt).toLocaleString("ru-RU"),
        action: "Ручное добавление",
        details: `+${row.quantity} шт., контейнер: ${row.container.name}. Причина: ${row.reason}`,
      });
    }

    for (const row of saleEntries) {
      historyByProductId[row.productId]?.push({
        timestamp: row.sale.createdAt.getTime(),
        at: new Date(row.sale.createdAt).toLocaleString("ru-RU"),
        action: "Продажа",
        details: `Инвойс ${row.sale.invoiceNumber}, ${row.quantity} шт., сумма ${row.totalUSD.toFixed(2)} USD`,
      });
    }

    for (const row of returnEntries) {
      historyByProductId[row.saleItem.productId]?.push({
        timestamp: row.return.createdAt.getTime(),
        at: new Date(row.return.createdAt).toLocaleString("ru-RU"),
        action: "Возврат",
        details: `Возврат ${row.return.returnNumber}, ${row.quantity} шт., сумма ${row.amountUSD.toFixed(2)} USD`,
      });
    }

    for (const row of inventoryEntries) {
      historyByProductId[row.productId]?.push({
        timestamp: row.inventorySession.createdAt.getTime(),
        at: new Date(row.inventorySession.createdAt).toLocaleString("ru-RU"),
        action: "Инвентаризация",
        details: `Код ${row.inventorySession.code}, статус ${statusLabel(row.inventorySession.status)}, база ${row.systemQuantity}, факт ${row.actualQuantity}, разница ${row.difference > 0 ? `+${row.difference}` : row.difference}`,
      });
    }

    for (const productId of Object.keys(historyByProductId)) {
      historyByProductId[productId] = historyByProductId[productId]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20);
    }
  }

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">Коды инвентаризации</h2>
        <p className="mt-1 text-sm text-slate-600">
          Подтверждайте сессии склада по 3-значному коду. Код действителен 10 минут.
        </p>
      </article>

      <ConfirmCodeForm />

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Дата</th>
              <th className="px-3 py-2 font-medium">Код</th>
              <th className="px-3 py-2 font-medium">Статус</th>
              <th className="px-3 py-2 font-medium">Расхождения</th>
              <th className="px-3 py-2 font-medium">Создал</th>
              <th className="px-3 py-2 font-medium">Подтвердил</th>
              <th className="px-3 py-2 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((row) => {
              const isDiscrepancy = row.status === InventorySessionStatus.DISCREPANCY;
              const isConfirmed = row.status === InventorySessionStatus.CONFIRMED;
              const canDeleteRow = !isDiscrepancy && (row.status === InventorySessionStatus.PENDING || (isConfirmed && canDeleteConfirmed));
              const canSeeDeleteAction = canDeletePending && canDeleteRow;
              const codeLabel = isConfirmed ? row.code : "Скрыт до подтверждения";

              return (
                <tr key={row.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 text-slate-700">{new Date(row.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{codeLabel}</td>
                  <td className="px-3 py-2 text-slate-700">{statusLabel(row.status)}</td>
                  <td className="px-3 py-2 text-slate-700">{row.discrepancyCount}</td>
                  <td className="px-3 py-2 text-slate-700">{row.createdBy.name}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {row.confirmedBy
                      ? `${row.confirmedBy.name} (${new Date(row.confirmedAt ?? row.createdAt).toLocaleString("ru-RU")})`
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {isDiscrepancy ? (
                        <DiscrepancyDetailsModal
                          sessionId={row.id}
                          rows={row.items.map((item) => ({
                            productId: item.product.id,
                            productName: item.product.name,
                            sku: item.product.sku,
                            containerName: item.container.name,
                            systemQuantity: item.systemQuantity,
                            actualQuantity: item.actualQuantity,
                            difference: item.difference,
                          }))}
                          productHistories={historyByProductId}
                          canResolve={session.role === "SUPER_ADMIN" || session.role === "ADMIN"}
                        />
                      ) : null}
                      {canSeeDeleteAction ? <DeleteSessionButton id={row.id} isConfirmed={isConfirmed} /> : null}
                      {!isDiscrepancy && !canSeeDeleteAction ? <span className="text-xs text-slate-400">—</span> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!sessions.length ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                  История инвентаризаций пока пустая.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </section>
  );
}
