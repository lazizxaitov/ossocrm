import Link from "next/link";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { updateAutoLogoutTimerAction, updateCostingRatesAction, updateCostingRuleModeAction } from "@/app/(main)/settings/actions";
import { BackupCard } from "@/app/(main)/settings/backup-card";
import { ResetBusinessDataCard } from "@/app/(main)/settings/reset-business-data-card";
import { ServerTimeCard } from "@/app/(main)/settings/server-time-card";
import { UserAccessSection } from "@/app/(main)/settings/user-access-section";
import { getRequiredSession } from "@/lib/auth";
import { listBackups } from "@/lib/backup";
import { COSTING_RULE_MODES, getCostingConfigFromControl, getCustomsRateUsdPerUnit, resolveCostingRuleMode } from "@/lib/costing-rules";
import { prisma } from "@/lib/prisma";
import { SETTINGS_ROLES } from "@/lib/rbac";

export default async function SettingsPage() {
  const session = await getRequiredSession();
  if (!SETTINGS_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  const [users, control, backups] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        login: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.systemControl.findUnique({ where: { id: 1 } }),
    listBackups(),
  ]);

  const isSuperAdmin = session.role === Role.SUPER_ADMIN;
  const canManageSuperAdmin = isSuperAdmin;
  const canManageServerTime = isSuperAdmin;
  const canRestoreBackup = isSuperAdmin;
  const autoLogoutMinutes = Math.max(1, control?.serverTimeOffsetMinutes ?? 10);
  const costingRuleMode = resolveCostingRuleMode(control?.costingRuleMode);
  const costingConfig = getCostingConfigFromControl(control);

  const serverNow = new Date();
  const timeZone = control?.serverTimeZone ?? "UTC";
  const autoMode = control?.serverTimeAuto ?? true;
  const manualSystemTime = control?.manualSystemTime ?? null;
  const systemNow = autoMode ? serverNow : manualSystemTime ?? serverNow;

  const serverNowLabel = serverNow.toLocaleString("ru-RU");
  const systemNowLabel = autoMode
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "full",
        timeStyle: "medium",
        timeZone,
      }).format(serverNow)
    : systemNow.toLocaleString("ru-RU");

  const manualDateTimeValue = manualSystemTime
    ? new Date(manualSystemTime.getTime() - manualSystemTime.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";

  const lastBackupLabel = control?.lastBackupAt
    ? new Date(control.lastBackupAt).toLocaleString("ru-RU")
    : "еще не создан";

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Настройки приложения</h2>
        <p className="mt-2 text-sm text-slate-600">
          {isSuperAdmin
            ? "Полные настройки: курс, время, пользователи, таймер автовыхода и backup."
            : "Доступен только раздел backup."}
        </p>
      </article>

      {isSuperAdmin ? (
        <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <h3 className="text-base font-semibold text-slate-900">Правило учета себестоимости</h3>
          <p className="mt-1 text-sm text-slate-600">
            Переключает расчеты в Excel-окнах и пересчитывает себестоимость товаров по контейнерам во всей CRM.
          </p>
          <form action={updateCostingRuleModeAction} className="mt-4 grid gap-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="flex cursor-pointer gap-3 rounded-xl border border-[var(--border)] p-4">
                <input
                  type="radio"
                  name="costingRuleMode"
                  value={COSTING_RULE_MODES.LEGACY}
                  defaultChecked={costingRuleMode === COSTING_RULE_MODES.LEGACY}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-slate-900">Старое правило</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Распределение логистики и растаможки по общей сумме контейнера как сейчас.
                  </div>
                </div>
              </label>
              <label className="flex cursor-pointer gap-3 rounded-xl border border-[var(--border)] p-4">
                <input
                  type="radio"
                  name="costingRuleMode"
                  value={COSTING_RULE_MODES.CATEGORY_BASED_V2}
                  defaultChecked={costingRuleMode === COSTING_RULE_MODES.CATEGORY_BASED_V2}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-slate-900">Новое правило</div>
                  <div className="mt-1 text-sm text-slate-600">
                    По CBM и ставке растаможки за 1 шт по типу товара.
                  </div>
                </div>
              </label>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div>1 m³ transport: <span className="font-medium">{costingConfig.transportUsdPerCbm.toFixed(6)} USD</span></div>
              <div>Rakovina: <span className="font-medium">{getCustomsRateUsdPerUnit({ categoryName: "rakovina" }, costingConfig).toFixed(2)} USD/шт</span></div>
              <div>Unitaz: <span className="font-medium">{getCustomsRateUsdPerUnit({ categoryName: "unitaz" }, costingConfig).toFixed(2)} USD/шт</span></div>
              <div>Sifon: <span className="font-medium">{getCustomsRateUsdPerUnit({ categoryName: "sifon" }, costingConfig).toFixed(2)} USD/шт</span></div>
              <div>Smesitel: <span className="font-medium">{getCustomsRateUsdPerUnit({ categoryName: "smesitel" }, costingConfig).toFixed(2)} USD/шт</span></div>
              <div>Oyna: <span className="font-medium">{getCustomsRateUsdPerUnit({ categoryName: "oyna" }, costingConfig).toFixed(2)} USD/шт</span></div>
            </div>
            <div>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Сохранить правило учета
              </button>
            </div>
          </form>
          <form action={updateCostingRatesAction} className="mt-5 grid gap-3 rounded-xl border border-[var(--border)] p-4">
            <div className="text-sm font-medium text-slate-900">Ставки для Excel-окон</div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="grid gap-1 text-sm text-slate-700">
                <span>Transport 1 m³ (USD)</span>
                <input name="transportUsdPerCbm" type="number" min={0} step="0.000001" defaultValue={costingConfig.transportUsdPerCbm} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-sm text-slate-700">
                <span>Rakovinaga (USD/шт)</span>
                <input name="customsRakovinaUsd" type="number" min={0} step="0.01" defaultValue={costingConfig.customsRakovinaUsd} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-sm text-slate-700">
                <span>Unitazga (USD/шт)</span>
                <input name="customsUnitazUsd" type="number" min={0} step="0.01" defaultValue={costingConfig.customsUnitazUsd} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-sm text-slate-700">
                <span>Sifonga (USD/шт)</span>
                <input name="customsSifonUsd" type="number" min={0} step="0.01" defaultValue={costingConfig.customsSifonUsd} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-sm text-slate-700">
                <span>Smesitelga (USD/шт)</span>
                <input name="customsSmesitelUsd" type="number" min={0} step="0.01" defaultValue={costingConfig.customsSmesitelUsd} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-sm text-slate-700">
                <span>Oynaga (USD/шт)</span>
                <input name="customsOynaUsd" type="number" min={0} step="0.01" defaultValue={costingConfig.customsOynaUsd} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" />
              </label>
            </div>
            <div>
              <button type="submit" className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Сохранить ставки Excel
              </button>
            </div>
          </form>
        </article>
      ) : null}

      {isSuperAdmin ? (
        <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <h3 className="text-base font-semibold text-slate-900">Таймер автовыхода</h3>
          <p className="mt-1 text-sm text-slate-600">
            Время бездействия до автоматического выхода из системы на главном экране.
          </p>
          <form action={updateAutoLogoutTimerAction} className="mt-3 grid max-w-sm gap-2 sm:grid-cols-[1fr_auto]">
            <input
              name="autoLogoutMinutes"
              type="number"
              min={1}
              max={240}
              step={1}
              defaultValue={autoLogoutMinutes}
              required
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Сохранить
            </button>
          </form>
          <p className="mt-1 text-xs text-slate-500">Допустимо от 1 до 240 минут.</p>
        </article>
      ) : null}

      {isSuperAdmin ? (
        <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <h3 className="text-base font-semibold text-slate-900">Курс валют</h3>
          <p className="mt-1 text-sm text-slate-600">Управление курсом CNY → USD для новых контейнеров.</p>
          <Link
            href="/settings/currency"
            className="mt-3 inline-flex rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Открыть настройки курса
          </Link>
        </article>
      ) : null}

      {isSuperAdmin ? (
        <ServerTimeCard
          serverNowLabel={serverNowLabel}
          systemNowLabel={systemNowLabel}
          serverTimeAuto={autoMode}
          serverTimeZone={timeZone}
          manualDateTimeValue={manualDateTimeValue}
          canManage={canManageServerTime}
        />
      ) : null}

      <BackupCard
        lastBackupLabel={lastBackupLabel}
        autoBackups={backups
          .filter((item) => item.mode === "auto")
          .map((item) => ({
            fileName: item.fileName,
            createdAtLabel: item.createdAt.toLocaleString("ru-RU"),
          }))}
        canRestore={canRestoreBackup}
      />

      {isSuperAdmin ? <ResetBusinessDataCard /> : null}

      {isSuperAdmin ? (
        <UserAccessSection
          users={users.map((user) => ({
            ...user,
            createdAt: user.createdAt.toISOString(),
            canEdit: canManageSuperAdmin || (session.role === Role.ADMIN && user.role !== Role.SUPER_ADMIN),
          }))}
          canManageSuperAdmin={canManageSuperAdmin}
        />
      ) : null}
    </section>
  );
}
