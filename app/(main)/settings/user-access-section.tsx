"use client";

import { useMemo, useState } from "react";
import { Role } from "@prisma/client";
import { createUserAction, updateUserAccessAction } from "@/app/(main)/settings/actions";
import { CustomSelect } from "@/components/custom-select";

type UserRow = {
  id: string;
  name: string;
  login: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  canEdit: boolean;
};

type UserAccessSectionProps = {
  users: UserRow[];
  canManageSuperAdmin: boolean;
};

const ROLE_OPTIONS = [
  { value: Role.SUPER_ADMIN, label: "Супер-админ" },
  { value: Role.ADMIN, label: "Администратор" },
  { value: Role.MANAGER, label: "Менеджер" },
  { value: Role.ACCOUNTANT, label: "Бухгалтер" },
  { value: Role.INVESTOR, label: "Инвестор" },
  { value: Role.WAREHOUSE, label: "Склад" },
];

export function UserAccessSection({ users, canManageSuperAdmin }: UserAccessSectionProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const filteredRoleOptions = useMemo(
    () => ROLE_OPTIONS.filter((item) => canManageSuperAdmin || item.value !== Role.SUPER_ADMIN),
    [canManageSuperAdmin],
  );

  const editingUser = users.find((user) => user.id === editingUserId) ?? null;

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Пользователи и роли</h3>
          <p className="mt-1 text-sm text-slate-600">
            Выдача ролей, логинов и паролей для сотрудников.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Создать пользователя
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Пользователь</th>
              <th className="px-3 py-2 font-medium">Роль</th>
              <th className="px-3 py-2 font-medium">Доступ</th>
              <th className="px-3 py-2 font-medium">Дата</th>
              <th className="px-3 py-2 font-medium">Изменить</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 text-slate-800">
                  <p className="font-medium">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.login}</p>
                </td>
                <td className="px-3 py-2 text-slate-700">{user.role}</td>
                <td className="px-3 py-2 text-slate-700">{user.isActive ? "Активен" : "Отключен"}</td>
                <td className="px-3 py-2 text-slate-600">{new Date(user.createdAt).toLocaleDateString("ru-RU")}</td>
                <td className="px-3 py-2">
                  {user.canEdit ? (
                    <button
                      type="button"
                      onClick={() => setEditingUserId(user.id)}
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Изменить
                    </button>
                  ) : (
                    <p className="text-xs text-slate-500">Недоступно</p>
                  )}
                </td>
              </tr>
            ))}
            {!users.length ? (
              <tr>
                <td className="px-3 py-4 text-center text-slate-500" colSpan={5}>
                  Пользователи не найдены.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {createOpen ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className="text-base font-semibold text-slate-900">Создать пользователя</h4>
            <form action={createUserAction} className="mt-3 grid gap-2">
              <input
                name="name"
                required
                placeholder="Имя"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
              <input
                name="login"
                required
                placeholder="Логин"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
              <input
                name="password"
                type="password"
                required
                placeholder="Пароль"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
              <CustomSelect
                name="role"
                required
                defaultValue={Role.MANAGER}
                options={filteredRoleOptions}
              />
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Создать
              </button>
            </form>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingUser ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4"
          onClick={() => setEditingUserId(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className="text-base font-semibold text-slate-900">Изменение пользователя</h4>
            <p className="mt-1 text-sm text-slate-600">{editingUser.name}</p>
            <form action={updateUserAccessAction} className="mt-3 grid gap-2">
              <input type="hidden" name="userId" value={editingUser.id} />
              <input
                name="name"
                defaultValue={editingUser.name}
                required
                className="rounded border border-[var(--border)] px-2 py-2"
              />
              <input
                name="login"
                defaultValue={editingUser.login}
                required
                className="rounded border border-[var(--border)] px-2 py-2"
              />
              <input
                name="password"
                type="password"
                placeholder="Новый пароль (опц.)"
                className="rounded border border-[var(--border)] px-2 py-2"
              />
              <CustomSelect
                name="role"
                defaultValue={editingUser.role}
                options={filteredRoleOptions}
              />
              <label className="flex items-center gap-2 rounded border border-[var(--border)] px-2 py-2 text-xs">
                <input type="checkbox" name="isActive" defaultChecked={editingUser.isActive} />
                Активен
              </label>
              <button
                type="submit"
                className="rounded bg-[var(--accent)] px-2 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Сохранить пользователя
              </button>
            </form>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setEditingUserId(null)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
