import "server-only";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * Registers embedded fonts for every generated PDF.
 * Text uses ["NotoSans", "NotoSansMalayalam"] so Latin glyphs come from Noto Sans
 * and Malayalam falls back to Noto Sans Malayalam within the same line.
 *
 * NOTE: fontkit 2.0.4 crashes on Malayalam mark positioning (null GPOS anchors).
 * patches/fontkit+2.0.4.patch fixes it and is applied on install by patch-package.
 */
let registered = false;

export const PDF_FONT = ["NotoSans", "NotoSansMalayalam"] as unknown as string;
export const PDF_SERIF = ["NotoSerif", "NotoSansMalayalam"] as unknown as string;

export function registerPdfFonts() {
  if (registered) return;
  const dir = path.join(process.cwd(), "assets", "fonts");
  Font.register({
    family: "NotoSans",
    fonts: [
      { src: path.join(dir, "NotoSans-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "NotoSans-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "NotoSansMalayalam",
    fonts: [
      { src: path.join(dir, "NotoSansMalayalam-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "NotoSansMalayalam-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "NotoSerif",
    fonts: [
      { src: path.join(dir, "NotoSerif-Bold.ttf"), fontWeight: 700 },
      { src: path.join(dir, "NotoSerif-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
    ],
  });
  // Never hyphenate names.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
