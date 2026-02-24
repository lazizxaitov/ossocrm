"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AUDIT_VIEW_ROLES,
  CLIENTS_VIEW_ROLES,
  CONTAINERS_VIEW_ROLES,
  DASHBOARD_ROLES,
  EXPENSES_VIEW_ROLES,
  INVESTOR_PORTAL_ROLES,
  INVESTORS_VIEW_ROLES,
  INVENTORY_SESSIONS_VIEW_ROLES,
  PERIODS_VIEW_ROLES,
  PRODUCTS_VIEW_ROLES,
  SALES_VIEW_ROLES,
  SETTINGS_ROLES,
  WAREHOUSE_ROLES,
} from "@/lib/rbac";
import { logoutAction } from "@/app/login/actions";
import { SessionRole } from "@/lib/session-token";

type MainNavProps = {
  role: SessionRole;
  name: string;
  alerts: Array<{ level: "critical" | "warning"; text: string }>;
};

type NavLink = {
  href: string;
  label: string;
};

type MenuSection = {
  title: string;
  caption: string;
  links: NavLink[];
};

function isLinkActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MainNav({ role, name, alerts }: MainNavProps) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  const canViewProducts = PRODUCTS_VIEW_ROLES.includes(role);
  const canViewContainers = CONTAINERS_VIEW_ROLES.includes(role);
  const canViewSettings = SETTINGS_ROLES.includes(role);
  const canViewDashboard = DASHBOARD_ROLES.includes(role);
  const canViewClients = CLIENTS_VIEW_ROLES.includes(role);
  const canViewSales = SALES_VIEW_ROLES.includes(role);
  const canViewWarehouse = WAREHOUSE_ROLES.includes(role);
  const canViewInvestors = INVESTORS_VIEW_ROLES.includes(role);
  const canViewExpenses = EXPENSES_VIEW_ROLES.includes(role);
  const canViewInvestorPortal = INVESTOR_PORTAL_ROLES.includes(role);
  const canViewAudit = AUDIT_VIEW_ROLES.includes(role);
  const canViewPeriods = PERIODS_VIEW_ROLES.includes(role);
  const canViewInventorySessions = INVENTORY_SESSIONS_VIEW_ROLES.includes(role);

  const mainLinks = useMemo(() => {
    const links: NavLink[] = [];
    if (canViewInvestorPortal) links.push({ href: "/investor", label: "РњРѕР№ РєР°Р±РёРЅРµС‚" });
    return links;
  }, [canViewInvestorPortal]);

  const warehouseLinks = useMemo(() => {
    const links: NavLink[] = [];
    if (canViewProducts) links.push({ href: "/categories", label: "РљР°С‚РµРіРѕСЂРёРё" });
    if (canViewProducts) links.push({ href: "/vanities", label: "РўСѓРјР±С‹" });
    if (canViewProducts) links.push({ href: "/products", label: "РўРѕРІР°СЂС‹" });
    if (canViewContainers) links.push({ href: "/containers", label: "РљРѕРЅС‚РµР№РЅРµСЂС‹" });
    if (canViewWarehouse) links.push({ href: role === "WAREHOUSE" ? "/warehouse" : "/stock", label: "РЎРєР»Р°Рґ" });
    if (canViewInventorySessions) links.push({ href: "/inventory-sessions", label: "РРЅРІРµРЅС‚Р°СЂРёР·Р°С†РёСЏ" });
    return links;
  }, [canViewProducts, canViewContainers, canViewWarehouse, canViewInventorySessions, role]);

  const salesLinks = useMemo(() => {
    const links: NavLink[] = [];
    if (canViewClients) links.push({ href: "/clients", label: "РљР»РёРµРЅС‚С‹" });
    if (canViewSales) links.push({ href: "/sales", label: "РџСЂРѕРґР°Р¶Рё" });
    return links;
  }, [canViewClients, canViewSales]);

  const financeLinks = useMemo(() => {
    const links: NavLink[] = [];
    if (canViewExpenses) links.push({ href: "/expenses", label: "Расходы" });
    if (canViewInvestors) links.push({ href: "/investors", label: "РРЅРІРµСЃС‚РѕСЂС‹" });
    if (canViewPeriods) links.push({ href: "/financial-periods", label: "РџРµСЂРёРѕРґС‹" });
    if (canViewAudit) links.push({ href: "/audit", label: "Р–СѓСЂРЅР°Р»" });
    return links;
  }, [canViewExpenses, canViewInvestors, canViewPeriods, canViewAudit]);

  const sections = useMemo<MenuSection[]>(
    () => [
      { title: "Р“Р»Р°РІРЅРѕРµ", caption: "Р‘С‹СЃС‚СЂС‹Р№ РґРѕСЃС‚СѓРї", links: mainLinks },
      { title: "РЎРєР»Р°Рґ Рё С‚РѕРІР°СЂС‹", caption: "РћСЃС‚Р°С‚РєРё Рё РєРѕРЅС‚РµР№РЅРµСЂС‹", links: warehouseLinks },
      { title: "РџСЂРѕРґР°Р¶Рё", caption: "РљР»РёРµРЅС‚С‹ Рё СЂРµР°Р»РёР·Р°С†РёРё", links: salesLinks },
      { title: "Р¤РёРЅР°РЅСЃС‹ Рё РєРѕРЅС‚СЂРѕР»СЊ", caption: "РРЅРІРµСЃС‚РѕСЂС‹ Рё РѕС‚С‡РµС‚С‹", links: financeLinks },
    ].filter((section) => section.links.length > 0),
    [mainLinks, warehouseLinks, salesLinks, financeLinks],
  );

  function renderSection(section: MenuSection) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-slate-50/60 p-1.5">
        <p className="px-2 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
          {section.title}
        </p>
        <p className="px-2 pb-0.5 text-[10px] text-slate-500">{section.caption}</p>
        <div className="grid gap-1">
          {section.links.map((link) => {
            const active = isLinkActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpenMenu(null)}
                className={`rounded-md px-2 py-1.5 text-sm transition ${
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  const notificationsOpen = openMenu === "notifications";
  const mainMenuOpen = openMenu === "main";
  const settingsOpen = openMenu === "settings";
  const criticalAlerts = alerts.filter((alert) => alert.level === "critical");
  const tickerText = criticalAlerts.length
    ? criticalAlerts.map((alert) => `Р’РђР–РќРћ: ${alert.text}`).join(" вЂў ")
    : "Р’Р°Р¶РЅС‹С… СѓРІРµРґРѕРјР»РµРЅРёР№ РЅРµС‚";

  return (
    <header
      ref={headerRef}
      className="mb-6 rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] md:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {canViewDashboard ? (
            <Link
              href="/dashboard"
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                isLinkActive(pathname, "/dashboard")
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Р“Р»Р°РІРЅР°СЏ
            </Link>
          ) : null}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((prev) => (prev === "main" ? null : "main"))}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-expanded={mainMenuOpen}
            >
              РњРµРЅСЋ
            </button>
            {mainMenuOpen ? (
              <div className="absolute left-0 z-30 mt-2 w-[260px] rounded-xl border border-[var(--border)] bg-white p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.12)]">
                <p className="px-2 py-1 text-[11px] font-semibold text-slate-700">Р Р°Р·РґРµР»С‹</p>
                <div className="grid gap-1.5">
                  {sections.map((section) => (
                    <div key={section.title}>{renderSection(section)}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <Image
            src="/osso-logo-transparent.png"
            alt="OSSO"
            width={110}
            height={34}
            className="h-8 w-auto object-contain"
            priority
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden h-10 w-[360px] items-center overflow-hidden rounded-lg border border-[var(--border)] bg-white px-2 md:flex">
            <div className="osso-ticker-track flex flex-nowrap items-center gap-8 text-xs font-medium text-red-700">
              <span className="shrink-0 whitespace-nowrap">{tickerText}</span>
              <span aria-hidden="true" className="shrink-0 whitespace-nowrap">{tickerText}</span>
            </div>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((prev) => (prev === "notifications" ? null : "notifications"))}
              className="relative rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-expanded={notificationsOpen}
            >
              РЈРІРµРґРѕРјР»РµРЅРёСЏ
              {alerts.length > 0 ? (
                <span className="ml-2 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                  {alerts.length}
                </span>
              ) : null}
            </button>
            {notificationsOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-[320px] rounded-xl border border-[var(--border)] bg-white p-2 shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  РЎРёСЃС‚РµРјРЅС‹Рµ СѓРІРµРґРѕРјР»РµРЅРёСЏ
                </p>
                <div className="mt-1 max-h-72 space-y-1 overflow-auto">
                  {alerts.map((alert, idx) => (
                    <div
                      key={`${alert.text}-${idx}`}
                      className={`rounded-lg border px-2 py-2 text-xs ${
                        alert.level === "critical"
                          ? "border-red-200 bg-red-50 text-red-800"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                    >
                      {alert.text}
                    </div>
                  ))}
                  {!alerts.length ? (
                    <p className="rounded-lg border border-[var(--border)] bg-slate-50 px-2 py-2 text-xs text-slate-600">
                      РљСЂРёС‚РёС‡РЅС‹С… СѓРІРµРґРѕРјР»РµРЅРёР№ РЅРµС‚.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((prev) => (prev === "settings" ? null : "settings"))}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-expanded={settingsOpen}
            >
              РќР°СЃС‚СЂРѕР№РєРё
            </button>
            {settingsOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-[220px] rounded-xl border border-[var(--border)] bg-white p-2 shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
                <p className="px-2 py-1 text-xs text-slate-500">{name}</p>
                {canViewSettings ? (
                  <Link
                    href="/settings"
                    onClick={() => setOpenMenu(null)}
                    className="block rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    РќР°СЃС‚СЂРѕР№РєРё РїСЂРёР»РѕР¶РµРЅРёСЏ
                  </Link>
                ) : null}
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="mt-1 w-full rounded-lg bg-slate-900 px-2 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Р’С‹С…РѕРґ
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}


