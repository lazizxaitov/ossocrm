import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";

const MAX_AUTO_BACKUPS = 5;
const DB_ENTRY_PATH = "database/dev.db";
const UPLOADS_ROOT_RELATIVE = path.join("public", "uploads");

type BackupMode = "auto" | "manual";

export type BackupFileInfo = {
  fileName: string;
  fullPath: string;
  createdAt: Date;
  mode: BackupMode;
};

function resolveSqliteDbPath() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) {
    throw new Error("Backup поддерживается только для SQLite.");
  }

  const raw = url.slice("file:".length);
  if (!raw) {
    throw new Error("Некорректный DATABASE_URL для SQLite.");
  }

  if (path.isAbsolute(raw)) return raw;
  if (raw.startsWith("./") || raw.startsWith("../")) return path.resolve(process.cwd(), "prisma", raw);
  return path.resolve(process.cwd(), raw);
}

function getBackupsDir() {
  return path.resolve(process.cwd(), "backups");
}

function getUploadsRootAbsolute() {
  return path.resolve(process.cwd(), UPLOADS_ROOT_RELATIVE);
}

function formatPart(value: number) {
  return String(value).padStart(2, "0");
}

function buildBackupName(now: Date, mode: BackupMode, ext: "db" | "zip") {
  const yyyy = now.getFullYear();
  const mm = formatPart(now.getMonth() + 1);
  const dd = formatPart(now.getDate());
  const hh = formatPart(now.getHours());
  const min = formatPart(now.getMinutes());
  const ss = formatPart(now.getSeconds());
  return `${mode}-backup-${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}.${ext}`;
}

function parseModeFromFileName(fileName: string): BackupMode {
  return fileName.startsWith("manual-") ? "manual" : "auto";
}

function parseDateFromFileName(fileName: string) {
  const m = fileName.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  if (!m) return new Date(0);
  const [, y, mo, d, h, mi, s] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

async function touchLastBackup(now: Date) {
  await prisma.systemControl.upsert({
    where: { id: 1 },
    update: { lastBackupAt: now },
    create: {
      id: 1,
      lastBackupAt: now,
      inventoryCheckedAt: null,
      warehouseDiscrepancyCount: 0,
      plannedMonthlyExpensesUSD: 0,
      serverTimeOffsetMinutes: 0,
      serverTimeAuto: true,
      serverTimeZone: "UTC",
      manualSystemTime: null,
    },
  });
}

async function walkFilesRecursive(baseDir: string, currentDir = baseDir): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkFilesRecursive(baseDir, full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

async function buildFullBackupZipBuffer() {
  const zip = new JSZip();
  const dbPath = resolveSqliteDbPath();
  const dbData = await readFile(dbPath);
  zip.file(DB_ENTRY_PATH, dbData);

  const uploadsRoot = getUploadsRootAbsolute();
  try {
    const uploadsStat = await stat(uploadsRoot);
    if (uploadsStat.isDirectory()) {
      const files = await walkFilesRecursive(uploadsRoot);
      for (const fullFilePath of files) {
        const relativeToProject = path.relative(process.cwd(), fullFilePath).replace(/\\/g, "/");
        zip.file(relativeToProject, await readFile(fullFilePath));
      }
    }
  } catch {
    // uploads может отсутствовать; это нормальная ситуация.
  }

  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    includes: ["database", "public/uploads"],
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

async function cleanupOldAutoBackups() {
  const list = (await listBackups()).filter((item) => item.mode === "auto");
  if (list.length <= MAX_AUTO_BACKUPS) return;

  const toDelete = list.slice(MAX_AUTO_BACKUPS);
  await Promise.all(toDelete.map((item) => rm(item.fullPath, { force: true })));
}

export async function listBackups(): Promise<BackupFileInfo[]> {
  const backupsDir = getBackupsDir();
  await mkdir(backupsDir, { recursive: true });

  const entries = await readdir(backupsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".db"))
    .map((entry) => {
      const fullPath = path.join(backupsDir, entry.name);
      return {
        fileName: entry.name,
        fullPath,
        createdAt: parseDateFromFileName(entry.name),
        mode: parseModeFromFileName(entry.name),
      } satisfies BackupFileInfo;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function createDatabaseBackup(mode: BackupMode = "manual") {
  const now = new Date();
  const sourceDbPath = resolveSqliteDbPath();
  const backupsDir = getBackupsDir();
  const fileName = buildBackupName(now, mode, "db");
  const targetPath = path.join(backupsDir, fileName);

  await mkdir(backupsDir, { recursive: true });
  await copyFile(sourceDbPath, targetPath);
  await touchLastBackup(now);

  if (mode === "auto") {
    await cleanupOldAutoBackups();
  }

  return { fileName, fullPath: targetPath, createdAt: now, mode };
}

export async function createDownloadBackup() {
  const now = new Date();
  const fileName = buildBackupName(now, "manual", "zip");
  const buffer = await buildFullBackupZipBuffer();
  await touchLastBackup(now);
  return { fileName, buffer };
}

export async function ensureDailyBackup() {
  const control = await prisma.systemControl.findUnique({
    where: { id: 1 },
    select: { lastBackupAt: true },
  });

  const now = new Date();
  const last = control?.lastBackupAt;
  const needsBackup = !last || now.getTime() - last.getTime() >= 24 * 60 * 60 * 1000;
  if (!needsBackup) return null;

  return createDatabaseBackup("auto");
}

async function restoreDbFromBuffer(buffer: Buffer) {
  const dbPath = resolveSqliteDbPath();
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;

  await prisma.$disconnect();
  await writeFile(dbPath, buffer);
  await rm(walPath, { force: true });
  await rm(shmPath, { force: true });
}

async function restoreUploadsFromZip(zip: JSZip) {
  const uploadsRoot = getUploadsRootAbsolute();
  await rm(uploadsRoot, { recursive: true, force: true });

  const uploadEntries = Object.values(zip.files).filter(
    (entry) => !entry.dir && entry.name.startsWith("public/uploads/"),
  );

  for (const entry of uploadEntries) {
    const fullPath = path.resolve(process.cwd(), entry.name);
    await mkdir(path.dirname(fullPath), { recursive: true });
    const data = await entry.async("nodebuffer");
    await writeFile(fullPath, data);
  }
}

export async function restoreDatabaseFromBuffer(fileName: string, buffer: Buffer) {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".db")) {
    await restoreDbFromBuffer(buffer);
    return;
  }

  if (!lowerName.endsWith(".zip")) {
    throw new Error("Поддерживаются только файлы .db или .zip.");
  }

  const zip = await JSZip.loadAsync(buffer);
  const dbEntry = zip.file(DB_ENTRY_PATH);
  if (!dbEntry) {
    throw new Error("В архиве нет файла базы данных (database/dev.db).");
  }

  const dbBuffer = await dbEntry.async("nodebuffer");
  await restoreDbFromBuffer(dbBuffer);
  await restoreUploadsFromZip(zip);
}

export async function restoreDatabaseBackup(fileName: string) {
  const safeName = path.basename(fileName || "");
  if (!safeName || safeName !== fileName || !safeName.endsWith(".db")) {
    throw new Error("Некорректный файл backup.");
  }

  const backups = await listBackups();
  const selected = backups.find((item) => item.fileName === safeName);
  if (!selected) {
    throw new Error("Backup не найден.");
  }

  await restoreDbFromBuffer(await readFile(selected.fullPath));
}
