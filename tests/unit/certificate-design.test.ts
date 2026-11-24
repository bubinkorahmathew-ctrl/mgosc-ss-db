import { describe, expect, it } from "vitest";
import { certificateAccent, certificateSubtitle, issueDateText } from "@/lib/certificate-design";

describe("certificate design per type", () => {
  it.each([
    ["merit", "navy", "OF MERIT"],
    ["completion", "navy", "OF COMPLETION"],
    ["participation", "navy", "OF PARTICIPATION"],
    ["memory_verse", "navy", "OF ACHIEVEMENT"],
    ["class_topper", "burgundy", "OF EXCELLENCE - CLASS TOPPER"],
    ["attendance", "teal", "OF ATTENDANCE"],
    ["attendance_topper", "teal", "OF ATTENDANCE"],
  ] as const)("%s: %s, %s", (type, accent, subtitle) => {
    expect(certificateAccent(type)).toBe(accent);
    expect(certificateSubtitle(type, "ignored for this type")).toBe(subtitle);
  });

  it("a custom certificate is navy and takes its subtitle from the title", () => {
    expect(certificateAccent("custom")).toBe("navy");
    expect(certificateSubtitle("custom", "Certificate of  Appreciation")).toBe("OF APPRECIATION");
    expect(certificateSubtitle("custom", "certificate for Best Singer")).toBe("FOR BEST SINGER");
    expect(certificateSubtitle("custom", "Best Singer")).toBe("BEST SINGER");
    expect(certificateSubtitle("custom", "Certificate")).toBe("OF ACHIEVEMENT");
  });

  it("writes the issue date in words", () => {
    expect(issueDateText("2026-11-24")).toBe("24 November 2026");
    expect(issueDateText("2027-01-05")).toBe("5 January 2027");
  });
});
