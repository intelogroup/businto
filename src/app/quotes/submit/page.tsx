"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface TransportRequest {
  id: string;
  service_type: string;
  pickup_fuzzy: string;
  dropoff_fuzzy: string;
  start_date: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  is_recurring?: boolean;
  recurrence_pattern?: string;
  metadata_safe?: any;
  status?: string;
  created_at?: string;
}

const SERVICE_ICONS = {
  school: "🚌",
  medical: "🏥",
  wedding: "💐",
};

const SERVICE_COLORS = {
  school: "bg-orange-50 text-orange-600 border-orange-200",
  medical: "bg-sky-50 text-sky-600 border-sky-200",
  wedding: "bg-violet-50 text-violet-600 border-violet-200",
};

function SubmitQuoteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestId = searchParams.get("request_id");
  const accessToken = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<TransportRequest | null>(null);
  const [operatorId, setOperatorId] = useState<string | null>(null);

  // Form state
  const [price, setPrice] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function init() {
      console.log('🔍 Quote Submit Page - Initializing...');
      console.log('📋 Request ID:', requestId);
      console.log('🔑 Access Token:', accessToken ? `${accessToken.substring(0, 20)}...` : 'MISSING');
      
      if (!requestId) {
        console.error('❌ No request ID provided');
        setError("No request ID provided");
        setLoading(false);
        return;
      }

      if (!accessToken) {
        console.error('❌ No access token provided');
        setError("Access token required. Please use the link from your email.");
        setLoading(false);
        return;
      }
      
      console.log('✅ Both requestId and accessToken present');

      // Fetch sanitized request details via operator view API with token
      // This endpoint only returns safe fields, no PII
      try {
        const apiUrl = `/api/requests/${requestId}/operator-view?token=${accessToken}`;
        console.log('🌐 Fetching from:', apiUrl.replace(accessToken, accessToken.substring(0, 20) + '...'));
        
        const response = await fetch(apiUrl);
        console.log('📡 Response status:', response.status, response.statusText);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ API Error Response:', errorText);
          
          if (response.status === 401) {
            console.error('🔒 Authentication failed - invalid or expired token');
            setError("Invalid or expired access token. Please use the link from your email.");
          } else if (response.status === 429) {
            console.error('⏱️ Rate limit exceeded');
            setError("Rate limit exceeded. Please try again later.");
          } else {
            console.error(`🚫 Request failed with status ${response.status}`);
            setError(`Request not found (${response.status})`);
          }
          setLoading(false);
          return;
        }

        const requestData = await response.json();
        console.log('✅ Request data loaded:', {
          id: requestData.id,
          service_type: requestData.service_type,
          pickup: requestData.pickup_fuzzy,
          dropoff: requestData.dropoff_fuzzy
        });
        setRequest(requestData);
        setLoading(false);
      } catch (err) {
        console.error('💥 Fatal error fetching request:', err);
        console.error('Error details:', {
          name: err instanceof Error ? err.name : 'Unknown',
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        });
        setError(`Failed to load request details: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setLoading(false);
      }
    }

    init();
  }, [requestId, accessToken, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('📤 Quote submission initiated');
    
    if (!request) {
      console.error('❌ No request data available');
      return;
    }

    setSubmitting(true);
    setError(null);

    const priceNum = parseFloat(price);
    console.log('💰 Price validation:', { price, priceNum, valid: !isNaN(priceNum) && priceNum > 0 });
    
    if (isNaN(priceNum) || priceNum <= 0) {
      console.error('❌ Invalid price');
      setError("Please enter a valid price");
      setSubmitting(false);
      return;
    }

    if (!vehicleType.trim()) {
      console.error('❌ Missing vehicle type');
      setError("Please enter a vehicle type");
      setSubmitting(false);
      return;
    }

    try {
      const quotePayload = {
        request_id: request.id,
        operator_id: null, // Anonymous quote for MVP
        total_price: priceNum,
        vehicle_type: vehicleType.trim(),
        note: message.trim() || undefined,
      };
      
      console.log('📋 Quote payload:', quotePayload);
      
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quotePayload),
      });

      console.log('📡 Quote submission response:', response.status, response.statusText);
      
      const data = await response.json();
      console.log('📄 Response data:', data);

      if (!response.ok) {
        console.error('❌ Quote submission failed:', data.error);
        throw new Error(data.error || "Failed to submit quote");
      }

      console.log('✅ Quote submitted successfully!');
      setSubmitted(true);
    } catch (err: any) {
      console.error('💥 Quote submission error:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      });
      setError(err.message || "Failed to submit quote");
      setSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    if (!request) return;

    try {
      // For MVP without auth, we can't reliably identify which quote to withdraw
      // This feature would require auth or a unique withdrawal token
      console.log("Withdraw feature requires authentication");
      setSubmitted(false);
      setPrice("");
      setVehicleType("");
      setMessage("");
    } catch (err) {
      console.error("Failed to withdraw quote:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (error && !request) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <Card className="max-w-md w-full p-8 text-center shadow-none border border-neutral-200">
          <AlertCircle className="w-10 h-10 text-neutral-400 mx-auto mb-4" />
          <h1 className="text-base font-semibold text-neutral-900 mb-1">Unable to load request</h1>
          <p className="text-sm text-neutral-500">{error}</p>
        </Card>
      </div>
    );
  }

  if (!request) return null;

  // Format date
  const date = new Date(request.start_date);
  const formattedDate = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const serviceIcon =
    SERVICE_ICONS[request.service_type as keyof typeof SERVICE_ICONS] || "🚐";
  const serviceColor =
    SERVICE_COLORS[request.service_type as keyof typeof SERVICE_COLORS] ||
    "bg-neutral-100 text-neutral-800";

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <Card className="max-w-md w-full p-10 text-center shadow-none border border-neutral-200">
          <div className="w-12 h-12 rounded-full bg-neutral-900 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mb-2">
            Quote submitted
          </h1>
          <p className="text-sm text-neutral-500 mb-8">
            Your quote has been sent to the customer. They will be in touch if interested.
          </p>
          <button
            onClick={handleWithdraw}
            className="text-xs text-neutral-400 hover:text-neutral-600 underline underline-offset-4"
          >
            Withdraw quote
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <div className="border-b border-neutral-100 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <span className="font-semibold text-neutral-900 text-sm tracking-tight">Businto</span>
          <span className="text-xs text-neutral-400 uppercase tracking-widest">Operator Portal</span>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-8">
        {/* Non-binding banner */}
        <div className="border border-neutral-200 rounded-md px-4 py-3 mb-6 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-neutral-400 mt-0.5 shrink-0" />
          <p className="text-xs text-neutral-500 leading-relaxed">
            Non-binding inquiry — no commitment required. The parent may contact multiple operators.
          </p>
        </div>

        {/* Request details */}
        <Card className="p-6 mb-5 shadow-none border border-neutral-200">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-md bg-neutral-100 flex items-center justify-center text-lg shrink-0">
              {serviceIcon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-neutral-900 truncate">
                  {request.service_type.charAt(0).toUpperCase() +
                    request.service_type.slice(1)}{" "}
                  Transportation
                </h1>
                <Badge className={`${serviceColor} shadow-none text-[10px] font-medium px-1.5 py-0.5`}>
                  {request.service_type.toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Request #{request.id.slice(0, 8)}
              </p>
            </div>
          </div>

          <div className="divide-y divide-neutral-100">
            <div className="flex justify-between py-2.5">
              <span className="text-xs text-neutral-500 uppercase tracking-wide">Pickup Area</span>
              <span className="text-sm font-medium text-neutral-900">
                {request.pickup_fuzzy}
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-xs text-neutral-500 uppercase tracking-wide">Dropoff Area</span>
              <span className="text-sm font-medium text-neutral-900">
                {request.dropoff_fuzzy}
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-xs text-neutral-500 uppercase tracking-wide">
                {request.start_time ? "Date & Time" : "Start Date"}
              </span>
              <span className="text-sm font-medium text-neutral-900">
                {formattedDate}
                {request.start_time && ` at ${request.start_time}`}
              </span>
            </div>

            {request.service_type === "school" && request.metadata_safe?.schedule_type && (
              <div className="flex justify-between py-2.5">
                <span className="text-xs text-neutral-500 uppercase tracking-wide">Schedule</span>
                <span className="text-sm font-medium text-neutral-900">
                  {request.metadata_safe.schedule_type}
                </span>
              </div>
            )}
            {request.service_type === "school" && request.metadata_safe?.student_count && (
              <div className="flex justify-between py-2.5">
                <span className="text-xs text-neutral-500 uppercase tracking-wide">Students</span>
                <span className="text-sm font-medium text-neutral-900">
                  {request.metadata_safe.student_count}
                </span>
              </div>
            )}
            {request.metadata_safe?.note && (
              <div className="py-3">
                <span className="text-xs text-neutral-500 uppercase tracking-wide block mb-1.5">
                  Note from parent
                </span>
                <p className="text-sm text-neutral-700 italic leading-relaxed">
                  &ldquo;{request.metadata_safe.note}&rdquo;
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Quote form */}
        <Card className="p-6 shadow-none border border-neutral-200">
          <h2 className="text-base font-semibold text-neutral-900 mb-1">
            Your Quote
          </h2>
          <p className="text-xs text-neutral-400 mb-5">All fields marked * are required.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
                Price (USD) <span className="text-neutral-900">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                disabled={submitting}
                className="text-base font-medium shadow-none focus-visible:ring-0 focus-visible:border-neutral-900 h-11"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
                Vehicle Type <span className="text-neutral-900">*</span>
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
                Message <span className="text-neutral-400 normal-case font-normal">(optional)</span>
              </label>
              <textarea
                placeholder="Availability, special features, route notes..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={submitting}
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2.5 border border-neutral-200 rounded-md text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 resize-none transition-colors"
              />
              <p className="text-xs text-neutral-400 mt-1 text-right">
                {message.length}/500
              </p>
            </div>

            {error && (
              <div className="border border-neutral-200 rounded-md px-4 py-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-neutral-400 mt-0.5 shrink-0" />
                <p className="text-sm text-neutral-600">{error}</p>
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

            <p className="text-xs text-neutral-400 text-center">
              Expires automatically in 72 hours
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function SubmitQuotePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-50" />}>
      <SubmitQuoteContent />
    </Suspense>
  );
}
