import { prisma } from "@/lib/prisma";

function buildCandidateSku() {
  const timestamp = Date.now().toString();
  const randomPart = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `OSSO-${timestamp}${randomPart}`;
}

export async function generateUniqueProductSku() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const sku = buildCandidateSku();
    const exists = await prisma.product.findUnique({
      where: { sku },
      select: { id: true },
    });
    if (!exists) return sku;
  }
  throw new Error("Не удалось сгенерировать уникальный SKU. Повторите попытку.");
}
