"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { restoreBackupAction, restoreBackupFromComputerAction } from "@/app/(main)/settings/actions";

type BackupRow = {
  fileName: string;
  createdAtLabel: string;
};

type BackupCardProps = {
  lastBackupLabel: string;
  autoBackups: BackupRow[];
  canRestore: boolean;
};

function RestoreButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Восстановление..." : "Восстановить"}
    </button>
  );
}

export function BackupCard({ lastBackupLabel, autoBackups, canRestore }: BackupCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <h3 className="text-base font-semibold text-slate-900">Backup</h3>
      <p className="mt-1 text-sm text-slate-600">
        Автобэкап включен: копия базы создается автоматически раз в сутки.
      </p>
      <p className="mt-1 text-sm text-slate-600">
        Последний backup: <span className="font-medium text-slate-800">{lastBackupLabel}</span>
      </p>
      <p className="mt-1 text-xs text-slate-500">Хранятся только последние 5 авто-backup-файлов.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href="/api/backup/download"
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Скачать полный backup
        </a>
        {canRestore ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Восстановить
          </button>
        ) : (
          <span className="self-center text-xs text-slate-500">Восстановление доступно только SUPER_ADMIN.</span>
        )}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-base font-semibold text-slate-900">Восстановление backup</h4>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>

            <article className="mt-3 rounded-xl border border-[var(--border)] p-3">
              <h5 className="text-sm font-semibold text-slate-900">Восстановить из компьютера</h5>
              <form action={restoreBackupFromComputerAction} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  type="file"
                  name="backupFile"
                  accept=".db,.zip"
                  required
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                <RestoreButton />
              </form>
            </article>

            <article className="mt-3 rounded-xl border border-[var(--border)]">
              <div className="border-b border-[var(--border)] px-3 py-2">
                <h5 className="text-sm font-semibold text-slate-900">Список авто-backup</h5>
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--surface-soft)] text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Дата</th>
                      <th className="px-3 py-2 font-medium">Файл</th>
                      <th className="px-3 py-2 font-medium">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autoBackups.map((row) => (
                      <tr key={row.fileName} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2 text-slate-700">{row.createdAtLabel}</td>
                        <td className="px-3 py-2 text-slate-600">{row.fileName}</td>
                        <td className="px-3 py-2">
                          <form action={restoreBackupAction}>
                            <input type="hidden" name="fileName" value={row.fileName} />
                            <RestoreButton />
                          </form>
                        </td>
                      </tr>
                    ))}
                    {!autoBackups.length ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                          Авто-backup пока не создан.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </div>
      ) : null}
    </article>
  );
}
