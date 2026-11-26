import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Svg,
  Path,
  Rect,
  Line,
  Circle,
  Polygon,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Font,
  StyleSheet,
} from "@react-pdf/renderer";
import path from "path";

/* ------------------------------------------------------------------ */
/*  MGOSC SS DB Hub – certificate template (A4 landscape, react-pdf)   */
/* ------------------------------------------------------------------ */

export type Signatory = {
  name: string;
  /** optional PNG/JPG of the signature (data URL, file path or https URL) */
  signatureUrl?: string;
};

export type CertificateProps = {
  /** Big title, default "CERTIFICATE" */
  heading?: string;
  /** Line under the title, e.g. "OF MERIT", "OF EXCELLENCE", "OF ATTENDANCE" */
  subtitle: string;
  studentName: string;
  /** Optional Malayalam spelling of the name */
  studentNameMl?: string;
  /** Final wording – placeholders are already replaced by the app */
  body: string;
  /** Small facts row, e.g. Class, Academic Year, Grade, Rank */
  details?: { label: string; value: string }[];
  issueDate: string;
  certificateNo: string;
  verifyUrl: string;
  /** data URL of the QR code (generate with the `qrcode` package) */
  qrDataUrl?: string;
  vicar: Signatory;
  headmaster: Signatory;
  /** Colour theme */
  accent?: "navy" | "burgundy" | "teal";
  /** Path or URL of the church / Sunday school header banner */
  headerImage: string;
  /** App addition: a faint diagonal REVOKED stamp over a revoked certificate */
  revoked?: boolean;
};

const W = 841.89; // A4 landscape, points
const H = 595.28;

const THEMES = {
  navy: { main: "#14285a", second: "#7b1e3a" },
  burgundy: { main: "#6f1a33", second: "#14285a" },
  teal: { main: "#0d5f68", second: "#7b1e3a" },
};
const GOLD = "#b8902f";
const GOLD_LIGHT = "#ecd078";
const GOLD_DARK = "#8a6416";
const INK = "#2b2b2b";

