type KnownStatus =
  | "IN_TRANSIT"
  | "ARRIVED"
  | "CLOSED"
  | "OPEN"
  | "LOCKED"
  | "COMPLETED"
  | "PARTIALLY_PAID"
  | "DEBT"
  | "RETURNED"
  | "PENDING"
  | "CONFIRMED"
  | "DISCREPANCY"
  | "IN_PROGRESS"
  | "SOLD_OUT";

const STATUS_LABELS: Record<KnownStatus, string> = {
  IN_TRANSIT: "В пути",
  ARRIVED: "Прибыл",
  CLOSED: "Закрыт",
  OPEN: "Открыт",
  LOCKED: "Закрыт",
  COMPLETED: "Завершено",
  PARTIALLY_PAID: "Частично оплачено",
  DEBT: "В долг",
  RETURNED: "Возвращено",
  PENDING: "Ожидает подтверждения",
  CONFIRMED: "Подтверждено",
  DISCREPANCY: "Есть расхождения",
  IN_PROGRESS: "В процессе",
  SOLD_OUT: "Продано",
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Суперадмин",
  ADMIN: "Администратор",
  MANAGER: "Менеджер",
  ACCOUNTANT: "Бухгалтер",
  INVESTOR: "Инвестор",
  WAREHOUSE: "Склад",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE_EXPENSE: "Создание расхода",
  CREATE_EXPENSE_CORRECTION: "Создание корректировки расхода",
  CREATE_RETURN: "Создание возврата",
  DELETE_SALE: "Удаление продажи",
  LOCK_FINANCIAL_PERIOD: "Закрытие финансового периода",
  UNLOCK_FINANCIAL_PERIOD: "Разблокировка финансового периода",
};

export function ruStatus(value: string) {
  return STATUS_LABELS[value as KnownStatus] ?? value;
}

export function ruRole(value: string) {
  return ROLE_LABELS[value] ?? value;
}

export function ruAuditAction(value: string) {
  return AUDIT_ACTION_LABELS[value] ?? value;
}
