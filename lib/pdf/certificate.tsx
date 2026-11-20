import "server-only";
import QRCode from "qrcode";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { PDF_FONT, PDF_SERIF, registerPdfFonts } from "./fonts";
import { BANNER_RATIO, type PdfImage } from "./images";
import type { CertificateRow } from "@/lib/supabase/types";
import { formatDate } from "@/lib/dates";
import { publicEnv } from "@/lib/env";

const NAVY = "#1e3a8a";
const GOLD = "#b45309";

const s = StyleSheet.create({
  page: { padding: 24, fontFamily: PDF_FONT, color: "#1f2937" },
  outer: { flex: 1, borderWidth: 4, borderColor: NAVY, padding: 6 },
  inner: { flex: 1, borderWidth: 1, borderColor: GOLD, paddingHorizontal: 48, paddingVertical: 28, alignItems: "center" },
  logo: { width: 64, height: 64, objectFit: "contain", marginBottom: 6 },
  banner: { width: 600, height: 600 / BANNER_RATIO },
  titleAfterBanner: { marginTop: 12, fontSize: 28 },
  school: { fontFamily: PDF_SERIF, fontWeight: 700, fontSize: 22, color: NAVY, textAlign: "center" },
  address: { fontSize: 10, color: "#6b7280", marginTop: 2 },
  title: { fontFamily: PDF_SERIF, fontWeight: 700, fontSize: 30, color: GOLD, marginTop: 18, textAlign: "center" },
  nameMl: { fontSize: 14, color: NAVY, marginTop: 8 },
  body: { fontSize: 14, lineHeight: 1.7, textAlign: "center", marginTop: 22, maxWidth: 620 },
  bottom: { position: "absolute", left: 64, right: 64, bottom: 46, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  sign: { width: 190, alignItems: "center" },
  signImg: { height: 40, width: 150, objectFit: "contain" },
  signLine: { borderTopWidth: 1, borderTopColor: "#6b7280", width: "100%", marginTop: 4, paddingTop: 3, fontSize: 10, textAlign: "center" },
  center: { alignItems: "center" },
  qr: { width: 64, height: 64 },
  meta: { fontSize: 8, color: "#6b7280", marginTop: 3, textAlign: "center" },
  revoked: {
    position: "absolute", top: "40%", left: 0, right: 0, textAlign: "center", fontSize: 72, fontWeight: 700,
    color: "#dc2626", opacity: 0.25, transform: "rotate(-20deg)",
  },
});

export type CertificateBranding = {
  schoolName: string; address: string | null; headmasterName: string | null;
  banner?: PdfImage | null; logo: PdfImage | null; signature: PdfImage | null;
};

export function verifyUrl(certificateNo: string) {
  return `${publicEnv.siteUrl().replace(/\/$/, "")}/verify/${encodeURIComponent(certificateNo)}`;
}

type Cert = Pick<CertificateRow, "id" | "certificate_no" | "title" | "body_text" | "student_name" | "student_name_ml"
  | "class_teacher_name" | "issued_on" | "revoked">;

export async function renderCertificates(certs: Cert[], b: CertificateBranding) {
  registerPdfFonts();
  const qrs = await Promise.all(certs.map((c) =>
    QRCode.toDataURL(verifyUrl(c.certificate_no), { margin: 0, width: 256, errorCorrectionLevel: "M" })));

  const doc = (
    <Document title={certs.length === 1 ? certs[0].certificate_no : "Certificates"} author={b.schoolName}>
      {certs.map((c, i) => (
        <Page key={c.id} size="A4" orientation="landscape" style={s.page}>
          <View style={s.outer}>
            <View style={s.inner}>
              {b.banner ? (
                // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
                <Image src={b.banner} style={s.banner} />
              ) : (
                <>
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  {b.logo && <Image src={b.logo} style={s.logo} />}
                  <Text style={s.school}>{b.schoolName}</Text>
                  {b.address && <Text style={s.address}>{b.address}</Text>}
                </>
              )}
              <Text style={[s.title, b.banner ? s.titleAfterBanner : {}]}>{c.title}</Text>
              {/* the wording itself contains {student_name}; show the Malayalam name under it */}
              <Text style={s.body}>{c.body_text}</Text>
              {c.student_name_ml && <Text style={s.nameMl}>{c.student_name_ml}</Text>}
            </View>
          </View>

          <View style={s.bottom}>
            <View style={s.sign}>
              <Text style={s.signLine}>{`Class teacher\n${c.class_teacher_name ?? " "}`}</Text>
            </View>
            <View style={s.center}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={qrs[i]} style={s.qr} />
              <Text style={s.meta}>{c.certificate_no} · {formatDate(c.issued_on)}</Text>
            </View>
            <View style={s.sign}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              {b.signature && <Image src={b.signature} style={s.signImg} />}
              <Text style={s.signLine}>{`Headmaster\n${b.headmasterName ?? " "}`}</Text>
            </View>
          </View>
          {c.revoked && <Text style={s.revoked}>REVOKED</Text>}
        </Page>
      ))}
    </Document>
  );
  return renderToBuffer(doc);
}
