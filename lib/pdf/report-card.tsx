import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { PDF_FONT, PDF_SERIF, registerPdfFonts } from "./fonts";
import { BANNER_RATIO, type PdfImage } from "./images";
import type { ExamResults } from "@/lib/data/results";
import { formatDate } from "@/lib/dates";
import { formatPercent, ordinal } from "@/lib/results";

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: PDF_FONT, fontSize: 10, color: "#1f2937" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 2, borderBottomColor: "#1e3a8a", paddingBottom: 10 },
  logo: { width: 56, height: 56, objectFit: "contain" },
  bannerWrap: { borderBottomWidth: 2, borderBottomColor: "#1e3a8a", paddingBottom: 6 },
  banner: { width: 523, height: 523 / BANNER_RATIO },
  school: { fontFamily: PDF_SERIF, fontWeight: 700, fontSize: 18, color: "#1e3a8a" },
  muted: { color: "#6b7280" },
  title: { marginTop: 14, fontSize: 13, fontWeight: 700, textAlign: "center" },
  info: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: "#d1d5db", borderRadius: 4, padding: 8 },
  infoItem: { width: "50%", paddingVertical: 3 },
  label: { fontSize: 8, color: "#6b7280" },
  table: { marginTop: 14, borderWidth: 1, borderColor: "#d1d5db" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  headRow: { backgroundColor: "#eff6ff" },
  cell: { padding: 6 },
  cSubject: { flex: 3 },
  cNum: { flex: 1, textAlign: "right" },
  bold: { fontWeight: 700 },
  summary: { marginTop: 14, flexDirection: "row", gap: 8 },
  box: { flex: 1, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 4, padding: 8, alignItems: "center" },
  big: { fontSize: 14, fontWeight: 700, marginTop: 2 },
  signs: { position: "absolute", bottom: 48, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between" },
  sign: { width: 180, alignItems: "center" },
  signImg: { height: 36, width: 140, objectFit: "contain" },
  signLine: { borderTopWidth: 1, borderTopColor: "#6b7280", width: "100%", marginTop: 4, paddingTop: 3, textAlign: "center" },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 7, color: "#9ca3af", textAlign: "center" },
});

export type ReportCardBranding = {
  schoolName: string; address: string | null; headmasterName: string | null;
  banner?: PdfImage | null; logo: PdfImage | null; signature: PdfImage | null; classTeacherName: string | null;
};

export async function renderReportCards(data: ExamResults, studentIds: string[] | null, b: ReportCardBranding) {
  registerPdfFonts();
  const ranked = data.results.filter((r) => r.rank !== null).length;
  const rows = data.results
    .filter((r) => !studentIds || studentIds.includes(r.id))
    .sort((a, c) => a.name.localeCompare(c.name));

  const doc = (
    <Document title={`${data.exam.name} - ${data.className}`} author={b.schoolName}>
      {rows.map((r) => {
        const att = data.attendance[r.id];
        return (
          <Page key={r.id} size="A4" style={s.page}>
            {b.banner ? (
              <View style={s.bannerWrap}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
                <Image src={b.banner} style={s.banner} />
              </View>
            ) : (
              <View style={s.header}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                {b.logo && <Image src={b.logo} style={s.logo} />}
                <View>
                  <Text style={s.school}>{b.schoolName}</Text>
                  {b.address && <Text style={s.muted}>{b.address}</Text>}
                </View>
              </View>
            )}

            <Text style={s.title}>Report Card · {data.exam.name} · {data.yearName}</Text>

            <View style={s.info}>
              <View style={s.infoItem}><Text style={s.label}>Student</Text><Text style={s.bold}>{r.name}</Text>
                {r.nameMl && <Text>{r.nameMl}</Text>}</View>
              <View style={s.infoItem}><Text style={s.label}>Admission no</Text><Text>{r.admissionNo}</Text></View>
              <View style={s.infoItem}><Text style={s.label}>Class</Text><Text>{data.className}</Text></View>
              <View style={s.infoItem}><Text style={s.label}>Exam date</Text>
                <Text>{data.exam.exam_date ? formatDate(data.exam.exam_date) : "-"}</Text></View>
            </View>

            <View style={s.table}>
              <View style={[s.row, s.headRow]}>
                <Text style={[s.cell, s.cSubject, s.bold]}>Subject</Text>
                <Text style={[s.cell, s.cNum, s.bold]}>Maximum</Text>
                <Text style={[s.cell, s.cNum, s.bold]}>Obtained</Text>
              </View>
              {data.subjects.map((sub) => (
                <View key={sub.id} style={s.row}>
                  <Text style={[s.cell, s.cSubject]}>{sub.name}</Text>
                  <Text style={[s.cell, s.cNum]}>{sub.max}</Text>
                  <Text style={[s.cell, s.cNum]}>{r.marks[sub.id] ?? "-"}</Text>
                </View>
              ))}
              <View style={[s.row, s.headRow]}>
                <Text style={[s.cell, s.cSubject, s.bold]}>Total</Text>
                <Text style={[s.cell, s.cNum, s.bold]}>{r.subjectsEntered ? r.max : "-"}</Text>
                <Text style={[s.cell, s.cNum, s.bold]}>{r.subjectsEntered ? r.total : "-"}</Text>
              </View>
            </View>

            <View style={s.summary}>
              <View style={s.box}><Text style={s.label}>Percentage</Text><Text style={s.big}>{formatPercent(r.percentage)}</Text></View>
              <View style={s.box}><Text style={s.label}>Rank</Text>
                <Text style={s.big}>{r.rank ? `${ordinal(r.rank)} of ${ranked}` : "-"}</Text></View>
              <View style={s.box}><Text style={s.label}>Attendance ({data.yearName})</Text>
                <Text style={s.big}>{att ? `${att.present + att.late} / ${att.days}` : "-"}</Text></View>
            </View>

            <View style={s.signs} fixed>
              <View style={s.sign}>
                <Text style={s.signLine}>Class teacher{b.classTeacherName ? `: ${b.classTeacherName}` : ""}</Text>
              </View>
              <View style={s.sign}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                {b.signature && <Image src={b.signature} style={s.signImg} />}
                <Text style={s.signLine}>Headmaster{b.headmasterName ? `: ${b.headmasterName}` : ""}</Text>
              </View>
            </View>
            <Text style={s.footer} fixed>Generated on {formatDate(new Date().toISOString())}</Text>
          </Page>
        );
      })}
    </Document>
  );
  return renderToBuffer(doc);
}
