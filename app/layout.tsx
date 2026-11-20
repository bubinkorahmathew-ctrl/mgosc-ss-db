import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Sans_Malayalam } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/config";
import "./globals.css";

const notoSans = Noto_Sans({ variable: "--font-noto", subsets: ["latin"], display: "swap" });
// Fallback for Malayalam text everywhere (inputs, tables, names)
const notoMl = Noto_Sans_Malayalam({ variable: "--font-noto-ml", subsets: ["malayalam"], display: "swap" });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: `${APP_NAME} - Sunday School management`,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${notoSans.variable} ${notoMl.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
