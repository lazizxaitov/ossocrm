import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateContainerExcelPage } from "@/app/(main)/containers/excel/ui";
import { getRequiredSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CONTAINERS_MANAGE_ROLES } from "@/lib/rbac";

export default async function CreateContainerExcelRoute() {
  const session = await getRequiredSession();
  if (!CONTAINERS_MANAGE_ROLES.includes(session.role)) {
    redirect("/containers");
  }

  const [latestCurrency, products, investors] = await Promise.all([
    prisma.currencySetting.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.product.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        size: true,
        imagePath: true,
        costPriceUSD: true,
        cbm: true,
        kg: true,
        basePriceUSD: true,
        category: { select: { name: true } },
      },
    }),
    prisma.investor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <section className="grid h-[calc(100dvh-120px)] min-h-0 grid-rows-[auto_1fr] gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Новый контейнер (Excel)</h1>
            <p className="mt-1 text-sm text-slate-600">
              Заполните шапку, затем добавьте товары в таблицу.
            </p>
          </div>
          <Link
            href="/containers"
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Назад
          </Link>
        </div>
      </article>

      <div className="min-h-0">
        <CreateContainerExcelPage
          defaultRate={latestCurrency?.cnyToUsdRate ?? null}
          products={products.map((product) => ({
            id: product.id,
            name: product.name,
            sku: product.sku,
            size: product.size,
            imagePath: product.imagePath,
            costPriceUSD: product.costPriceUSD,
            cbm: product.cbm ?? 0,
            kg: product.kg ?? 0,
            basePriceUSD: product.basePriceUSD,
            categoryName: product.category?.name ?? "Без категории",
          }))}
          investors={investors}
        />
      </div>
    </section>
  );
}
