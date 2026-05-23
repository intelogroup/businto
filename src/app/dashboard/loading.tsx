import { Navbar } from "@/components/navbar";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto max-w-5xl px-6 pt-32 pb-24">
        <div className="h-8 w-40 bg-neutral-200 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-lg border border-neutral-200 p-5 animate-pulse">
              <div className="h-4 w-24 bg-neutral-200 rounded mb-3" />
              <div className="h-8 w-12 bg-neutral-100 rounded" />
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-neutral-200 p-5 animate-pulse">
          <div className="h-5 w-32 bg-neutral-200 rounded mb-4" />
          <div className="space-y-3">
            <div className="h-12 bg-neutral-100 rounded" />
            <div className="h-12 bg-neutral-100 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
