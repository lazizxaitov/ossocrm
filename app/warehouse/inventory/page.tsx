import Link from "next/link";
import { InventoryClient } from "@/app/warehouse/inventory/inventory-client";

export default function WarehouseInventoryPage() {
  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Инвентаризация</h2>
            <p className="mt-1 text-sm text-slate-600">
              Введите фактические количества. Система сравнит их с базой и выдаст код подтверждения.
            </p>
          </div>
          <Link
            href="/warehouse"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Назад в склад
          </Link>
        </div>
      </article>
      <InventoryClient />
    </section>
  );
}
