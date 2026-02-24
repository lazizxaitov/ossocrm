import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { StandardFonts, type PDFDocument, type PDFFont } from "pdf-lib";

type LoadedPdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
  cyrillicSupported: boolean;
};

async function readFirstExisting(paths: string[]) {
  for (const filePath of paths) {
    try {
      await access(filePath);
      return await readFile(filePath);
    } catch {
      // try next
    }
  }
  return null;
}

export async function loadPdfFonts(pdf: PDFDocument): Promise<LoadedPdfFonts> {
  try {
    const require = createRequire(import.meta.url);
    const fontkitModule = require("@pdf-lib/fontkit") as { default?: unknown };
    const fontkit = fontkitModule.default ?? fontkitModule;
    pdf.registerFontkit(fontkit as Parameters<PDFDocument["registerFontkit"]>[0]);

    const regularBytes = await readFirstExisting([
      process.env.PDF_FONT_REGULAR_PATH ?? "",
      "C:/Windows/Fonts/arial.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
      "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]);
    const boldBytes = await readFirstExisting([
      process.env.PDF_FONT_BOLD_PATH ?? "",
      "C:/Windows/Fonts/arialbd.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
      "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]);

    if (!regularBytes) {
      throw new Error("Regular font file not found");
    }

    const regular = await pdf.embedFont(regularBytes, { subset: true });
    const bold = await pdf.embedFont(boldBytes ?? regularBytes, { subset: true });
    return { regular, bold, cyrillicSupported: true };
  } catch {
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    return { regular, bold, cyrillicSupported: false };
  }
}

export function toPdfText(text: string, cyrillicSupported: boolean) {
  if (cyrillicSupported) return text;
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "?");
}

export function fitPdfText(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;
  const ellipsis = "...";
  let result = text;
  while (result.length > 1 && font.widthOfTextAtSize(`${result}${ellipsis}`, fontSize) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}${ellipsis}`;
}
