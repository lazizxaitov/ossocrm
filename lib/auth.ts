import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AUTH_COOKIE_NAME,
  signSessionToken,
  type SessionRole,
  verifySessionToken,
} from "@/lib/session-token";
import { ensureDailyBackup } from "@/lib/backup";
import { prisma } from "@/lib/prisma";

export { AUTH_COOKIE_NAME, signSessionToken, verifySessionToken };

export async function getSession() {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const payload = await verifySessionToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, name: true, login: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) return null;
    try {
      await ensureDailyBackup();
    } catch {
      // Ошибки backup не должны блокировать авторизацию.
    }
    return {
      userId: user.id,
      name: user.name,
      login: user.login,
      role: user.role,
    };
  } catch {
    return null;
  }
}

export async function getRequiredSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export function canAccessRole(userRole: SessionRole, allowedRoles: SessionRole[]) {
  return allowedRoles.includes(userRole);
}

export function isWarehouseRole(role: SessionRole) {
  return role === "WAREHOUSE";
}
