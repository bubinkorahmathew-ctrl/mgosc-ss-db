import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 py-6">
      <Skeleton className="aspect-[38/10] w-full rounded-xl" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-11 w-full" />
    </main>
  );
}
