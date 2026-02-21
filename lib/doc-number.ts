import { Prisma } from "@prisma/client";

function padNumber(num: number) {
  return String(num).padStart(6, "0");
}

export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  key: "INV" | "RET",
  date = new Date(),
) {
  const year = date.getFullYear();
  const counter = await tx.documentCounter.findUnique({ where: { key } });

  let next = 1;

  if (!counter) {
    await tx.documentCounter.create({
      data: { key, year, lastValue: next },
    });
  } else if (counter.year !== year) {
    next = 1;
    await tx.documentCounter.update({
      where: { key },
      data: { year, lastValue: next },
    });
  } else {
    next = counter.lastValue + 1;
    await tx.documentCounter.update({
      where: { key },
      data: { lastValue: next },
    });
  }

  return `${key}-${year}-${padNumber(next)}`;
}
