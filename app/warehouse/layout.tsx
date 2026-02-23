import { getRequiredSession } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { redirect } from "next/navigation";
import { roleLabel } from "@/lib/rbac";
import Image from "next/image";
import { WarehousePwaRegister } from "@/app/warehouse/pwa-register";

export default async function WarehouseLayout({ children }: { children: React.ReactNode }) {
  const session = await getRequiredSession();
  if (session.role !== "WAREHOUSE") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(165deg,#ebf4ff_0%,#f5f9ff_54%,#ffffff_100%)] p-3 md:p-8">
      <WarehousePwaRegister />
      <main className="mx-auto max-w-5xl">
        <header className="mb-4 flex flex-col gap-3 rounded-3xl border border-[#c9d6ea] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] md:mb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Image
              src="/osso-logo-transparent.png"
              alt="OSSO"
              width={150}
              height={46}
              className="h-10 w-auto object-contain"
              priority
            />
            <h1 className="text-xl font-semibold text-slate-900">Складской режим</h1>
            <p className="text-sm text-slate-600">
              Пользователь: {session.name} ({roleLabel(session.role)})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/warehouse"
              className="rounded-lg border border-[#d4deee] bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
            >
              Главная
            </a>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Выход
              </button>
            </form>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
