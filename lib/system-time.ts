import { prisma } from "@/lib/prisma";

export async function getSystemNow() {
  const control = await prisma.systemControl.findUnique({
    where: { id: 1 },
    select: { serverTimeAuto: true, manualSystemTime: true },
  });

  if (!control) return new Date();
  if (control.serverTimeAuto) return new Date();
  return control.manualSystemTime ?? new Date();
}

