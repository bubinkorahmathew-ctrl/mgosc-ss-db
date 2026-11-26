import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatDate, todayISO } from "@/lib/dates";
import type { XlsxSheet } from "@/lib/xlsx";
import { PDF_FONT, registerPdfFonts } from "./fonts";
import { BANNER_RATIO, type PdfImage } from "./images";

const NAVY = "#1e3a8a";
const s = StyleSheet.create({
  page: { paddingTop: 24, paddingHorizontal: 24, paddingBottom: 36, fontFamily: PDF_FONT, fontSize: 8.5, color: "#1f2937" },
  banner: { width: 360, height: 360 / BANNER_RATIO, alignSelf: "center", marginBottom: 8 },
  title: { fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 8 },
  table: { borderTopWidth: 0.5, borderLeftWidth: 0.5, borderColor: "#9ca3af" },
  row: { flexDirection: "row" },
  head: { backgroundColor: "#eff6ff" },
  cell: { borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: "#9ca3af", paddingVertical: 3, paddingHorizontal: 4 },
  bold: { fontWeight: 700 },
  footer: { position: "absolute", bottom: 14, left: 24, right: 24, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#6b7280" },
});

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/**
 * A report table as a PDF: the same sheets as the Excel export, one section per sheet, the
 * banner on top, the header row repeated on every page. Column widths follow the Excel widths.
 */
export async function renderTableReport(sheets: XlsxSheet[], banner: PdfImage | null): Promise<Buffer> {
  registerPdfFonts();
  const doc = (
    <Document title={sheets[0]?.title ?? "Report"}>
      {sheets.map((sh) => {
        const widths = sh.columns.map((c) => c.width ?? Math.max(10, c.header.length + 2));
        const total = widths.reduce((a, b) => a + b, 0);
        const landscape = total > 90;
        const pct = (w: number) => `${(w / total) * 100}%`;
        return (
          <Page key={sh.name} size="A4" orientation={landscape ? "landscape" : "portrait"} style={s.page} wrap>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            {banner && <Image src={banner} style={s.banner} />}
            <Text style={s.title}>{sh.title ?? sh.name}</Text>
            <View style={s.table}>
              <View style={[s.row, s.head]} fixed>
                {sh.columns.map((c, i) => <Text key={c.key} style={[s.cell, s.bold, { width: pct(widths[i]) }]}>{c.header}</Text>)}
              </View>
              {sh.rows.length ? sh.rows.map((r, ri) => (
                <View key={ri} style={s.row} wrap={false}>
                  {sh.columns.map((c, i) => <Text key={c.key} style={[s.cell, { width: pct(widths[i]) }]}>{text(r[c.key])}</Text>)}
                </View>
              )) : (
                <View style={s.row}><Text style={[s.cell, { width: "100%" }]}>No rows.</Text></View>
              )}
            </View>
            <View style={s.footer} fixed>
              <Text>Generated on {formatDate(todayISO())}</Text>
              <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
            </View>
          </Page>
        );
      })}
    </Document>
  );
  return renderToBuffer(doc);
}
