import { SessionRole } from "@/lib/session-token";

export const DASHBOARD_ROLES: SessionRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "ACCOUNTANT",
  "INVESTOR",
];

export const SETTINGS_ROLES: SessionRole[] = ["SUPER_ADMIN", "ADMIN"];

export const WAREHOUSE_ROLES: SessionRole[] = ["SUPER_ADMIN", "ADMIN", "WAREHOUSE"];

export const PRODUCTS_VIEW_ROLES: SessionRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "ACCOUNTANT",
  "MANAGER",
  "WAREHOUSE",
];

export const PRODUCTS_MANAGE_ROLES: SessionRole[] = ["SUPER_ADMIN", "ADMIN"];

export const CONTAINERS_VIEW_ROLES: SessionRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "ACCOUNTANT",
  "WAREHOUSE",
];

export const CONTAINERS_MANAGE_ROLES: SessionRole[] = ["SUPER_ADMIN", "ADMIN"];

export const CLIENTS_VIEW_ROLES: SessionRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "ACCOUNTANT",
];

export const CLIENTS_MANAGE_ROLES: SessionRole[] = ["SUPER_ADMIN", "ADMIN", "MANAGER"];

export const SALES_VIEW_ROLES: SessionRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "ACCOUNTANT",
];

export const SALES_MANAGE_ROLES: SessionRole[] = ["SUPER_ADMIN", "ADMIN", "MANAGER"];

export const INVESTORS_VIEW_ROLES: SessionRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];

export const INVESTORS_MANAGE_ROLES: SessionRole[] = ["SUPER_ADMIN", "ADMIN"];

export const INVESTOR_PORTAL_ROLES: SessionRole[] = ["INVESTOR"];

export const EXPENSES_VIEW_ROLES: SessionRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];

export const EXPENSES_ADD_ROLES: SessionRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];

export const EXPENSES_CORRECTION_ROLES: SessionRole[] = ["SUPER_ADMIN", "ADMIN"];

export const AUDIT_VIEW_ROLES: SessionRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];

export const PERIODS_VIEW_ROLES: SessionRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];

export const PERIODS_MANAGE_ROLES: SessionRole[] = ["SUPER_ADMIN", "ADMIN"];

export const PERIODS_UNLOCK_ROLES: SessionRole[] = ["SUPER_ADMIN"];

export const INVENTORY_SESSIONS_VIEW_ROLES: SessionRole[] = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];

export function roleLabel(role: SessionRole) {
  switch (role) {
    case "SUPER_ADMIN":
      return "Супер-админ";
    case "ADMIN":
      return "Администратор";
    case "MANAGER":
      return "Менеджер";
    case "ACCOUNTANT":
      return "Бухгалтер";
    case "INVESTOR":
      return "Инвестор";
    case "WAREHOUSE":
      return "Склад";
    default:
      return role;
  }
}
