"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRODUCTS_MANAGE_ROLES } from "@/lib/rbac";

function assertCanManage(role: string) {
  if (!PRODUCTS_MANAGE_ROLES.includes(role as (typeof PRODUCTS_MANAGE_ROLES)[number])) {
    throw new Error("Недостаточно прав для управления категориями.");
  }
}

export async function createCategoryAction(formData: FormData) {
  const session = await getRequiredSession();
  assertCanManage(session.role);

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) {
    throw new Error("Введите название категории.");
  }

  await prisma.productCategory.create({
    data: {
      name,
      description: description || null,
    },
  });

  revalidatePath("/categories");
  revalidatePath("/products");
}

export async function updateCategoryAction(formData: FormData) {
  const session = await getRequiredSession();
  assertCanManage(session.role);

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!id || !name) {
    throw new Error("Проверьте данные категории.");
  }

  await prisma.productCategory.update({
    where: { id },
    data: {
      name,
      description: description || null,
    },
  });

  revalidatePath("/categories");
  revalidatePath("/products");
}

export async function deleteCategoryAction(formData: FormData) {
  const session = await getRequiredSession();
  assertCanManage(session.role);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    throw new Error("Категория не найдена.");
  }

  const usedCount = await prisma.product.count({
    where: { categoryId: id },
  });
  if (usedCount > 0) {
    throw new Error("Категория используется в товарах. Сначала измените категорию у товаров.");
  }

  await prisma.productCategory.delete({
    where: { id },
  });

  revalidatePath("/categories");
  revalidatePath("/products");
}
