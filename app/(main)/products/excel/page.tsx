import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateProductsExcelPage } from "@/app/(main)/products/excel/ui";
import { getRequiredSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRODUCTS_MANAGE_ROLES } from "@/lib/rbac";

export default async function ProductsExcelPage() {
  const session = await getRequiredSession();
  if (!PRODUCTS_MANAGE_ROLES.includes(session.role)) {
    redirect("/products");
  }

  const categories = await prisma.productCategory.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true },
  });

  return (
    <section className="grid h-[calc(100dvh-120px)] min-h-0 grid-rows-[auto_1fr] gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Новые товары (Excel)</h1>
            <p className="mt-1 text-sm text-slate-600">
              Заполняйте строки как в таблице Excel, добавляйте фото и создавайте товары пачкой.
            </p>
          </div>
          <Link
            href="/products"
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Назад
          </Link>
        </div>
      </article>

      <div className="min-h-0">
        <CreateProductsExcelPage categories={categories} />
      </div>
    </section>
  );
}
