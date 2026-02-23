import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { CreateProductModal } from "@/app/(main)/products/create-product-modal";
import { EditProductModal } from "@/app/(main)/products/edit-product-modal";
import { getRequiredSession } from "@/lib/auth";
import { formatUsd } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { PRODUCTS_MANAGE_ROLES, PRODUCTS_VIEW_ROLES } from "@/lib/rbac";

const PAGE_SIZE = 10;

type ProductsPageProps = {
  searchParams: Promise<{ q?: string; page?: string; cat?: string }>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const session = await getRequiredSession();
  if (!PRODUCTS_VIEW_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const selectedCategoryId = (params.cat ?? "").trim();
  const currentPage = Math.max(1, Number(params.page ?? "1") || 1);
  const canManage = PRODUCTS_MANAGE_ROLES.includes(session.role);
  const canDelete = session.role === "SUPER_ADMIN";
  const showFinance = session.role !== "MANAGER" && session.role !== "WAREHOUSE";

  const searchWhere = q
    ? {
        OR: [
          { name: { contains: q } },
          { size: { contains: q } },
          { color: { contains: q } },
          { category: { name: { contains: q } } },
        ],
      }
    : {};

  const where =
    selectedCategoryId === "uncategorized"
      ? {
          AND: [searchWhere, { categoryId: null }],
        }
      : selectedCategoryId
        ? {
            AND: [searchWhere, { categoryId: selectedCategoryId }],
          }
        : searchWhere;

  const [total, products, productSizes, categories] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    }),
    prisma.productSize.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.productCategory.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const existingSizes = productSizes.filter((row) => row.name);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const prevPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Товары</h2>
            <p className="mt-1 text-sm text-slate-600">
              Каталог товаров с поиском, карточками и управлением параметрами.
            </p>
          </div>
          {canManage ? <CreateProductModal existingSizes={existingSizes} categories={categories} /> : null}
        </div>
      </article>

      <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <form className="flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="cat" value={selectedCategoryId} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Поиск по названию, категории, размеру, цвету"
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

      <article className="rounded-2xl border border-[var(--border)] bg-white p-3">
        <div className="overflow-x-auto">
          <div className="flex min-w-max items-center gap-2">
            <Link
              href={`/products?page=1&q=${encodeURIComponent(q)}&cat=`}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                !selectedCategoryId
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] text-slate-700 hover:bg-slate-50"
              }`}
            >
              Все товары
            </Link>
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/products?page=1&q=${encodeURIComponent(q)}&cat=${category.id}`}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  selectedCategoryId === category.id
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] text-slate-700 hover:bg-slate-50"
                }`}
              >
                {category.name}
              </Link>
            ))}
            <Link
              href={`/products?page=1&q=${encodeURIComponent(q)}&cat=uncategorized`}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                selectedCategoryId === "uncategorized"
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] text-slate-700 hover:bg-slate-50"
              }`}
            >
              Без категории
            </Link>
          </div>
        </div>
      </article>

      <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Фото</th>
              <th className="px-3 py-2 font-medium">Название</th>
              <th className="px-3 py-2 font-medium">Категория</th>
              <th className="px-3 py-2 font-medium">Размер</th>
              <th className="px-3 py-2 font-medium">Цвет</th>
              <th className="px-3 py-2 font-medium">CBM</th>
              <th className="px-3 py-2 font-medium">KG</th>
              {showFinance ? <th className="px-3 py-2 font-medium">Себестоимость</th> : null}
              {showFinance ? <th className="px-3 py-2 font-medium">Цена продажи</th> : null}
              <th className="px-3 py-2 font-medium">Описание</th>
              {canManage ? <th className="px-3 py-2 font-medium">Изменить</th> : null}
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-t border-[var(--border)] align-top">
                <td className="px-3 py-2">
                  {product.imagePath ? (
                    <Image
                      src={product.imagePath}
                      alt={product.name}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-md border border-[var(--border)] object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-[var(--border)] text-[10px] text-slate-400">
                      нет
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-800">{product.name}</td>
                <td className="px-3 py-2 text-slate-700">{product.category?.name ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700">{product.size}</td>
                <td className="px-3 py-2 text-slate-700">{product.color ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700">{product.cbm ? product.cbm.toFixed(4) : "—"}</td>
                <td className="px-3 py-2 text-slate-700">{product.kg ? product.kg.toFixed(2) : "—"}</td>
                {showFinance ? <td className="px-3 py-2 text-slate-700">{formatUsd(product.costPriceUSD)}</td> : null}
                {showFinance ? <td className="px-3 py-2 text-slate-700">{formatUsd(product.basePriceUSD)}</td> : null}
                <td className="px-3 py-2 text-slate-600">{product.description ?? "—"}</td>
                {canManage ? (
                  <td className="px-3 py-2">
                    <EditProductModal
                      product={{
                        id: product.id,
                        name: product.name,
                        size: product.size,
                        color: product.color,
                        description: product.description,
                        imagePath: product.imagePath,
                        costPriceUSD: product.costPriceUSD,
                        cbm: product.cbm,
                        kg: product.kg,
                        basePriceUSD: product.basePriceUSD,
                        categoryId: product.category?.id ?? null,
                      }}
                      categories={categories}
                      existingSizes={existingSizes}
                      showFinance={showFinance}
                      canDelete={canDelete}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
            {!products.length ? (
              <tr>
                <td
                  className="px-3 py-6 text-center text-slate-500"
                  colSpan={canManage ? (showFinance ? 11 : 9) : showFinance ? 10 : 8}
                >
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
            href={`/products?page=${prevPage}&q=${encodeURIComponent(q)}&cat=${encodeURIComponent(selectedCategoryId)}`}
            className={`rounded-lg border px-3 py-1.5 ${
              currentPage <= 1
                ? "pointer-events-none border-slate-200 text-slate-400"
                : "border-[var(--border)] text-slate-700 hover:bg-slate-50"
            }`}
          >
            Назад
          </Link>
          <Link
            href={`/products?page=${nextPage}&q=${encodeURIComponent(q)}&cat=${encodeURIComponent(selectedCategoryId)}`}
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
