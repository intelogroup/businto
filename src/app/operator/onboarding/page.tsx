"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Circle,
  Building2,
  Phone,
  MapPin,
  Briefcase,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

interface OperatorData {
  id: string;
  company_name: string;
  company_email: string;
  company_phone: string | null;
  specialties: string[] | null;
  service_radius_miles: number | null;
  service_areas: string[] | null;
  is_active: boolean;
}

interface CompletionStatus {
  hasCompanyInfo: boolean;
  hasSpecialties: boolean;
  hasServiceRadius: boolean;
  hasServiceAreas: boolean;
  hasPhone: boolean;
  isActive: boolean;
}

const SPECIALTY_OPTIONS = [
  { value: "school", label: "School Transport", icon: "🚌" },
  { value: "medical", label: "Medical Transport", icon: "🏥" },
  { value: "wedding", label: "Wedding & Events", icon: "💐" },
  { value: "corporate", label: "Corporate Shuttle", icon: "🏢" },
];

const STEPS = [
  { key: "company", title: "Company Info", icon: Building2, statusKey: "hasCompanyInfo" },
  { key: "specialties", title: "Specialties", icon: Briefcase, statusKey: "hasSpecialties" },
  { key: "service-area", title: "Service Area", icon: MapPin, statusKey: "hasServiceRadius" },
  { key: "contact", title: "Contact Info", icon: Phone, statusKey: "hasPhone" },
] as const;

