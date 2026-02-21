import { MainNav } from "@/components/main-nav";
import { QuickActionsFab } from "@/components/quick-actions-fab";
import { getRequiredSession } from "@/lib/auth";
import { buildSystemAlerts } from "@/lib/dashboard";

export default async function MainAreaLayout({ children }: { children: React.ReactNode }) {
  const [session, alerts] = await Promise.all([getRequiredSession(), buildSystemAlerts()]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[linear-gradient(160deg,#f6f9ff_0%,#eef3fb_50%,#e7edf7_100%)] p-4 md:p-8">
      <main className="mx-auto w-full min-w-0 max-w-6xl">
        <MainNav role={session.role} name={session.name} alerts={alerts} />
        {children}
      </main>
      <QuickActionsFab role={session.role} />
    </div>
  );
}
