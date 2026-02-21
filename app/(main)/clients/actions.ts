"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequiredSession } from "@/lib/auth";
import { toNumber } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { CLIENTS_MANAGE_ROLES } from "@/lib/rbac";

function assertCanManage(role: string) {
  if (!CLIENTS_MANAGE_ROLES.includes(role as (typeof CLIENTS_MANAGE_ROLES)[number])) {
    throw new Error("Недостаточно прав для изменения клиентов.");
  }
}

function redirectWithError(message: string) {
  redirect(`/clients?error=${encodeURIComponent(message)}`);
}

function redirectWithSuccess(message: string) {
  redirect(`/clients?success=${encodeURIComponent(message)}`);
}

export async function createClientAction(formData: FormData) {
  try {
    const session = await getRequiredSession();
    assertCanManage(session.role);

    const name = String(formData.get("name") ?? "").trim();
    const company = String(formData.get("company") ?? "").trim();
    const inn = String(formData.get("inn") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();
    const comment = String(formData.get("comment") ?? "").trim();
    const creditLimitUSD = toNumber(formData.get("creditLimitUSD"));

    if (!name || !Number.isFinite(creditLimitUSD) || creditLimitUSD < 0) {
      throw new Error("Проверьте данные клиента.");
    }

    await prisma.client.create({
      data: {
        name,
        company: company || null,
        inn: inn || null,
        phone: phone || null,
        address: address || null,
        comment: comment || null,
        creditLimitUSD,
      },
    });

    revalidatePath("/clients");
    revalidatePath("/sales");
    redirectWithSuccess("Клиент создан.");
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Не удалось создать клиента.");
  }
}

export async function updateClientAction(formData: FormData) {
  try {
    const session = await getRequiredSession();
    assertCanManage(session.role);

    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const company = String(formData.get("company") ?? "").trim();
    const inn = String(formData.get("inn") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();
    const comment = String(formData.get("comment") ?? "").trim();
    const creditLimitUSD = toNumber(formData.get("creditLimitUSD"));

    if (!id || !name || !Number.isFinite(creditLimitUSD) || creditLimitUSD < 0) {
      throw new Error("Проверьте данные клиента.");
    }

    await prisma.client.update({
      where: { id },
      data: {
        name,
        company: company || null,
        inn: inn || null,
        phone: phone || null,
        address: address || null,
        comment: comment || null,
        creditLimitUSD,
      },
    });

    revalidatePath("/clients");
    revalidatePath("/sales");
    redirectWithSuccess("Клиент обновлен.");
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Не удалось обновить клиента.");
  }
}
