import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role === "WAREHOUSE") {
    redirect("/warehouse");
  }
  if (session.role === "INVESTOR") {
    redirect("/investor");
  }

  redirect("/dashboard");
}
