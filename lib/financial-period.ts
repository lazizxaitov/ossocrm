import { prisma } from "@/lib/prisma";
import { getSystemNow } from "@/lib/system-time";

export function monthYearFromDate(date: Date) {
  return { month: date.getMonth() + 1, year: date.getFullYear() };
}

function periodKey(period: { year: number; month: number }) {
  return period.year * 100 + period.month;
}

async function getOrCreateByMonthYear(month: number, year: number) {
  const existing = await prisma.financialPeriod.findUnique({
    where: { month_year: { month, year } },
  });
  if (existing) return existing;
  return prisma.financialPeriod.create({
    data: { month, year, status: "OPEN" },
  });
}

export async function getOrCreateFinancialPeriodByDate(date: Date) {
  const { month, year } = monthYearFromDate(date);
  return getOrCreateByMonthYear(month, year);
}

export async function getCurrentFinancialPeriod() {
  const now = await getSystemNow();
  const nowPeriod = monthYearFromDate(now);
  const nowKey = periodKey(nowPeriod);

  const currentCalendarPeriod = await prisma.financialPeriod.findUnique({
    where: { month_year: { month: nowPeriod.month, year: nowPeriod.year } },
  });

  if (currentCalendarPeriod) {
    // Если период текущего календарного месяца уже есть, работаем только с ним.
    return currentCalendarPeriod;
  }

  const latestPastOrCurrent = await prisma.financialPeriod.findFirst({
    where: {
      OR: [
        { year: { lt: nowPeriod.year } },
        { year: nowPeriod.year, month: { lte: nowPeriod.month } },
      ],
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  if (!latestPastOrCurrent) {
    return getOrCreateByMonthYear(nowPeriod.month, nowPeriod.year);
  }

  const latestKey = periodKey(latestPastOrCurrent);

  if (latestKey < nowKey && latestPastOrCurrent.status === "OPEN") {
    // Если прошлый месяц не закрыт, в новый месяц не переходим.
    return latestPastOrCurrent;
  }

  // Предыдущий месяц закрыт, и уже наступил новый календарный месяц.
  // Переход выполняем только по календарю (на текущий месяц).
  return getOrCreateByMonthYear(nowPeriod.month, nowPeriod.year);
}

export async function getPreviousFinancialPeriod(date = new Date()) {
  const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const { month, year } = monthYearFromDate(prev);
  return prisma.financialPeriod.findUnique({
    where: { month_year: { month, year } },
  });
}

export async function assertOpenPeriodForDate(date: Date) {
  void date;
  const period = await getCurrentFinancialPeriod();
  if (period.status === "LOCKED") {
    throw new Error(`Финансовый период ${period.month}.${period.year} закрыт.`);
  }
  return period;
}

export async function assertOpenPeriodById(periodId: string) {
  const period = await prisma.financialPeriod.findUnique({ where: { id: periodId } });
  if (!period) {
    throw new Error("Финансовый период не найден.");
  }
  if (period.status === "LOCKED") {
    throw new Error(`Финансовый период ${period.month}.${period.year} закрыт.`);
  }
  return period;
}
