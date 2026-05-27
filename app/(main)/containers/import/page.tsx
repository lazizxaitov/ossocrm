import Link from "next/link";
import { redirect } from "next/navigation";
import { ImportContainerFromExcelPage } from "@/app/(main)/containers/import/ui";
import { getRequiredSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CONTAINERS_MANAGE_ROLES } from "@/lib/rbac";

export default async function ImportContainerFromExcelRoute() {
  const session = await getRequiredSession();
  if (!CONTAINERS_MANAGE_ROLES.includes(session.role)) {
    redirect("/containers");
  }

  const latestCurrency = await prisma.currencySetting.findFirst({ orderBy: { updatedAt: "desc" } });

  return (
    <section className="grid h-[calc(100dvh-120px)] min-h-0 grid-rows-[auto_1fr] gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Импорт контейнера из Excel</h1>
            <p className="mt-1 text-sm text-slate-600">
              Загрузите файл Excel в формате шаблона (например, лист <span className="font-medium">TRUCK ALL-9</span>).
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
        <ImportContainerFromExcelPage defaultRate={latestCurrency?.cnyToUsdRate ?? null} />
      </div>
    </section>
  );
}

