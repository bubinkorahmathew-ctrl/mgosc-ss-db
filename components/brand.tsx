import Image from "next/image";
import { cn } from "@/lib/utils";
import banner from "@/public/brand/banner.jpg";
import loginArt from "@/public/brand/login.jpg";
import logo from "@/public/brand/logo.png";

const ALT = "Mar Gregorios Orthodox Syrian Church, OSSAE (Thrissur Diocese) Sunday School - Student Management System";

/** OSSAE crest. */
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return <Image src={logo} alt="" width={size} height={size} className={cn("shrink-0", className)} priority />;
}

/** Wide web-app banner (home, registration, verification, phone sign-in). */
export function Banner({ className }: { className?: string }) {
  return (
    <Image src={banner} priority placeholder="blur" sizes="(max-width: 1024px) 100vw, 1024px" alt={ALT}
      className={cn("h-auto w-full rounded-xl shadow-sm", className)} />
  );
}

/** Tall artwork beside the sign-in form on larger screens. */
export function LoginArt({ className }: { className?: string }) {
  return (
    <Image src={loginArt} priority placeholder="blur" sizes="(max-width: 1024px) 50vw, 600px" alt={ALT}
      className={cn("h-full w-full object-cover object-top", className)} />
  );
}
