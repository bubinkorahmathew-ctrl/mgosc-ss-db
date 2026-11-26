import "server-only";
/**
 * Receipt and payment voucher as A5 PDFs, in the certificate's style: church header, Cinzel
 * titles, Cormorant text, the amount in figures and in words, and signature lines.
 */
import path from "node:path";
import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { registerCertificateFonts } from "@/components/certificate/Certificate";
import { formatDate } from "@/lib/dates";
import { amountInWords, formatMoney, toCents, type Currency } from "@/lib/money";
import { PAYMENT_MODE_LABELS } from "@/lib/validation/accounts";
import { loadHeaderImage } from "./certificate";

const FONT_DIR = path.join(process.cwd(), "public", "fonts", "certificate");
const NAVY = "#14285a";
const MAROON = "#7a1f2b";
const GOLD = "#b08d3c";

const label = { fontFamily: "Cinzel", fontWeight: 600, fontSize: 7, letterSpacing: 1.2, color: "#6b6b6b" } as const;
const value = { fontFamily: "Cormorant", fontWeight: 600, fontSize: 12, color: "#222" } as const;

function Field({ name, children, wide = false }: { name: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <View style={{ width: wide ? "100%" : "50%", marginBottom: 8 }}>
      <Text style={label}>{name.toUpperCase()}</Text>
      <Text style={value}>{children}</Text>
    </View>
  );
}

/** A signature line; the name row is always there so labels line up side by side. */
function SignLine({ title, name, width }: { title: string; name?: string | null; width: number }) {
  return (
    <View style={{ width, alignItems: "center" }}>
      <View style={{ height: 30 }} />
      <View style={{ width: width - 14, borderTopWidth: 0.8, borderTopColor: GOLD }} />
      <Text style={{ fontFamily: "Cormorant", fontWeight: 600, fontSize: 10, marginTop: 3, minHeight: 12 }}>{name ?? " "}</Text>
      <Text style={{ ...label, color: MAROON, marginTop: 1 }}>{title.toUpperCase()}</Text>
    </View>
  );
}

type Slip = {
  title: string; no: string; date: string; currency: Currency; amount: string; void?: string | null; status?: string;
  fields: { name: string; value: string; wide?: boolean }[]; signatures: { title: string; name?: string | null }[];
};

function SlipPage({ s, header }: { s: Slip; header: string }) {
  const cents = toCents(s.amount);
  return (
    <Page size="A5" style={{ padding: 22, backgroundColor: "#fdfaf3" }}>
      <View style={{ flex: 1, borderWidth: 1.5, borderColor: NAVY, padding: 4 }}>
        <View style={{ flex: 1, borderWidth: 0.6, borderColor: GOLD, paddingHorizontal: 16, paddingVertical: 12 }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- a react-pdf image, not an HTML <img> */}
          <Image src={header} style={{ width: "100%", objectFit: "contain" }} />
          <Text style={{ fontFamily: "Cinzel", fontWeight: 700, fontSize: 17, letterSpacing: 3, color: NAVY, textAlign: "center", marginTop: 10 }}>
            {s.title}
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 10 }}>
            <View><Text style={label}>NO.</Text><Text style={{ fontFamily: "Cinzel", fontWeight: 700, fontSize: 10, color: NAVY }}>{s.no}</Text></View>
            <View style={{ alignItems: "flex-end" }}><Text style={label}>DATE</Text><Text style={{ ...value, fontSize: 11 }}>{formatDate(s.date)}</Text></View>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {s.fields.map((f) => <Field key={f.name} name={f.name} wide={f.wide}>{f.value}</Field>)}
          </View>

          <View style={{ borderWidth: 0.8, borderColor: GOLD, borderRadius: 3, padding: 8, marginTop: 4 }}>
            <Text style={label}>AMOUNT</Text>
            <Text style={{ fontFamily: "Cinzel", fontWeight: 700, fontSize: 15, color: NAVY, marginTop: 2 }}>{formatMoney(cents, s.currency)}</Text>
            <Text style={{ fontFamily: "Cormorant", fontWeight: 500, fontStyle: "italic", fontSize: 11, color: "#333", marginTop: 2 }}>
              {amountInWords(cents, s.currency.code)}
            </Text>
          </View>

          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
            {s.signatures.map((g) => (
              <SignLine key={g.title} title={g.title} name={g.name} width={s.signatures.length > 2 ? 112 : 150} />
            ))}
          </View>
        </View>
      </View>
      {s.void ? (
        <View style={{ position: "absolute", top: 230, left: 40, right: 40, alignItems: "center", transform: "rotate(-18deg)" }}>
          <Text style={{ fontFamily: "Cinzel", fontWeight: 700, fontSize: 44, color: "#b91c1c", opacity: 0.35, letterSpacing: 6 }}>VOID</Text>
          <Text style={{ fontFamily: "Cormorant", fontWeight: 600, fontSize: 11, color: "#b91c1c", opacity: 0.6 }}>{s.void}</Text>
        </View>
      ) : null}
    </Page>
  );
}

