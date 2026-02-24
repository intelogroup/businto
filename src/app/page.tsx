import { redirect } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";

interface Props {
  searchParams: Promise<Record<string, string>>;
}

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;

  // Supabase sometimes delivers the PKCE ?code= to the site root when the
  // redirectTo URL isn't whitelisted. Forward it to the auth callback so the
  // reset-password flow still works.
  if (params.code) {
    // Supabase password reset emails deliver ?code= to the site root because
    // the redirectTo URL isn't whitelisted yet. The `next` param will not be
    // present in the original Supabase email URL, so always default to the
    // reset-password page (magic-link emails don't hit this path).
    const next = params.next ?? "/login/reset-password";
    redirect(`/api/auth/callback?code=${encodeURIComponent(params.code)}&next=${next}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <HowItWorks />
    </div>
  );
}
