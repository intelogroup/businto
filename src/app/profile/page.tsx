"use client";

import { useState, useEffect } from "react";
import { Navbar } from "@/components/navbar";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { Loader2, Save, CheckCircle } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  operator: "Operator",
  user: "Traveler",
};

const MOBILITY_OPTIONS = [
  { value: "ambulatory", label: "Ambulatory (can walk)" },
  { value: "wheelchair", label: "Wheelchair" },
  { value: "manual-wheelchair", label: "Manual Wheelchair" },
  { value: "electric-wheelchair", label: "Electric Wheelchair" },
  { value: "stretcher", label: "Stretcher" },
];

const SERVICE_LEVEL_OPTIONS = [
  { value: "curb-to-curb", label: "Curb to Curb" },
  { value: "door-to-door", label: "Door to Door" },
  { value: "door-through-door", label: "Door Through Door" },
  { value: "hand-to-hand", label: "Hand to Hand" },
];

interface TransportPreferences {
  default_mobility?: string;
  default_service_level?: string;
  oxygen_required?: boolean;
  service_animal?: boolean;
  attendant_needed?: boolean;
  special_requirements?: string;
}

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [preferences, setPreferences] = useState<TransportPreferences>({});

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (user) fetchProfile();
  }, [user]);

  async function fetchProfile() {
    try {
      const res = await fetch("/api/customer/profile");
      if (res.ok) {
        const data = await res.json();
        setName(data.profile.fullName || user?.name || "");
        setPhone(data.profile.phone || "");
        setSmsOptIn(data.profile.smsOptIn ?? false);
        setPreferences(data.profile.transportPreferences || {});
      } else {
        // Fallback to auth user data
        setName(user?.name || "");
      }
    } catch {
      setName(user?.name || "");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/customer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: name.trim(),
          phone: phone.trim(),
          sms_opt_in: smsOptIn,
          transport_preferences: Object.keys(preferences).length > 0 ? preferences : null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Failed to save profile");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function updatePreference(key: keyof TransportPreferences, value: any) {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  }

  if (isLoading || !user || loading) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <Navbar />
        <div className="flex items-center justify-center pt-32">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <Navbar />
      <div className="container mx-auto max-w-2xl px-6 pt-32 pb-24">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950 mb-1">Profile</h1>
          <p className="text-sm text-neutral-500">
            Manage your personal information and transport preferences
          </p>
        </div>

        <form onSubmit={handleSave}>
          {/* Identity Card */}
          <div className="bg-white rounded-lg border border-neutral-200 p-6 mb-4">
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

            <div className="space-y-4">
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
                <Input
                  value={user.email}
                  disabled
                  className="max-w-sm bg-neutral-50 text-neutral-400"
                />
                <p className="text-xs text-neutral-400">Email cannot be changed here.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-sm font-medium text-neutral-700">
                  Phone number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="max-w-sm"
                />
                <p className="text-xs text-neutral-400">
                  Used for trip coordination with your operator.
                </p>
              </div>
            </div>
          </div>

          {/* SMS Notifications */}
          <div className="bg-white rounded-lg border border-neutral-200 p-6 mb-4">
            <h2 className="text-base font-semibold text-neutral-900 mb-1">
              SMS Notifications
            </h2>
            <p className="text-xs text-neutral-500 mb-5">
              Receive text messages for critical trip events: quote received, trip accepted, and 30-minute ETA alerts.
            </p>
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="relative mt-0.5">
                <input
                  type="checkbox"
                  id="sms-opt-in"
                  checked={smsOptIn}
                  onChange={(e) => setSmsOptIn(e.target.checked)}
                  disabled={!phone.trim()}
                  className="sr-only peer"
                />
                <div className={`w-10 h-6 rounded-full transition-colors duration-200 ${smsOptIn && phone.trim() ? 'bg-neutral-950' : 'bg-neutral-200'} peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-950 peer-focus-visible:ring-offset-2`} />
                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${smsOptIn && phone.trim() ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-800">
                  Opt in to SMS alerts
                </p>
                {!phone.trim() ? (
                  <p className="text-xs text-amber-600 mt-0.5">
                    Add a phone number above to enable SMS notifications.
                  </p>
                ) : (
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Messages sent via Brevo to {phone}. Standard carrier rates may apply.
                  </p>
                )}
              </div>
            </label>
          </div>

          {/* Medical Transport Preferences */}
          <div className="bg-white rounded-lg border border-neutral-200 p-6 mb-4">
            <h2 className="text-base font-semibold text-neutral-900 mb-1">
              Medical Transport Preferences
            </h2>
            <p className="text-xs text-neutral-500 mb-5">
              Save your default preferences to pre-fill future medical transport requests.
            </p>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-neutral-700">
                  Default mobility level
                </Label>
                <Select
                  value={preferences.default_mobility || ""}
                  onValueChange={(v) => updatePreference("default_mobility", v)}
                >
                  <SelectTrigger className="max-w-sm">
                    <SelectValue placeholder="Select mobility level" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOBILITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-neutral-700">
                  Default service level
                </Label>
                <Select
                  value={preferences.default_service_level || ""}
                  onValueChange={(v) => updatePreference("default_service_level", v)}
                >
                  <SelectTrigger className="max-w-sm">
                    <SelectValue placeholder="Select service level" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_LEVEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium text-neutral-700">
                  Additional needs
                </Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.oxygen_required || false}
                      onChange={(e) => updatePreference("oxygen_required", e.target.checked)}
                      className="rounded border-neutral-300"
                    />
                    Oxygen required
                  </label>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.service_animal || false}
                      onChange={(e) => updatePreference("service_animal", e.target.checked)}
                      className="rounded border-neutral-300"
                    />
                    Service animal
                  </label>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.attendant_needed || false}
                      onChange={(e) => updatePreference("attendant_needed", e.target.checked)}
                      className="rounded border-neutral-300"
                    />
                    Attendant / companion needed
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="special-req" className="text-sm font-medium text-neutral-700">
                  Special requirements
                </Label>
                <textarea
                  id="special-req"
                  value={preferences.special_requirements || ""}
                  onChange={(e) => updatePreference("special_requirements", e.target.value)}
                  placeholder="Any additional notes for your medical transport needs..."
                  rows={3}
                  className="w-full max-w-sm rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-1"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={saving || !name.trim()}
              className="bg-neutral-950 text-white hover:bg-black"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1.5" />
                  Save changes
                </>
              )}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
                <CheckCircle className="h-4 w-4" />
                Saved!
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
