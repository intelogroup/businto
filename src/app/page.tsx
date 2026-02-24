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
    const next = params.next ?? "/login/reset-password";
    redirect(`/api/auth/callback?code=${params.code}&next=${next}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <HowItWorks />
    </div>
  );
}