function OnboardingContent() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [operator, setOperator] = useState<OperatorData | null>(null);
  const [completion, setCompletion] = useState<CompletionStatus | null>(null);
  const [completedSteps, setCompletedSteps] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [serviceRadius, setServiceRadius] = useState("");
  const [serviceAreas, setServiceAreas] = useState("");

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/operator/profile");
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to load profile");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setOperator(data.operator);
      setCompletion(data.completionStatus);
      setCompletedSteps(data.completedSteps);
      setTotalSteps(data.totalSteps);
      setIsComplete(data.isProfileComplete);

      // Pre-fill form
      const op = data.operator;
      setCompanyName(op.company_name || "");
      setCompanyEmail(op.company_email || "");
      setCompanyPhone(op.company_phone || "");
      setSpecialties(op.specialties || []);
      setServiceRadius(op.service_radius_miles?.toString() || "");
      setServiceAreas(
        Array.isArray(op.service_areas) ? op.service_areas.join(", ") : ""
      );

      // Auto-advance to first incomplete step
      if (data.completionStatus) {
        const firstIncomplete = STEPS.findIndex(
          (s) => !data.completionStatus[s.statusKey]
        );
        if (firstIncomplete >= 0) {
          setCurrentStep(firstIncomplete);
        }
      }
    } catch {
      setError("Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login?redirect=/operator/onboarding");
      return;
    }
    if (
      user.role !== "operator" &&
      user.role !== "admin" &&
      user.role !== "manager"
    ) {
      setError("This page is for registered operators only.");
      setLoading(false);
      return;
    }
    fetchProfile();
  }, [user, authLoading, fetchProfile]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    const payload: Record<string, any> = {};

    // Collect data from current step
    switch (STEPS[currentStep].key) {
      case "company":
        if (!companyName.trim()) {
          setSaveError("Company name is required.");
          setSaving(false);
          return;
        }
        if (!companyEmail.trim()) {
          setSaveError("Company email is required.");
          setSaving(false);
          return;
        }
        payload.company_name = companyName.trim();
        payload.company_email = companyEmail.trim();
        break;

      case "specialties":
        if (specialties.length === 0) {
          setSaveError("Select at least one specialty.");
          setSaving(false);
          return;
        }
        payload.specialties = specialties;
        break;

      case "service-area":
        if (!serviceRadius || Number(serviceRadius) < 1) {
          setSaveError("Service radius must be at least 1 mile.");
          setSaving(false);
          return;
        }
        payload.service_radius_miles = Number(serviceRadius);
        if (serviceAreas.trim()) {
          payload.service_areas = serviceAreas
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean);
        }
        break;

      case "contact":
        if (!companyPhone.trim()) {
          setSaveError("Phone number is required.");
          setSaving(false);
          return;
        }
        payload.company_phone = companyPhone.trim();
        break;
    }

    try {
      const res = await fetch("/api/operator/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "Failed to save.");
        setSaving(false);
        return;
      }

      // Refresh profile data
      await fetchProfile();

      // Auto-advance to next step
      if (currentStep < STEPS.length - 1) {
        setCurrentStep(currentStep + 1);
      }
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto max-w-xl px-4 pt-24 text-center">
          <AlertCircle className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">
            Unable to Load
          </h2>
          <p className="text-neutral-500 text-sm mb-6">{error}</p>
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/operator")}
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto max-w-xl px-4 pt-24 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
            <Sparkles className="w-7 h-7 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-neutral-900 mb-2">
            Profile Complete!
          </h2>
          <p className="text-sm text-neutral-500 mb-8">
            Your operator profile is fully set up. You are ready to receive and
            quote on transport requests.
          </p>
          <Button onClick={() => router.push("/dashboard/operator")}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const step = STEPS[currentStep];
  const StepIcon = step.icon;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-20 container mx-auto max-w-xl px-4">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-semibold text-neutral-900">
              Complete Your Profile
            </h1>
            <span className="text-sm text-neutral-400">
              {completedSteps}/{totalSteps} done
            </span>
          </div>
          <div className="w-full bg-neutral-100 rounded-full h-1.5">
            <div
              className="bg-neutral-900 h-1.5 rounded-full transition-all duration-500"
              style={{
                width: `${totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex gap-2 mb-6">
          {STEPS.map((s, i) => {
            const done = completion?.[s.statusKey] ?? false;
            const active = i === currentStep;
            return (
              <button
                key={s.key}
                onClick={() => setCurrentStep(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  active
                    ? "bg-neutral-900 text-white"
                    : done
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-neutral-50 text-neutral-500 border border-neutral-200"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
                {s.title}
              </button>
            );
          })}
        </div>

        {/* Step content */}
        <Card className="shadow-sm border-neutral-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-md bg-neutral-50 border border-neutral-100 flex items-center justify-center">
                <StepIcon className="h-5 w-5 text-neutral-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-neutral-900">
                  {step.title}
                </h2>
                <p className="text-xs text-neutral-400">
                  Step {currentStep + 1} of {STEPS.length}
                </p>
              </div>
            </div>

            {/* Company Info Step */}
            {step.key === "company" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
                    Company Name <span className="text-neutral-900">*</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="Your company name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={saving}
                    className="shadow-none focus-visible:ring-0 focus-visible:border-neutral-900 h-11"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
                    Company Email <span className="text-neutral-900">*</span>
                  </label>
                  <Input
                    type="email"
                    placeholder="contact@yourcompany.com"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    disabled={saving}
                    className="shadow-none focus-visible:ring-0 focus-visible:border-neutral-900 h-11"
                  />
                </div>
              </div>
            )}

            {/* Specialties Step */}
            {step.key === "specialties" && (
              <div className="space-y-3">
                <p className="text-sm text-neutral-500 mb-4">
                  Select the types of transport you offer. This helps us match
                  you with relevant requests.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {SPECIALTY_OPTIONS.map((opt) => {
                    const selected = specialties.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSpecialties((prev) =>
                            selected
                              ? prev.filter((s) => s !== opt.value)
                              : [...prev, opt.value]
                          );
                        }}
                        disabled={saving}
                        className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                          selected
                            ? "border-neutral-900 bg-neutral-50"
                            : "border-neutral-200 hover:border-neutral-300 bg-white"
                        }`}
                      >
                        <span className="text-xl">{opt.icon}</span>
                        <div>
                          <p className="text-sm font-medium text-neutral-900">
                            {opt.label}
                          </p>
                          {selected && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-neutral-900 mt-0.5" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Service Area Step */}
            {step.key === "service-area" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
                    Service Radius (miles){" "}
                    <span className="text-neutral-900">*</span>
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="500"
                    placeholder="e.g., 50"
                    value={serviceRadius}
                    onChange={(e) => setServiceRadius(e.target.value)}
                    disabled={saving}
                    className="shadow-none focus-visible:ring-0 focus-visible:border-neutral-900 h-11"
                  />
                  <p className="text-xs text-neutral-400 mt-1">
                    How far you are willing to travel for a job (1-500 miles).
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
                    Service Areas{" "}
                    <span className="text-neutral-400 normal-case font-normal">
                      (optional, comma-separated)
                    </span>
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g., Boston, Cambridge, Somerville"
                    value={serviceAreas}
                    onChange={(e) => setServiceAreas(e.target.value)}
                    disabled={saving}
                    className="shadow-none focus-visible:ring-0 focus-visible:border-neutral-900 h-11"
                  />
                  <p className="text-xs text-neutral-400 mt-1">
                    Cities or regions you commonly serve.
                  </p>
                </div>
              </div>
            )}

            {/* Contact Step */}
            {step.key === "contact" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
                    Phone Number <span className="text-neutral-900">*</span>
                  </label>
                  <Input
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    disabled={saving}
                    className="shadow-none focus-visible:ring-0 focus-visible:border-neutral-900 h-11"
                  />
                  <p className="text-xs text-neutral-400 mt-1">
                    This will be shared with customers after they accept your
                    quote.
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {saveError && (
              <div className="mt-4 border border-red-200 bg-red-50 rounded-md px-4 py-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{saveError}</p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-100">
              <Button
                variant="ghost"
                size="sm"
                disabled={currentStep === 0 || saving}
                onClick={() => {
                  setSaveError(null);
                  setCurrentStep(currentStep - 1);
                }}
                className="text-neutral-500"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-neutral-900 hover:bg-neutral-700 text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : currentStep === STEPS.length - 1 ? (
                  "Complete Setup"
                ) : (
                  <>
                    Save & Continue
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Skip link */}
        <div className="text-center mt-4">
          <button
            onClick={() => router.push("/dashboard/operator")}
            className="text-xs text-neutral-400 hover:text-neutral-600 underline underline-offset-4"
          >
            Skip for now
          </button>
        </div>
      </main>
    </div>
  );
}

export default function OperatorOnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <OnboardingContent />
    </Suspense>
  );
}