async function render(slips: Slip[]) {
  registerCertificateFonts(FONT_DIR);
  const header = await loadHeaderImage();
  return renderToBuffer(<Document>{slips.map((s) => <SlipPage key={s.no} s={s} header={header} />)}</Document>);
}

const modeText = (mode: string, ref: string | null) =>
  `${PAYMENT_MODE_LABELS[mode as keyof typeof PAYMENT_MODE_LABELS] ?? mode}${ref ? ` · ${ref}` : ""}`;

export type ReceiptPdf = {
  receiptNo: string; receiptDate: string; name: string; type: string; className: string | null; classSection: string | null;
  category: string; event: string | null; amount: string; mode: string; referenceNo: string | null; remarks: string | null;
  status: string; voidReason: string | null; collectorName: string;
};

export function renderReceipt(r: ReceiptPdf, currency: Currency) {
  const cls = r.className ? (r.classSection ? `${r.className} - ${r.classSection}` : r.className) : null;
  return render([{
    title: "RECEIPT", no: r.receiptNo, date: r.receiptDate, currency, amount: r.amount,
    void: r.status === "void" ? `Void: ${r.voidReason ?? ""}` : null,
    fields: [
      { name: "Received with thanks from", value: `${r.name}${cls ? ` (${cls})` : r.type === "teacher" ? " (Teacher)" : ""}`, wide: true },
      { name: "Towards", value: r.event ? `${r.category} · ${r.event}` : r.category, wide: true },
      { name: "Paid by", value: modeText(r.mode, r.referenceNo) },
      ...(r.remarks ? [{ name: "Remarks", value: r.remarks }] : []),
    ],
    signatures: [{ title: "Received by", name: r.collectorName }],
  }]);
}

export type VoucherPdf = {
  voucherNo: string; paymentDate: string; paidTo: string; category: string; event: string | null; amount: string;
  paymentMode: string; referenceNo: string | null; remarks: string | null; status: string; voidReason: string | null;
  requestedByName: string | null; approvedByName: string | null;
};

const VOUCHER_STATUS: Record<string, string> = { draft: "Draft (not approved)", approved: "Approved, not paid yet", paid: "Paid", void: "Void" };

export function renderVoucher(p: VoucherPdf, currency: Currency) {
  return render([{
    title: "PAYMENT VOUCHER", no: p.voucherNo, date: p.paymentDate, currency, amount: p.amount,
    void: p.status === "void" ? `Void: ${p.voidReason ?? ""}` : null,
    fields: [
      { name: "Paid to", value: p.paidTo, wide: true },
      { name: "For", value: p.event ? `${p.category} · ${p.event}` : p.category, wide: true },
      { name: "Paid by", value: modeText(p.paymentMode, p.referenceNo) },
      { name: "Status", value: VOUCHER_STATUS[p.status] ?? p.status },
      ...(p.remarks ? [{ name: "Remarks", value: p.remarks, wide: true }] : []),
    ],
    signatures: [
      { title: "Prepared by", name: p.requestedByName },
      { title: "Approved by", name: p.approvedByName },
      { title: "Receiver" },
    ],
  }]);
}
