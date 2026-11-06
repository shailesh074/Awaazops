import { Skeleton } from "@/components/ui/skeleton";

/** Route-level loading state for data pages (used by loading.tsx files). */
export function PageSkeleton({ variant = "table" }: { variant?: "table" | "dashboard" | "list" }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-10 w-full" />
      {variant === "dashboard" ? (
        <>
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="grid gap-6 xl:grid-cols-3">
            <Skeleton className="h-80 rounded-xl xl:col-span-2" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </>
      ) : variant === "list" ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <Skeleton className="h-96 w-full rounded-xl" />
      )}
    </div>
  );
}
