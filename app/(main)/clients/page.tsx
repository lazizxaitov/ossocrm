import Link from "next/link";
import { redirect } from "next/navigation";
import { ClientDetailsModal } from "@/app/(main)/clients/client-details-modal";
import { CreateClientModal } from "@/app/(main)/clients/create-client-modal";
import { EditClientModal } from "@/app/(main)/clients/edit-client-modal";
import { getRequiredSession } from "@/lib/auth";
import { formatUsd } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { CLIENTS_MANAGE_ROLES, CLIENTS_VIEW_ROLES } from "@/lib/rbac";

const PAGE_SIZE = 10;

type ClientsPageProps = {
  searchParams: Promise<{ q?: string; page?: string; error?: string; success?: string }>;
};

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const session = await getRequiredSession();
  if (!CLIENTS_VIEW_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const error = (params.error ?? "").trim();
  const success = (params.success ?? "").trim();
  const currentPage = Math.max(1, Number(params.page ?? "1") || 1);
  const canManage = CLIENTS_MANAGE_ROLES.includes(session.role);

  const where = q
    ? {
        OR: [{ name: { contains: q } }, { company: { contains: q } }, { inn: { contains: q } }, { phone: { contains: q } }],
      }
    : {};

  const [total, clients] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const clientIds = clients.map((client) => client.id);
  const salesByClient = clientIds.length
    ? await prisma.sale.findMany({
        where: { clientId: { in: clientIds } },
        select: {
          id: true,
          clientId: true,
          createdAt: true,
          invoiceNumber: true,
          totalAmountUSD: true,
          paidAmountUSD: true,
          debtAmountUSD: true,
        },
      })
    : [];
  const returnsByClient = clientIds.length
    ? await prisma.return.findMany({
        where: { sale: { clientId: { in: clientIds } } },
        select: {
          id: true,
          returnNumber: true,
          createdAt: true,
          totalReturnUSD: true,
          sale: {
            select: {
              invoiceNumber: true,
              clientId: true,
            },
          },
        },
      })
    : [];

  const statsByClient = new Map<
    string,
    {
      purchasesCount: number;
      totalPurchases: number;
      totalPaid: number;
      totalDebt: number;
      returnsCount: number;
      totalReturns: number;
      historyItems: Array<{ id: string; at: string; action: string; details: string; timestamp: number }>;
    }
  >();
  for (const sale of salesByClient) {
    const current = statsByClient.get(sale.clientId) ?? {
      purchasesCount: 0,
      totalPurchases: 0,
      totalPaid: 0,
      totalDebt: 0,
      returnsCount: 0,
      totalReturns: 0,
      historyItems: [],
    };
    current.purchasesCount += 1;
    current.totalPurchases += sale.totalAmountUSD;
    current.totalPaid += sale.paidAmountUSD;
    current.totalDebt += sale.debtAmountUSD;
    current.historyItems.push({
      id: `sale-${sale.id}`,
      timestamp: sale.createdAt.getTime(),
      at: sale.createdAt.toLocaleString("ru-RU"),
      action: "Продажа",
      details: `Счет ${sale.invoiceNumber}, сумма ${formatUsd(sale.totalAmountUSD)}`,
    });
    statsByClient.set(sale.clientId, current);
  }
  for (const ret of returnsByClient) {
    const current = statsByClient.get(ret.sale.clientId) ?? {
      purchasesCount: 0,
      totalPurchases: 0,
      totalPaid: 0,
      totalDebt: 0,
      returnsCount: 0,
      totalReturns: 0,
      historyItems: [],
    };
    current.returnsCount += 1;
    current.totalReturns += ret.totalReturnUSD;
    current.historyItems.push({
      id: `ret-${ret.id}`,
      timestamp: ret.createdAt.getTime(),
      at: ret.createdAt.toLocaleString("ru-RU"),
      action: "Возврат",
      details: `Возврат ${ret.returnNumber}, счет ${ret.sale.invoiceNumber}, сумма ${formatUsd(ret.totalReturnUSD)}`,
    });
    statsByClient.set(ret.sale.clientId, current);
  }
  for (const row of statsByClient.values()) {
    row.historyItems = row.historyItems.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const prevPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Клиенты</h2>
            <p className="mt-1 text-sm text-slate-600">База клиентов для продаж, долгов и оплат.</p>
          </div>
          {canManage ? <CreateClientModal /> : null}
        </div>
      </article>
      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p>
      ) : null}

      <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <form className="flex flex-col gap-2 sm:flex-row">
          <input
            name="q"
            defaultValue={q}
            placeholder="Поиск по имени, компании, ИНН или телефону"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Найти
          </button>
        </form>
      </article>

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Имя</th>
              <th className="px-3 py-2 font-medium">Компания</th>
              <th className="px-3 py-2 font-medium">ИНН</th>
              <th className="px-3 py-2 font-medium">Телефон</th>
              <th className="px-3 py-2 font-medium">Адрес</th>
              <th className="px-3 py-2 font-medium">Комментарий</th>
              <th className="px-3 py-2 font-medium">Лимит USD</th>
              <th className="px-3 py-2 font-medium">Подробнее</th>
              {canManage ? <th className="px-3 py-2 font-medium">Изменить</th> : null}
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => {
              const stat = statsByClient.get(client.id) ?? {
                purchasesCount: 0,
                totalPurchases: 0,
                totalPaid: 0,
                totalDebt: 0,
                returnsCount: 0,
                totalReturns: 0,
                historyItems: [],
              };
              return (
                <tr key={client.id} className="border-t border-[var(--border)] align-top">
                  <td className="px-3 py-2 text-slate-800">{client.name}</td>
                  <td className="px-3 py-2 text-slate-700">{client.company ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-700">{client.inn ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-700">{client.phone ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{client.address ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{client.comment ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-700">{formatUsd(client.creditLimitUSD)}</td>
                  <td className="px-3 py-2">
                    <ClientDetailsModal
                      name={client.name}
                      company={client.company}
                      inn={client.inn}
                      phone={client.phone}
                      address={client.address}
                      comment={client.comment}
                      creditLimitLabel={formatUsd(client.creditLimitUSD)}
                      purchasesCount={stat.purchasesCount}
                      totalPurchasesLabel={formatUsd(stat.totalPurchases)}
                      totalPaidLabel={formatUsd(stat.totalPaid)}
                      totalDebtLabel={formatUsd(stat.totalDebt)}
                      returnsCount={stat.returnsCount}
                      totalReturnsLabel={formatUsd(stat.totalReturns)}
                      historyItems={stat.historyItems.map((item) => ({
                        id: item.id,
                        at: item.at,
                        action: item.action,
                        details: item.details,
                      }))}
                    />
                  </td>
                  {canManage ? (
                    <td className="px-3 py-2">
                      <EditClientModal
                        id={client.id}
                        name={client.name}
                        company={client.company}
                        inn={client.inn}
                        phone={client.phone}
                        address={client.address}
                        comment={client.comment}
                        creditLimitUSD={client.creditLimitUSD}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {!clients.length ? (
              <tr>
                <td colSpan={canManage ? 9 : 8} className="px-3 py-6 text-center text-slate-500">
                  Ничего не найдено.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>

      <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm">
        <p className="text-slate-600">
          Страница {currentPage} из {totalPages}
        </p>
        <div className="flex gap-2">
          <Link
            href={`/clients?page=${prevPage}&q=${encodeURIComponent(q)}`}
            className={`rounded-lg border px-3 py-1.5 ${
              currentPage <= 1
                ? "pointer-events-none border-slate-200 text-slate-400"
                : "border-[var(--border)] text-slate-700 hover:bg-slate-50"
            }`}
          >
            Назад
          </Link>
          <Link
            href={`/clients?page=${nextPage}&q=${encodeURIComponent(q)}`}
            className={`rounded-lg border px-3 py-1.5 ${
              currentPage >= totalPages
                ? "pointer-events-none border-slate-200 text-slate-400"
                : "border-[var(--border)] text-slate-700 hover:bg-slate-50"
            }`}
          >
            Вперед
          </Link>
        </div>
      </div>
    </section>
  );
}