let fontsReady = false;
/** Call once. `dir` is the folder that holds the .woff files. */
export function registerCertificateFonts(dir: string) {
  if (fontsReady) return;
  const f = (n: string) => path.join(dir, n);
  Font.register({
    family: "Cinzel",
    fonts: [
      { src: f("cinzel-latin-600-normal.woff"), fontWeight: 600 },
      { src: f("cinzel-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  // the student's name: Dancing Script, chosen by the school as easier to read than Great Vibes
  Font.register({
    family: "NameScript",
    src: f("dancing-script-latin-700-normal.woff"),
  });
  Font.register({
    family: "Cormorant",
    fonts: [
      { src: f("cormorant-garamond-latin-500-normal.woff"), fontWeight: 500 },
      {
        src: f("cormorant-garamond-latin-500-italic.woff"),
        fontWeight: 500,
        fontStyle: "italic",
      },
      { src: f("cormorant-garamond-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
  Font.register({
    family: "NotoSerifMalayalam",
    src: f("noto-serif-malayalam-malayalam-600-normal.woff"),
    fontWeight: 600,
  });
  Font.registerHyphenationCallback((w) => [w]);
  fontsReady = true;
}

/* ---------- small vector helpers ---------- */

/** Cross pattée polygon points */
function crossPoints(cx: number, cy: number, r: number) {
  const w1 = r * 0.2;
  const w2 = r * 0.5;
  const pts = [
    [cx - w1, cy - w1], [cx - w2, cy - r], [cx + w2, cy - r], [cx + w1, cy - w1],
    [cx + r, cy - w2], [cx + r, cy + w2], [cx + w1, cy + w1],
    [cx + w2, cy + r], [cx - w2, cy + r], [cx - w1, cy + w1],
    [cx - r, cy + w2], [cx - r, cy - w2],
  ];
  return pts.map((p) => p.join(",")).join(" ");
}

/** Scalloped circle (seal edge) */
function scallopPoints(cx: number, cy: number, r: number, n: number, amp: number) {
  const pts: string[] = [];
  for (let i = 0; i < n * 8; i++) {
    const t = (i / (n * 8)) * Math.PI * 2;
    const rr = r + amp * Math.cos(n * t);
    pts.push(`${(cx + rr * Math.cos(t)).toFixed(2)},${(cy + rr * Math.sin(t)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/* ---------- background: paper, borders, corners ---------- */

function Background({ main, second }: { main: string; second: string }) {
  const corner = (x: number, y: number, sx: number, sy: number) => {
    // L shaped double line + small cross, mirrored by sx / sy
    const a = 34;
    const len = 58;
    return (
      <>
        <Line x1={x} y1={y + sy * a} x2={x} y2={y + sy * (a + len)} stroke={GOLD} strokeWidth={1.2} />
        <Line x1={x + sx * a} y1={y} x2={x + sx * (a + len)} y2={y} stroke={GOLD} strokeWidth={1.2} />
        <Polygon points={crossPoints(x + sx * 20, y + sy * 20, 9)} fill={second} />
        <Circle cx={x + sx * 20} cy={y + sy * 20} r={2} fill={GOLD_LIGHT} />
      </>
    );
  };
  return (
    <View style={{ position: "absolute", left: 0, top: 0, width: W, height: H }}>
    <Svg width={W} height={H}>
      <Defs>
        <RadialGradient id="paper" cx="50%" cy="48%" r="75%">
          <Stop offset="0%" stopColor="#fffdf8" />
          <Stop offset="70%" stopColor="#fbf5ea" />
          <Stop offset="100%" stopColor="#f1e6cf" />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#paper)" />
      {/* faint watermark cross */}
      <Polygon points={crossPoints(W / 2, H / 2 + 30, 120)} fill={GOLD} opacity={0.045} />
      {/* frames */}
      <Rect x={14} y={14} width={W - 28} height={H - 28} stroke={main} strokeWidth={4.5} fill="none" />
      <Rect x={22} y={22} width={W - 44} height={H - 44} stroke={GOLD} strokeWidth={1.4} fill="none" />
      <Rect x={26.5} y={26.5} width={W - 53} height={H - 53} stroke={main} strokeWidth={0.6} fill="none" />
      {/* corner ornaments (inside the frame) */}
      {corner(34, 34, 1, 1)}
      {corner(W - 34, 34, -1, 1)}
      {corner(34, H - 34, 1, -1)}
      {corner(W - 34, H - 34, -1, -1)}
    </Svg>
    </View>
  );
}

function Divider({ color, second }: { color: string; second: string }) {
  const w = 330;
  const h = 14;
  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id="dl" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={GOLD} stopOpacity={0} />
          <Stop offset="1" stopColor={GOLD} stopOpacity={1} />
        </LinearGradient>
        <LinearGradient id="dr" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={GOLD} stopOpacity={1} />
          <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={h / 2 - 0.6} width={w / 2 - 20} height={1.2} fill="url(#dl)" />
      <Rect x={w / 2 + 20} y={h / 2 - 0.6} width={w / 2 - 20} height={1.2} fill="url(#dr)" />
      <Polygon points={crossPoints(w / 2, h / 2, 6.5)} fill={second} />
      <Polygon
        points={`${w / 2 - 15},${h / 2} ${w / 2 - 10},${h / 2 - 3} ${w / 2 - 5},${h / 2} ${w / 2 - 10},${h / 2 + 3}`}
        fill={color}
      />
      <Polygon
        points={`${w / 2 + 15},${h / 2} ${w / 2 + 10},${h / 2 - 3} ${w / 2 + 5},${h / 2} ${w / 2 + 10},${h / 2 + 3}`}
        fill={color}
      />
    </Svg>
  );
}

function Seal({ second }: { second: string }) {
  const s = 92;
  const c = s / 2;
  return (
    <Svg width={76} height={91} viewBox={`0 0 ${s} ${s + 18}`}>
      <Defs>
        <LinearGradient id="goldg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#f6e394" />
          <Stop offset="0.5" stopColor="#c9a13b" />
          <Stop offset="1" stopColor="#8a6416" />
        </LinearGradient>
        <LinearGradient id="goldg2" x1="1" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#f6e394" />
          <Stop offset="1" stopColor="#a67c1c" />
        </LinearGradient>
      </Defs>
      {/* ribbon tails */}
      <Polygon points={`${c - 22},${c + 26} ${c - 6},${c + 30} ${c - 14},${s + 16} ${c - 22},${s + 8} ${c - 30},${s + 16} ${c - 34},${c + 34}`} fill={second} />
      <Polygon points={`${c + 22},${c + 26} ${c + 6},${c + 30} ${c + 14},${s + 16} ${c + 22},${s + 8} ${c + 30},${s + 16} ${c + 34},${c + 34}`} fill={second} opacity={0.88} />
      {/* scalloped body */}
      <Polygon points={scallopPoints(c, c, 40, 22, 2.6)} fill="url(#goldg)" />
      <Circle cx={c} cy={c} r={33} fill="none" stroke="#fbeab0" strokeWidth={1.4} />
      <Circle cx={c} cy={c} r={29.5} fill="url(#goldg2)" stroke={GOLD_DARK} strokeWidth={0.8} />
      <Circle cx={c} cy={c} r={25.5} fill="none" stroke="#fbeab0" strokeWidth={0.7} />
      {/* cross + tiny dots */}
      <Polygon points={crossPoints(c, c, 15)} fill={second} stroke="#fbeab0" strokeWidth={0.8} />
      <Circle cx={c} cy={c} r={2.2} fill="#fbeab0" />
    </Svg>
  );
}

/* ---------- text styles ---------- */

const st = StyleSheet.create({
  page: { width: W, height: H, backgroundColor: "#fbf5ea" },
  fill: { position: "absolute", left: 0, top: 0, width: W, height: H },
});

/* ---------- the certificate ---------- */

export function CertificatePage(p: CertificateProps) {
  const theme = THEMES[p.accent ?? "navy"];
  const { main, second } = theme;
  const nameLen = p.studentName.length;
  const nameSize = nameLen > 30 ? 30 : nameLen > 22 ? 38 : 46;

  const signBlock = (who: Signatory, role: string, sub: string) => (
    <View style={{ width: 210, alignItems: "center" }}>
      <View style={{ height: 42, justifyContent: "flex-end", alignItems: "center" }}>
        {who.signatureUrl ? (
          <Image src={who.signatureUrl} style={{ maxHeight: 40, maxWidth: 140, objectFit: "contain" }} />
        ) : null}
      </View>
      <Svg width={190} height={4}>
        <Defs>
          <LinearGradient id="sl" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={GOLD} stopOpacity={0.2} />
            <Stop offset="0.5" stopColor={GOLD_DARK} stopOpacity={1} />
            <Stop offset="1" stopColor={GOLD} stopOpacity={0.2} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={1} width={190} height={1.3} fill="url(#sl)" />
      </Svg>
      <Text style={{ fontFamily: "Cormorant", fontWeight: 600, fontSize: 12.5, color: INK, marginTop: 3 }}>
        {who.name}
      </Text>
      <Text style={{ fontFamily: "Cinzel", fontWeight: 700, fontSize: 9.5, letterSpacing: 2.2, color: second, marginTop: 2 }}>
        {role}
      </Text>
      <Text style={{ fontFamily: "Cormorant", fontWeight: 500, fontSize: 9.5, color: "#5b5b5b", marginTop: 1 }}>
        {sub}
      </Text>
    </View>
  );

  return (
      <Page size={[W, H]} style={st.page}>
        <Background main={main} second={second} />

        {/* ---------- header banner ---------- */}
        <View style={{ position: "absolute", top: 31, left: 0, width: W, alignItems: "center" }}>
          <Image src={p.headerImage} style={{ width: 480 }} />
        </View>

        {/* ---------- title block ---------- */}
        <View style={{ position: "absolute", top: 164, left: 0, width: W, alignItems: "center" }}>
          <Text style={{ fontFamily: "Cinzel", fontWeight: 700, fontSize: 31, letterSpacing: 8, color: main }}>
            {p.heading ?? "CERTIFICATE"}
          </Text>
          <Text style={{ fontFamily: "Cinzel", fontWeight: 600, fontSize: 14, letterSpacing: 5.5, color: second, marginTop: 2 }}>
            {p.subtitle}
          </Text>
          <View style={{ marginTop: 5 }}>
            <Divider color={GOLD} second={second} />
          </View>
          <Text style={{ fontFamily: "Cormorant", fontWeight: 500, fontStyle: "italic", fontSize: 14, color: "#4a4a4a", marginTop: 3 }}>
            This certificate is proudly presented to
          </Text>
        </View>

        {/* ---------- name ---------- */}
        <View style={{ position: "absolute", top: 270, left: 0, width: W, alignItems: "center" }}>
          <Text style={{ fontFamily: "NameScript", fontSize: nameSize, color: main, lineHeight: 1.25 }}>
            {p.studentName}
          </Text>
          <Svg width={380} height={4} style={{ marginTop: 0 }}>
            <Defs>
              <LinearGradient id="nl" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={GOLD} stopOpacity={0} />
                <Stop offset="0.5" stopColor={GOLD_DARK} stopOpacity={1} />
                <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={1} width={380} height={1.4} fill="url(#nl)" />
          </Svg>
          {p.studentNameMl ? (
            <Text style={{ fontFamily: "NotoSerifMalayalam", fontWeight: 600, fontSize: 14, color: second, marginTop: 4 }}>
              {p.studentNameMl}
            </Text>
          ) : null}
        </View>

        {/* ---------- body ---------- */}
        <View style={{ position: "absolute", top: p.studentNameMl ? 358 : 340, left: 0, width: W, alignItems: "center" }}>
          <Text
            style={{
              fontFamily: "Cormorant",
              fontWeight: 500,
              fontSize: 13.5,
              lineHeight: 1.45,
              color: INK,
              textAlign: "center",
              width: 560,
            }}
          >
            {p.body}
          </Text>
        </View>

        {/* ---------- detail chips ---------- */}
        {p.details && p.details.length > 0 ? (
          <View
            style={{
              position: "absolute",
              top: 405,
              left: 0,
              width: W,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {p.details.map((d, i) => (
              <View key={d.label} style={{ flexDirection: "row", alignItems: "center" }}>
                {i > 0 ? (
                  <Svg width={14} height={10} style={{ marginHorizontal: 10 }}>
                    <Polygon points="7,0 12,5 7,10 2,5" fill={GOLD} />
                  </Svg>
                ) : null}
                <Text style={{ fontFamily: "Cinzel", fontWeight: 600, fontSize: 8, letterSpacing: 1.6, color: "#6b6b6b" }}>
                  {d.label.toUpperCase()}{"  "}
                </Text>
                <Text style={{ fontFamily: "Cinzel", fontWeight: 700, fontSize: 10.5, letterSpacing: 0.8, color: main }}>{d.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ---------- signatures + seal ---------- */}
        <View
          style={{
            position: "absolute",
            top: 432,
            left: 90,
            width: W - 180,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          {signBlock(p.vicar, "VICAR", "Mar Gregorios Orthodox Syrian Church")}
          <View style={{ marginTop: 0 }}>
            <Seal second={second} />
          </View>
          {signBlock(p.headmaster, "HEADMASTER", "Sunday School")}
        </View>

        {/* ---------- footer: QR, number, date ---------- */}
        <View
          style={{
            position: "absolute",
            // app change: 7 pt higher than the template, for the bigger QR code (text stays centred where it was)
            top: 524,
            left: 100,
            width: W - 200,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", width: 230 }}>
            {/* app change: 42 pt (template had 32) so phones scan it easily; clears the gold frame */}
            {p.qrDataUrl ? <Image src={p.qrDataUrl} style={{ width: 42, height: 42 }} /> : null}
            <View style={{ marginLeft: 8 }}>
              <Text style={{ fontFamily: "Cinzel", fontWeight: 600, fontSize: 6.5, letterSpacing: 1.4, color: "#6b6b6b" }}>
                SCAN TO VERIFY
              </Text>
              <Text style={{ fontFamily: "Cormorant", fontWeight: 500, fontSize: 8.5, color: "#555" }}>{p.verifyUrl}</Text>
            </View>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontFamily: "Cinzel", fontWeight: 600, fontSize: 6.5, letterSpacing: 1.4, color: "#6b6b6b" }}>
              CERTIFICATE NO.
            </Text>
            <Text style={{ fontFamily: "Cinzel", fontWeight: 700, fontSize: 9.5, letterSpacing: 1.2, color: main }}>
              {p.certificateNo}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", width: 230 }}>
            <Text style={{ fontFamily: "Cinzel", fontWeight: 600, fontSize: 6.5, letterSpacing: 1.4, color: "#6b6b6b" }}>
              DATE OF ISSUE
            </Text>
            <Text style={{ fontFamily: "Cinzel", fontWeight: 700, fontSize: 9.5, letterSpacing: 1, color: main }}>{p.issueDate}</Text>
          </View>
        </View>

        {/* ---------- app addition: revoked stamp ---------- */}
        {p.revoked ? (
          <View style={{ position: "absolute", top: H / 2 - 60, left: 0, width: W, alignItems: "center", transform: "rotate(-18deg)" }}>
            <Text style={{ fontFamily: "Cinzel", fontWeight: 700, fontSize: 96, letterSpacing: 12, color: "#b91c1c", opacity: 0.22 }}>
              REVOKED
            </Text>
          </View>
        ) : null}
      </Page>
  );
}

/** One certificate as a PDF document */
export function CertificateDocument(p: CertificateProps) {
  return (
    <Document title={`${p.certificateNo} – ${p.studentName}`} author="MGOSC SS DB Hub">
      <CertificatePage {...p} />
    </Document>
  );
}

/** Many certificates (for example a whole class) in one PDF, one per page */
export function CertificateBundle({ items }: { items: CertificateProps[] }) {
  return (
    <Document title="Certificates" author="MGOSC SS DB Hub">
      {items.map((it) => (
        <CertificatePage key={it.certificateNo} {...it} />
      ))}
    </Document>
  );
}
