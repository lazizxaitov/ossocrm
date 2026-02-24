"use server";

import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, signSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type LoginState = {
  error: string | null;
};

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const login = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const entryPoint = String(formData.get("entryPoint") ?? "system");

  if (!login || !password) {
    return { error: "Введите логин и пароль." };
  }

  const user = await prisma.user.findUnique({ where: { login } });
  if (!user || !user.isActive) {
    return { error: "Неверные учетные данные." };
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return { error: "Неверные учетные данные." };
  }

  if (entryPoint === "warehouse" && user.role !== Role.WAREHOUSE) {
    return { error: "Вход в склад доступен только роли Склад." };
  }

  const token = await signSessionToken({
    userId: user.id,
  });

  (await cookies()).set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
  });

  if (user.role === Role.WAREHOUSE || entryPoint === "warehouse") {
    redirect("/warehouse");
  }

  if (user.role === Role.INVESTOR) {
    redirect("/investor");
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  (await cookies()).delete(AUTH_COOKIE_NAME);
  redirect("/login");
}
