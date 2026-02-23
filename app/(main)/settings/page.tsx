import Link from "next/link";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { updateAutoLogoutTimerAction } from "@/app/(main)/settings/actions";
import { BackupCard } from "@/app/(main)/settings/backup-card";
import { ServerTimeCard } from "@/app/(main)/settings/server-time-card";
import { UserAccessSection } from "@/app/(main)/settings/user-access-section";
import { getRequiredSession } from "@/lib/auth";
import { listBackups } from "@/lib/backup";
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
