import Link from "next/link";
import { Navbar } from "@/components/navbar";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="flex flex-col items-center justify-center px-6 pt-32 pb-24 text-center">
        <p className="text-6xl font-bold text-neutral-200 mb-4">404</p>
        <h1 className="text-xl font-semibold text-neutral-900 mb-2">Page not found</h1>
        <p className="text-sm text-neutral-500 mb-8 max-w-md">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-neutral-950 text-white text-sm font-medium px-5 h-10 hover:bg-neutral-800 transition-colors"
          >
            Go Home
          </Link>
          <Link
            href="/trips"
            className="inline-flex items-center justify-center rounded-lg border border-neutral-200 text-neutral-700 text-sm font-medium px-5 h-10 hover:bg-neutral-50 transition-colors"
          >
            My Trips
          </Link>
        </div>
      </div>
    </div>
  );
}
