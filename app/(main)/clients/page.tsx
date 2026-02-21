import Link from "next/link";
import { redirect } from "next/navigation";
import { updateClientAction } from "@/app/(main)/clients/actions";
import { CreateClientModal } from "@/app/(main)/clients/create-client-modal";
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
              {canManage ? <th className="px-3 py-2 font-medium">Изменить</th> : null}
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="border-t border-[var(--border)] align-top">
                <td className="px-3 py-2 text-slate-800">{client.name}</td>
                <td className="px-3 py-2 text-slate-700">{client.company ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700">{client.inn ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700">{client.phone ?? "—"}</td>
                <td className="px-3 py-2 text-slate-600">{client.address ?? "—"}</td>
                <td className="px-3 py-2 text-slate-600">{client.comment ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700">{formatUsd(client.creditLimitUSD)}</td>
                {canManage ? (
                  <td className="px-3 py-2">
                    <form action={updateClientAction} className="grid gap-2 md:grid-cols-5">
                      <input type="hidden" name="id" value={client.id} />
                      <input name="name" defaultValue={client.name} required className="rounded border border-[var(--border)] px-2 py-1" />
                      <input name="company" defaultValue={client.company ?? ""} placeholder="Компания" className="rounded border border-[var(--border)] px-2 py-1" />
                      <input name="inn" defaultValue={client.inn ?? ""} placeholder="ИНН" className="rounded border border-[var(--border)] px-2 py-1" />
                      <input name="phone" defaultValue={client.phone ?? ""} className="rounded border border-[var(--border)] px-2 py-1" />
                      <input
                        name="creditLimitUSD"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={client.creditLimitUSD}
                        className="rounded border border-[var(--border)] px-2 py-1"
                      />
                      <button type="submit" className="rounded bg-[var(--accent)] px-2 py-1 font-medium text-white hover:opacity-90">
                        Сохранить
                      </button>
                      <input
                        name="address"
                        defaultValue={client.address ?? ""}
                        placeholder="Адрес"
                        className="md:col-span-5 rounded border border-[var(--border)] px-2 py-1"
                      />
                      <input
                        name="comment"
                        defaultValue={client.comment ?? ""}
                        placeholder="Комментарий"
                        className="md:col-span-5 rounded border border-[var(--border)] px-2 py-1"
                      />
                    </form>
                  </td>
                ) : null}
              </tr>
            ))}
            {!clients.length ? (
              <tr>
                <td colSpan={canManage ? 8 : 7} className="px-3 py-6 text-center text-slate-500">
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
