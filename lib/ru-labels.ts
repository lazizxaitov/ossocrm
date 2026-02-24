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
  IN_TRANSIT: "Р’ РїСѓС‚Рё",
  ARRIVED: "РџСЂРёР±С‹Р»",
  CLOSED: "Р—Р°РєСЂС‹С‚",
  OPEN: "РћС‚РєСЂС‹С‚",
  LOCKED: "Р—Р°РєСЂС‹С‚",
  COMPLETED: "Р—Р°РІРµСЂС€РµРЅРѕ",
  PARTIALLY_PAID: "Р§Р°СЃС‚РёС‡РЅРѕ РѕРїР»Р°С‡РµРЅРѕ",
  DEBT: "Р’ РґРѕР»Рі",
  RETURNED: "Р’РѕР·РІСЂР°С‰РµРЅРѕ",
  PENDING: "РћР¶РёРґР°РµС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ",
  CONFIRMED: "РџРѕРґС‚РІРµСЂР¶РґРµРЅРѕ",
  DISCREPANCY: "Р•СЃС‚СЊ СЂР°СЃС…РѕР¶РґРµРЅРёСЏ",
  IN_PROGRESS: "Р’ РїСЂРѕС†РµСЃСЃРµ",
  SOLD_OUT: "РџСЂРѕРґР°РЅРѕ",
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "РЎСѓРїРµСЂР°РґРјРёРЅ",
  ADMIN: "РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ",
  MANAGER: "РњРµРЅРµРґР¶РµСЂ",
  ACCOUNTANT: "Р‘СѓС…РіР°Р»С‚РµСЂ",
  INVESTOR: "РРЅРІРµСЃС‚РѕСЂ",
  WAREHOUSE: "РЎРєР»Р°Рґ",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE_EXPENSE: "РЎРѕР·РґР°РЅРёРµ СЂР°СЃС…РѕРґР°",
  CREATE_EXPENSE_CORRECTION: "РЎРѕР·РґР°РЅРёРµ РєРѕСЂСЂРµРєС‚РёСЂРѕРІРєРё СЂР°СЃС…РѕРґР°",
  CREATE_OPERATING_EXPENSE: "Создание операционного расхода",
  CREATE_RETURN: "РЎРѕР·РґР°РЅРёРµ РІРѕР·РІСЂР°С‚Р°",
  DELETE_SALE: "РЈРґР°Р»РµРЅРёРµ РїСЂРѕРґР°Р¶Рё",
  LOCK_FINANCIAL_PERIOD: "Р—Р°РєСЂС‹С‚РёРµ С„РёРЅР°РЅСЃРѕРІРѕРіРѕ РїРµСЂРёРѕРґР°",
  UNLOCK_FINANCIAL_PERIOD: "Р Р°Р·Р±Р»РѕРєРёСЂРѕРІРєР° С„РёРЅР°РЅСЃРѕРІРѕРіРѕ РїРµСЂРёРѕРґР°",
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


