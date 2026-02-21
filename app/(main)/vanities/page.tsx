import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateVanityModal } from "@/app/(main)/vanities/create-vanity-modal";
import { EditVanityModal } from "@/app/(main)/vanities/edit-vanity-modal";
import { getRequiredSession } from "@/lib/auth";
import { formatUsd } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { PRODUCTS_MANAGE_ROLES, PRODUCTS_VIEW_ROLES } from "@/lib/rbac";

const PAGE_SIZE = 10;

type VanitiesPageProps = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

export default async function VanitiesPage({ searchParams }: VanitiesPageProps) {
  const session = await getRequiredSession();
  if (!PRODUCTS_VIEW_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const currentPage = Math.max(1, Number(params.page ?? "1") || 1);
  const canManage = PRODUCTS_MANAGE_ROLES.includes(session.role);
  const showFinance = session.role !== "MANAGER" && session.role !== "WAREHOUSE";

  const where = {
    category: { name: "Тумбы" },
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { size: { contains: q } },
            { sku: { contains: q } },
            { description: { contains: q } },
          ],
        }
      : {}),
  };

  const [total, vanities] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        size: true,
        sku: true,
        costPriceUSD: true,
        basePriceUSD: true,
        description: true,
      },
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
            <h2 className="text-xl font-semibold text-slate-900">Тумбы</h2>
            <p className="mt-1 text-sm text-slate-600">Каталог тумб (шкафов под раковину): модели, размеры и цены.</p>
          </div>
          {canManage ? <CreateVanityModal /> : null}
        </div>
      </article>

      <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <form className="flex flex-col gap-2 sm:flex-row">
          <input
            name="q"
            defaultValue={q}
            placeholder="Поиск по модели, размеру, SKU"
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
              <th className="px-3 py-2 font-medium">Модель</th>
              <th className="px-3 py-2 font-medium">Размер</th>
              <th className="px-3 py-2 font-medium">SKU</th>
              {showFinance ? <th className="px-3 py-2 font-medium">Себестоимость</th> : null}
              {showFinance ? <th className="px-3 py-2 font-medium">Цена продажи</th> : null}
              <th className="px-3 py-2 font-medium">Описание</th>
              {canManage ? <th className="px-3 py-2 font-medium">Изменить</th> : null}
            </tr>
          </thead>
          <tbody>
            {vanities.map((item) => (
              <tr key={item.id} className="border-t border-[var(--border)] align-top">
                <td className="px-3 py-2 text-slate-800">{item.name}</td>
                <td className="px-3 py-2 text-slate-700">{item.size}</td>
                <td className="px-3 py-2 text-slate-600">{item.sku}</td>
                {showFinance ? <td className="px-3 py-2 text-slate-700">{formatUsd(item.costPriceUSD)}</td> : null}
                {showFinance ? <td className="px-3 py-2 text-slate-700">{formatUsd(item.basePriceUSD)}</td> : null}
                <td className="px-3 py-2 text-slate-600">{item.description ?? "—"}</td>
                {canManage ? (
                  <td className="px-3 py-2">
                    <EditVanityModal
                      vanity={{
                        id: item.id,
                        model: item.name,
                        size: item.size,
                        costPriceUSD: item.costPriceUSD,
                        salePriceUSD: item.basePriceUSD,
                        description: item.description,
                      }}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
            {!vanities.length ? (
              <tr>
                <td
                  colSpan={canManage ? (showFinance ? 7 : 5) : showFinance ? 6 : 4}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  Тумбы не найдены.
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
            href={`/vanities?page=${prevPage}&q=${encodeURIComponent(q)}`}
            className={`rounded-lg border px-3 py-1.5 ${
              currentPage <= 1
                ? "pointer-events-none border-slate-200 text-slate-400"
                : "border-[var(--border)] text-slate-700 hover:bg-slate-50"
            }`}
          >
            Назад
          </Link>
          <Link
            href={`/vanities?page=${nextPage}&q=${encodeURIComponent(q)}`}
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
