"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/lib/auth";
import { toNumber } from "@/lib/currency";
import { assertOpenPeriodForDate } from "@/lib/financial-period";
import { prisma } from "@/lib/prisma";
import { PRODUCTS_MANAGE_ROLES } from "@/lib/rbac";

function buildSku(model: string, size: string) {
  const m = model
    .toUpperCase()
    .replace(/[^A-Z0-9А-ЯЁ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);
  const s = size
    .toUpperCase()
    .replace(/[^A-Z0-9А-ЯЁ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
  return `VANITY-${m || "MODEL"}-${s || "SIZE"}-${Date.now().toString().slice(-6)}`;
}

export async function createVanityAction(formData: FormData) {
  const session = await getRequiredSession();
  if (!PRODUCTS_MANAGE_ROLES.includes(session.role)) {
    throw new Error("Недостаточно прав для добавления тумбы.");
  }

  const model = String(formData.get("model") ?? "").trim();
  const size = String(formData.get("size") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const costPriceUSD = toNumber(formData.get("costPriceUSD"));
  const salePriceUSD = toNumber(formData.get("salePriceUSD"));

  if (
    !model ||
    !size ||
    !Number.isFinite(costPriceUSD) ||
    costPriceUSD <= 0 ||
    !Number.isFinite(salePriceUSD) ||
    salePriceUSD <= 0
  ) {
    throw new Error("Проверьте данные тумбы.");
  }

  await assertOpenPeriodForDate(new Date());

  const vanityCategory = await prisma.productCategory.upsert({
    where: { name: "Тумбы" },
    update: {},
    create: {
      name: "Тумбы",
      description: "Шкафы под раковину",
    },
    select: { id: true },
  });

  await prisma.product.create({
    data: {
      name: model,
      size,
      sku: buildSku(model, size),
      categoryId: vanityCategory.id,
      description: description || null,
      costPriceUSD,
      basePriceUSD: salePriceUSD,
    },
  });

  revalidatePath("/vanities");
  revalidatePath("/products");
}

export async function updateVanityAction(formData: FormData) {
  const session = await getRequiredSession();
  if (!PRODUCTS_MANAGE_ROLES.includes(session.role)) {
    throw new Error("Недостаточно прав для изменения тумбы.");
  }

  const id = String(formData.get("id") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const size = String(formData.get("size") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const costPriceUSD = toNumber(formData.get("costPriceUSD"));
  const salePriceUSD = toNumber(formData.get("salePriceUSD"));

  if (
    !id ||
    !model ||
    !size ||
    !Number.isFinite(costPriceUSD) ||
    costPriceUSD <= 0 ||
    !Number.isFinite(salePriceUSD) ||
    salePriceUSD <= 0
  ) {
    throw new Error("Проверьте данные тумбы.");
  }

  await assertOpenPeriodForDate(new Date());

  await prisma.product.update({
    where: { id },
    data: {
      name: model,
      size,
      description: description || null,
      costPriceUSD,
      basePriceUSD: salePriceUSD,
    },
  });

  revalidatePath("/vanities");
  revalidatePath("/products");
}

export async function deleteVanityAction(formData: FormData) {
  const session = await getRequiredSession();
  if (!PRODUCTS_MANAGE_ROLES.includes(session.role)) {
    throw new Error("Недостаточно прав для удаления тумбы.");
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    throw new Error("Тумба не найдена.");
  }

  await assertOpenPeriodForDate(new Date());

  try {
    await prisma.product.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new Error("Нельзя удалить тумбу: она уже используется в контейнерах или продажах.");
    }
    throw error;
  }

  revalidatePath("/vanities");
  revalidatePath("/products");
  revalidatePath("/containers");
  revalidatePath("/sales");
  revalidatePath("/stock");
}
