"use client";

import { useState, useEffect } from "react";
import { Navbar } from "@/components/navbar";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  operator: "Operator",
  user: "Traveler",
};

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    setSaved(false);

    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({
      data: { full_name: name.trim() },
    });

    if (err) {
      setError(err.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <Navbar />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <Navbar />
      <div className="container mx-auto max-w-2xl px-6 pt-32 pb-24">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950 mb-1">Profile</h1>
          <p className="text-sm text-neutral-500">Manage your personal information</p>
        </div>

        {/* Avatar + identity card */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 mb-4">
          <div className="flex items-center gap-4 mb-6">
            <img
              src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`}
              alt={user.name}
              className="w-16 h-16 rounded-full border border-neutral-200 object-cover"
            />
            <div>
              <p className="text-base font-semibold text-neutral-900">{user.name}</p>
              <p className="text-sm text-neutral-500">{user.email}</p>
              <span className="inline-block mt-1 text-xs font-medium bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full">
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm font-medium text-neutral-700">
                Display name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="max-w-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-neutral-700">Email</Label>
              <Input value={user.email} disabled className="max-w-sm bg-neutral-50 text-neutral-400" />
              <p className="text-xs text-neutral-400">Email cannot be changed here.</p>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" disabled={saving || name.trim() === user.name} className="bg-neutral-950 text-white hover:bg-black">
                {saving ? "Saving…" : "Save changes"}
              </Button>
              {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
