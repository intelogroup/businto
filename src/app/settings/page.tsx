"use client";

import { useState, useEffect } from "react";
import { Navbar } from "@/components/navbar";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const { user, isLoading, updateUserPassword, logout } = useAuth();
  const router = useRouter();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    if (newPassword.length < 8) {
      setPwError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match.");
      return;
    }
    setPwSaving(true);
    try {
      await updateUserPassword(newPassword);
      setPwSaved(true);
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPwSaving(false);
    }
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
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950 mb-1">Settings</h1>
          <p className="text-sm text-neutral-500">Manage your account security</p>
        </div>

        {/* Change password */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 mb-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-1">Change password</h2>
          <p className="text-xs text-neutral-400 mb-5">Choose a strong password of at least 8 characters.</p>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-sm font-medium text-neutral-700">
                New password
              </Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="max-w-sm"
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-sm font-medium text-neutral-700">
                Confirm new password
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="max-w-sm"
                autoComplete="new-password"
              />
            </div>

            {pwError && <p className="text-sm text-red-500">{pwError}</p>}

            <div className="flex items-center gap-3 pt-1">
              <Button
                type="submit"
                disabled={pwSaving || !newPassword || !confirmPassword}
                className="bg-neutral-950 text-white hover:bg-black"
              >
                {pwSaving ? "Updating…" : "Update password"}
              </Button>
              {pwSaved && <span className="text-sm text-green-600 font-medium">Password updated!</span>}
            </div>
          </form>
        </div>

        {/* Sign out */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <h2 className="text-sm font-semibold text-neutral-900 mb-1">Sign out</h2>
          <p className="text-xs text-neutral-400 mb-4">Sign out from all devices.</p>
          <Button
            variant="outline"
            className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
            onClick={async () => {
              await logout();
              window.location.href = "/";
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
