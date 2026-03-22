"use client";

import { Suspense, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
  MapPin,
  Calendar,
  Clock,
  ArrowLeft,
  Bus,
  HeartPulse,
  Gem,
} from "lucide-react";

interface RequestDetails {
  id: string;
  service_type: string;
  pickup_fuzzy: string;
  dropoff_fuzzy: string;
  start_date: string;
  start_time?: string;
  end_date?: string;
  is_recurring: boolean;
  recurrence_pattern?: string;
  metadata_safe?: any;
  status: string;
  created_at: string;
}

function getServiceIcon(type: string) {
  switch (type) {
    case "school":
      return <Bus className="h-5 w-5 text-amber-600" />;
    case "medical":
      return <HeartPulse className="h-5 w-5 text-sky-600" />;
    case "wedding":
      return <Gem className="h-5 w-5 text-violet-600" />;
    default:
      return <Bus className="h-5 w-5 text-neutral-500" />;
  }
}

const SERVICE_COLORS: Record<string, string> = {
  school: "bg-amber-50 text-amber-700 border-amber-200",
  medical: "bg-sky-50 text-sky-700 border-sky-200",
  wedding: "bg-violet-50 text-violet-700 border-violet-200",
};

function QuoteSubmissionContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [request, setRequest] = useState<RequestDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [price, setPrice] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [estimatedArrival, setEstimatedArrival] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(`/login?redirect=/operator/requests/${id}/quote`);
      return;
    }
    if (user.role !== "operator" && user.role !== "admin" && user.role !== "manager") {
      setError("Only registered operators can submit quotes.");
      setLoading(false);
      return;
    }
    fetchRequest();
  }, [user, authLoading, id]);

  const fetchRequest = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/operator/pending-requests");
      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Failed to load requests");
        setLoading(false);
        return;
      }
      const data = await res.json();
      const found = (data.requests || []).find((r: any) => r.id === id);
      if (!found) {
        setError(
          "Request not found. It may have been fulfilled, expired, or you may have already quoted on it."
        );
        setLoading(false);
        return;
      }
      setRequest(found);
    } catch {
      setError("Failed to load request details.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!vehicleType.trim()) {
      setFormError("Vehicle type is required.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/operator/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: id,
          total_price: price ? parseFloat(price) : 0,
          vehicle_type: vehicleType.trim(),
          note: notes.trim() || undefined,
          estimated_arrival: estimatedArrival || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Failed to submit quote.");
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setFormError("Network error. Please try again.");
      setSubmitting(false);
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
            Cannot Submit Quote
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

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto max-w-xl px-4 pt-24 text-center">
          <div className="w-14 h-14 rounded-full bg-neutral-900 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-neutral-900 mb-2">
            Quote Submitted!
          </h2>
          <p className="text-sm text-neutral-500 mb-8">
            The customer has been notified and will review your quote. You will
            be contacted if they choose to proceed.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard/operator")}
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!request) return null;

  const formattedDate = new Date(request.start_date).toLocaleDateString(
    "en-US",
    { weekday: "short", month: "short", day: "numeric", year: "numeric" }
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-20 container mx-auto max-w-xl px-4">
        {/* Back button */}
        <button
          onClick={() => router.push("/dashboard/operator")}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        <h1 className="text-xl font-semibold text-neutral-900 mb-6">
          Submit a Quote
        </h1>

        {/* Request summary */}
        <Card className="mb-6 shadow-sm border-neutral-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-md bg-white border border-neutral-100 flex items-center justify-center">
                {getServiceIcon(request.service_type)}
              </div>
              <div>
                <h2 className="text-base font-semibold text-neutral-900 capitalize">
                  {request.service_type} Transportation
                </h2>
                <Badge
                  className={`${
                    SERVICE_COLORS[request.service_type] ||
                    "bg-neutral-50 text-neutral-600"
                  } shadow-none text-[10px] font-bold px-1.5 uppercase mt-0.5`}
                >
                  {request.service_type}
                </Badge>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <span className="text-neutral-500">Pickup:</span>{" "}
                  <span className="font-medium text-neutral-900">
                    {request.pickup_fuzzy}
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <span className="text-neutral-500">Dropoff:</span>{" "}
                  <span className="font-medium text-neutral-900">
                    {request.dropoff_fuzzy}
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Calendar className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <span className="text-neutral-500">Date:</span>{" "}
                  <span className="font-medium text-neutral-900">
                    {formattedDate}
                    {request.start_time && ` at ${request.start_time}`}
                  </span>
                </div>
              </div>
              {request.is_recurring && request.recurrence_pattern && (
                <div className="flex items-start gap-2.5">
                  <Clock className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <span className="text-neutral-500">Recurring:</span>{" "}
                    <span className="font-medium text-neutral-900 capitalize">
                      {request.recurrence_pattern}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Service-specific metadata */}
            {request.metadata_safe?.note && (
              <div className="mt-4 pt-4 border-t border-neutral-100">
                <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">
                  Note from customer
                </p>
                <p className="text-sm text-neutral-700 italic">
                  &ldquo;{request.metadata_safe.note}&rdquo;
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quote form */}
        <Card className="shadow-sm border-neutral-200">
          <CardContent className="p-6">
            <h3 className="text-base font-semibold text-neutral-900 mb-1">
              Your Quote
            </h3>
            <p className="text-xs text-neutral-400 mb-5">
              Leave price empty to express interest and request a discussion.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
                  Price (USD){" "}
                  <span className="text-neutral-400 normal-case font-normal">
                    (optional)
                  </span>
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={submitting}
                  className="text-base font-medium shadow-none focus-visible:ring-0 focus-visible:border-neutral-900 h-11"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
                  Estimated Arrival / ETA{" "}
                  <span className="text-neutral-400 normal-case font-normal">
                    (optional)
                  </span>
                </label>
                <Input
                  type="datetime-local"
                  value={estimatedArrival}
                  onChange={(e) => setEstimatedArrival(e.target.value)}
                  disabled={submitting}
                  className="shadow-none focus-visible:ring-0 focus-visible:border-neutral-900 h-11"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
                  Vehicle Type{" "}
                  <span className="text-neutral-900">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="e.g., 14-passenger minibus"
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  required
                  disabled={submitting}
                  className="shadow-none focus-visible:ring-0 focus-visible:border-neutral-900 h-11"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
                  Notes{" "}
                  <span className="text-neutral-400 normal-case font-normal">
                    (optional)
                  </span>
                </label>
                <textarea
                  placeholder="Availability, special features, route notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={submitting}
                  rows={3}
                  maxLength={1000}
                  className="w-full px-3 py-2.5 border border-neutral-200 rounded-md text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 resize-none transition-colors"
                />
                <p className="text-xs text-neutral-400 mt-1 text-right">
                  {notes.length}/1000
                </p>
              </div>

              {formError && (
                <div className="border border-red-200 bg-red-50 rounded-md px-4 py-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{formError}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-neutral-900 hover:bg-neutral-700 text-white font-semibold h-12 text-sm rounded-md shadow-none"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Submitting...
                  </>
                ) : (
                  "Submit Quote"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function OperatorQuotePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <QuoteSubmissionContent />
    </Suspense>
  );
}
