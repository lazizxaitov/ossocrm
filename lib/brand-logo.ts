import { readFile } from "node:fs/promises";
import path from "node:path";

function logoPath(withBackground = false) {
  const fileName = withBackground ? "osso-logo-bg.png" : "osso-logo-transparent.png";
  return path.join(process.cwd(), "public", fileName);
}

export async function getBrandLogoBytes(withBackground = false): Promise<Uint8Array | null> {
  try {
    const file = await readFile(logoPath(withBackground));
    return new Uint8Array(file);
  } catch {
    return null;
  }
}

export async function getBrandLogoDataUri(withBackground = false): Promise<string | null> {
  try {
    const file = await readFile(logoPath(withBackground));
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}
