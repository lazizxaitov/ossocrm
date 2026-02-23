import { redirect } from "next/navigation";
import Image from "next/image";
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/app/login/login-form";

export default async function LoginPage() {
  const session = await getSession();

  if (session?.role === "WAREHOUSE") {
    redirect("/warehouse");
  }
  if (session?.role === "INVESTOR") {
    redirect("/investor");
  }

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#ffffff_0%,#eef3f9_45%,#e8edf5_100%)] p-4">
      <main className="w-full max-w-md">
        <div className="mb-4 rounded-2xl bg-white p-6 shadow-[0_10px_26px_rgba(17,24,39,0.08)]">
          <Image
            src="/osso-logo-transparent.png"
            alt="OSSO"
            width={180}
            height={56}
            className="h-12 w-auto object-contain"
            priority
          />
          <p className="mt-2 text-sm text-slate-600">
            Войдите в систему для управления складом, клиентами и финансовой аналитикой.
          </p>
        </div>
        <LoginForm />
      </main>
    </div>
  );
}
