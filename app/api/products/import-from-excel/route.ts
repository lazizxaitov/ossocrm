import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertOpenPeriodForDate } from "@/lib/financial-period";
import { prisma } from "@/lib/prisma";
import { PRODUCTS_MANAGE_ROLES } from "@/lib/rbac";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

type ImportRow = {
  sku: string;
  name: string;
  size: string;
  color?: string | null;
  costPriceUSD: number;
  cbm?: number | null;
  kg?: number | null;
  salePriceUSD: number;
  imageKey?: string | null;
  categoryId?: string | null;
};

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

type ResponseBody =
  | { ok: true; products: Array<{ id: string; sku: string; name: string; size: string; color: string | null; imagePath: string | null; costPriceUSD: number; cbm: number | null; kg: number | null; basePriceUSD: number }> }
  | { ok: false; error: string };

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !PRODUCTS_MANAGE_ROLES.includes(session.role)) {
    return NextResponse.json<ResponseBody>({ ok: false, error: "Недостаточно прав для импорта товаров." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json<ResponseBody>({ ok: false, error: "Некорректные данные формы." }, { status: 400 });
  }

  const rowsJson = String(formData.get("rowsJson") ?? "").trim();
  if (!rowsJson) {
    return NextResponse.json<ResponseBody>({ ok: false, error: "Не переданы строки для импорта." }, { status: 400 });
  }

  let rows: ImportRow[] = [];
  try {
    rows = JSON.parse(rowsJson) as ImportRow[];
  } catch {
    rows = [];
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json<ResponseBody>({ ok: false, error: "Нет данных для импорта." }, { status: 400 });
  }

  await assertOpenPeriodForDate(new Date());

  const normalizedRows = rows
    .map((row) => ({
      sku: String(row.sku ?? "").trim(),
      name: String(row.name ?? "").trim(),
      size: String(row.size ?? "").trim() || "Без размера",
      color: String(row.color ?? "").trim() || null,
      costPriceUSD: Number(row.costPriceUSD),
      cbm: Number.isFinite(Number(row.cbm)) && Number(row.cbm) > 0 ? Number(row.cbm) : null,
      kg: Number.isFinite(Number(row.kg)) && Number(row.kg) > 0 ? Number(row.kg) : null,
      salePriceUSD: Number(row.salePriceUSD),
      imageKey: String(row.imageKey ?? "").trim() || null,
      categoryId: String(row.categoryId ?? "").trim() || null,
    }))
    .filter((row) => row.sku && row.name && Number.isFinite(row.costPriceUSD) && row.costPriceUSD > 0 && Number.isFinite(row.salePriceUSD) && row.salePriceUSD > 0);

  if (normalizedRows.length === 0) {
    return NextResponse.json<ResponseBody>({ ok: false, error: "Строки не прошли проверку (SKU/название/цены)." }, { status: 400 });
  }

  try {
    const products = await prisma.$transaction(async (tx) => {
      const out: Array<{ id: string; sku: string; name: string; size: string; color: string | null; imagePath: string | null; costPriceUSD: number; cbm: number | null; kg: number | null; basePriceUSD: number }> = [];

      const categoryIds = [...new Set(normalizedRows.map((row) => row.categoryId).filter(Boolean))] as string[];
      if (categoryIds.length > 0) {
        const existingCats = await tx.productCategory.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true },
        });
        const existingSet = new Set(existingCats.map((c) => c.id));
        const missing = categoryIds.filter((id) => !existingSet.has(id));
        if (missing.length > 0) {
          throw new Error("Одна или несколько категорий не найдены. Обновите страницу и попробуйте снова.");
        }
      }

      for (const row of normalizedRows) {
        const maybeImage = row.imageKey ? formData.get(row.imageKey) : null;
        const imageFile = maybeImage instanceof File ? maybeImage : null;
        const newImagePath = imageFile ? await saveProductImage(imageFile) : null;

        const existing = await tx.product.findUnique({ where: { sku: row.sku } });
        if (existing) {
          const updated = await tx.product.update({
            where: { id: existing.id },
            data: {
              name: row.name,
              size: row.size,
              color: row.color,
              costPriceUSD: row.costPriceUSD,
              cbm: row.cbm,
              kg: row.kg,
              basePriceUSD: row.salePriceUSD,
              imagePath: existing.imagePath ? undefined : newImagePath ?? undefined,
              categoryId: row.categoryId,
            },
            select: {
              id: true,
              sku: true,
              name: true,
              size: true,
              color: true,
              imagePath: true,
              costPriceUSD: true,
              cbm: true,
              kg: true,
              basePriceUSD: true,
            },
          });
          out.push(updated);
          continue;
        }

        const created = await tx.product.create({
          data: {
            sku: row.sku,
            name: row.name,
            size: row.size,
            color: row.color,
            description: null,
            imagePath: newImagePath,
            costPriceUSD: row.costPriceUSD,
            cbm: row.cbm,
            kg: row.kg,
            basePriceUSD: row.salePriceUSD,
            categoryId: row.categoryId,
          },
          select: {
            id: true,
            sku: true,
            name: true,
            size: true,
            color: true,
            imagePath: true,
            costPriceUSD: true,
            cbm: true,
            kg: true,
            basePriceUSD: true,
          },
        });
        out.push(created);
      }

      return out;
    });

    return NextResponse.json<ResponseBody>({ ok: true, products });
  } catch (e) {
    return NextResponse.json<ResponseBody>(
      { ok: false, error: e instanceof Error ? e.message : "Не удалось импортировать товары." },
      { status: 400 },
    );
  }
}
