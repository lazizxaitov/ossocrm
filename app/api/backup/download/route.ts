import { NextResponse } from "next/server";
import { createDownloadBackup } from "@/lib/backup";
import { getSession } from "@/lib/auth";
import { SETTINGS_ROLES } from "@/lib/rbac";

export async function GET() {
  const session = await getSession();
  if (!session || !SETTINGS_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Нет доступа." }, { status: 403 });
  }

  const { fileName, buffer } = await createDownloadBackup();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=\"${fileName}\"`,
      "Cache-Control": "no-store",
    },
  });
}
