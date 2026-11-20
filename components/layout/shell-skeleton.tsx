import { Skeleton } from "@/components/ui/skeleton";

export function ShellSkeleton({ appName }: { appName: string }) {
  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="hidden w-64 shrink-0 flex-col gap-3 border-r bg-sidebar p-4 lg:flex">
        <p className="px-1 text-lg font-semibold text-primary">{appName}</p>
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
      </aside>
      <div className="flex-1">
        <div className="flex h-14 items-center border-b px-4 lg:hidden">
          <p className="font-semibold text-primary">{appName}</p>
        </div>
        <PageSkeleton />
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 lg:p-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
