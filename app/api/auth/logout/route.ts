import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  (await cookies()).delete(AUTH_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
