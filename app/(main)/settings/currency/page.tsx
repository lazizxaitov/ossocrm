import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { updateCurrencySettingAction } from "@/app/(main)/settings/actions";
import { getRequiredSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function CurrencySettingsPage() {
  const session = await getRequiredSession();
  if (session.role !== Role.SUPER_ADMIN) {
    redirect("/dashboard");
  }

  const setting = await prisma.currencySetting.findUnique({
    where: { id: 1 },
    include: { updatedBy: { select: { name: true, login: true } } },
  });

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Курс валют CNY → USD</h2>
        <p className="mt-1 text-sm text-slate-600">Этот курс применяется только к новым контейнерам.</p>
      </article>

      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <form action={updateCurrencySettingAction} className="grid max-w-md gap-3">
          <label className="text-sm font-medium text-slate-700" htmlFor="cnyToUsdRate">
            Курс CNY → USD
          </label>
          <input
            id="cnyToUsdRate"
            name="cnyToUsdRate"
            type="number"
            step="0.0001"
            min="0.0001"
            defaultValue={setting?.cnyToUsdRate ?? 0.14}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            required
          />
          <button
            type="submit"
            className="w-fit rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Сохранить курс
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-600">
          Последнее обновление:{" "}
          <span className="font-medium text-slate-800">
            {setting
              ? `${new Date(setting.updatedAt).toLocaleString("ru-RU")} (${setting.updatedBy.name} / ${setting.updatedBy.login})`
              : "еще не задано"}
          </span>
        </p>
      </article>
    </section>
  );
}
