import { Navbar } from "@/components/navbar";

function CardSkeleton() {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-neutral-200" />
          <div className="h-3 w-16 bg-neutral-200 rounded" />
        </div>
        <div className="h-5 w-14 bg-neutral-200 rounded-full" />
      </div>
      <div className="space-y-1.5 mb-3">
        <div className="h-4 w-3/4 bg-neutral-200 rounded" />
        <div className="h-4 w-1/2 bg-neutral-100 rounded" />
      </div>
      <div className="pt-3 border-t border-neutral-100">
        <div className="h-3 w-24 bg-neutral-100 rounded" />
      </div>
    </div>
  );
}

export default function TripsLoading() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto max-w-7xl px-6 py-8 pt-32 pb-24">
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="h-7 w-32 bg-neutral-200 rounded animate-pulse mb-2" />
            <div className="h-4 w-64 bg-neutral-100 rounded animate-pulse" />
          </div>
          <div className="h-10 w-64 bg-neutral-100 rounded-lg animate-pulse" />
        </div>
        <div className="space-y-4">
          <div className="h-4 w-16 bg-neutral-200 rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
