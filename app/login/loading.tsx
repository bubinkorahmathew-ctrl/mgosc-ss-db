import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="flex flex-1 bg-muted/40">
      <Skeleton className="hidden w-[45%] max-w-2xl rounded-none md:block" />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <Skeleton className="h-72 w-full max-w-sm" />
      </div>
    </main>
  );
}
