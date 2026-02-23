"use server";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/lib/auth";
import { toNumber } from "@/lib/currency";
import { assertOpenPeriodForDate } from "@/lib/financial-period";
import { prisma } from "@/lib/prisma";
import { PRODUCTS_MANAGE_ROLES } from "@/lib/rbac";
import { generateUniqueProductSku } from "@/lib/sku";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function safeImageExt(file: File) {
  const extByType: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };

  const byType = extByType[file.type];
  if (byType) return byType;

  const original = path.extname(file.name || "").toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(original)) {
    return original === ".jpeg" ? ".jpg" : original;
  }

  return ".jpg";
}

async function saveProductImage(file: File) {
  if (!file || file.size <= 0) return null;
  if (!file.type.startsWith("image/")) {
    throw new Error("Файл должен быть изображением.");
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("Размер изображения не должен превышать 5 МБ.");
  }

  const ext = safeImageExt(file);
  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", "products");

  await mkdir(uploadDir, { recursive: true });

  const filePath = path.join(uploadDir, fileName);
  const arrayBuffer = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(arrayBuffer));

  return `/uploads/products/${fileName}`;
}

export async function createProductAction(formData: FormData) {
  const session = await getRequiredSession();
  if (!PRODUCTS_MANAGE_ROLES.includes(session.role)) {
    throw new Error("Недостаточно прав для создания товара.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const size = String(formData.get("size") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const categoryIdRaw = String(formData.get("categoryId") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const costPriceUSD = toNumber(formData.get("costPriceUSD"));
  const salePriceUSD = toNumber(formData.get("salePriceUSD"));
  const imageFile = formData.get("image");

  if (
    !name ||
    !size ||
    !Number.isFinite(costPriceUSD) ||
    costPriceUSD <= 0 ||
    !Number.isFinite(salePriceUSD) ||
    salePriceUSD <= 0
  ) {
    throw new Error("Проверьте обязательные поля товара.");
  }

  await assertOpenPeriodForDate(new Date());
  const imagePath = imageFile instanceof File ? await saveProductImage(imageFile) : null;
  const sku = await generateUniqueProductSku();

  await prisma.product.create({
    data: {
      name,
      categoryId: categoryIdRaw || null,
      size,
      color: color || null,
      sku,
      description: description || null,
      imagePath,
      costPriceUSD,
      basePriceUSD: salePriceUSD,
    },
  });

  revalidatePath("/products");
}

export async function updateProductAction(formData: FormData) {
  const session = await getRequiredSession();
  if (!PRODUCTS_MANAGE_ROLES.includes(session.role)) {
    throw new Error("Недостаточно прав для редактирования товара.");
  }

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const size = String(formData.get("size") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const categoryIdRaw = String(formData.get("categoryId") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const costPriceUSD = toNumber(formData.get("costPriceUSD"));
  const salePriceUSD = toNumber(formData.get("salePriceUSD"));
  const currentImagePath = String(formData.get("currentImagePath") ?? "").trim();
  const imageFile = formData.get("image");

  if (
    !id ||
    !name ||
    !size ||
    !Number.isFinite(costPriceUSD) ||
    costPriceUSD <= 0 ||
    !Number.isFinite(salePriceUSD) ||
    salePriceUSD <= 0
  ) {
    throw new Error("Проверьте обязательные поля товара.");
  }

  await assertOpenPeriodForDate(new Date());
  const newImagePath = imageFile instanceof File ? await saveProductImage(imageFile) : null;

  await prisma.product.update({
    where: { id },
    data: {
      name,
      categoryId: categoryIdRaw || null,
      size,
      color: color || null,
      description: description || null,
      imagePath: newImagePath ?? (currentImagePath || null),
      costPriceUSD,
      basePriceUSD: salePriceUSD,
    },
  });

  revalidatePath("/products");
}
