import Link from "next/link";
import { redirect } from "next/navigation";
import {
  deleteCategoryAction,
  updateCategoryAction,
} from "@/app/(main)/categories/actions";
import { CreateCategoryModal } from "@/app/(main)/categories/create-category-modal";
import { getRequiredSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRODUCTS_MANAGE_ROLES, PRODUCTS_VIEW_ROLES } from "@/lib/rbac";

const PAGE_SIZE = 10;

type CategoriesPageProps = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const session = await getRequiredSession();
  if (!PRODUCTS_VIEW_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const currentPage = Math.max(1, Number(params.page ?? "1") || 1);
  const canManage = PRODUCTS_MANAGE_ROLES.includes(session.role);

  const where = q
    ? {
        OR: [{ name: { contains: q } }, { description: { contains: q } }],
      }
    : {};

  const [total, categories] = await Promise.all([
    prisma.productCategory.count({ where }),
    prisma.productCategory.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: {
          select: { products: true },
        },
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
            <h2 className="text-xl font-semibold text-slate-900">Категории товаров</h2>
            <p className="mt-1 text-sm text-slate-600">Справочник категорий с поиском и быстрым редактированием.</p>
          </div>
          {canManage ? <CreateCategoryModal /> : null}
        </div>
      </article>

      <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <form className="flex flex-col gap-2 sm:flex-row">
          <input
            name="q"
            defaultValue={q}
            placeholder="Поиск по названию или описанию"
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
              <th className="px-3 py-2 font-medium">Название</th>
              <th className="px-3 py-2 font-medium">Описание</th>
              <th className="px-3 py-2 font-medium">Товаров</th>
              {canManage ? <th className="px-3 py-2 font-medium">Изменить</th> : null}
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id} className="border-t border-[var(--border)] align-top">
                <td className="px-3 py-2 text-slate-800">{category.name}</td>
                <td className="px-3 py-2 text-slate-600">{category.description ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700">{category._count.products}</td>
                {canManage ? (
                  <td className="px-3 py-2">
                    <div className="grid gap-2">
                      <form action={updateCategoryAction} className="grid gap-2 md:grid-cols-3">
                        <input type="hidden" name="id" value={category.id} />
                        <input
                          name="name"
                          defaultValue={category.name}
                          className="rounded border border-[var(--border)] px-2 py-1"
                          required
                        />
                        <input
                          name="description"
                          defaultValue={category.description ?? ""}
                          placeholder="Описание"
                          className="rounded border border-[var(--border)] px-2 py-1"
                        />
                        <button
                          type="submit"
                          className="rounded bg-[var(--accent)] px-2 py-1 font-medium text-white hover:opacity-90"
                        >
                          Сохранить
                        </button>
                      </form>
                      <form action={deleteCategoryAction}>
                        <input type="hidden" name="id" value={category.id} />
                        <button
                          type="submit"
                          className="rounded border border-rose-300 px-2 py-1 text-sm font-medium text-rose-700 hover:bg-rose-50"
                        >
                          Удалить
                        </button>
                      </form>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {!categories.length ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={canManage ? 4 : 3}>
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
            href={`/categories?page=${prevPage}&q=${encodeURIComponent(q)}`}
            className={`rounded-lg border px-3 py-1.5 ${
              currentPage <= 1
                ? "pointer-events-none border-slate-200 text-slate-400"
                : "border-[var(--border)] text-slate-700 hover:bg-slate-50"
            }`}
          >
            Назад
          </Link>
          <Link
            href={`/categories?page=${nextPage}&q=${encodeURIComponent(q)}`}
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
