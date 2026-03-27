import { Navbar } from "@/components/navbar";

export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto max-w-2xl px-6 pt-32 pb-24">
        <div className="h-7 w-28 bg-neutral-200 rounded animate-pulse mb-8" />
        <div className="space-y-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-4 w-20 bg-neutral-200 rounded mb-2" />
              <div className="h-10 w-full bg-neutral-100 rounded-lg" />
            </div>
          ))}
          <div className="h-10 w-32 bg-neutral-200 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}
