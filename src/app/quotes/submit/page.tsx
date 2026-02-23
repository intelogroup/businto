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
  school: "bg-amber-100 text-amber-800 border-amber-300",
  medical: "bg-blue-100 text-blue-800 border-blue-300",
  wedding: "bg-purple-100 text-purple-800 border-purple-300",
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
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (error && !request) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
        <Card className="max-w-md p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-neutral-900 mb-2">Error</h1>
          <p className="text-neutral-600">{error}</p>
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
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
        <Card className="max-w-md p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            Quote submitted successfully!
          </h1>
          <p className="text-neutral-600 mb-6">
            Your quote has been sent to the customer.
          </p>
          <button
            onClick={handleWithdraw}
            className="text-sm text-neutral-500 hover:text-neutral-700 underline"
          >
            Withdraw quote
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Non-binding banner */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800 text-center font-medium">
            ⚠️ Non-binding inquiry. No commitment. Parent may contact multiple
            operators.
          </p>
        </div>

        {/* Request details */}
        <Card className="p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-3xl">{serviceIcon}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-xl font-bold text-neutral-900">
                  {request.service_type.charAt(0).toUpperCase() +
                    request.service_type.slice(1)}{" "}
                  Transportation
                </h1>
                <Badge className={serviceColor}>
                  {request.service_type.toUpperCase()}
                </Badge>
              </div>
              <p className="text-sm text-neutral-500">
                Request #{request.id.slice(0, 8)}
              </p>
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex justify-between">
              <span className="text-sm text-neutral-600">Pickup Area</span>
              <span className="text-sm font-medium text-neutral-900">
                {request.pickup_fuzzy}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-neutral-600">Dropoff Area</span>
              <span className="text-sm font-medium text-neutral-900">
                {request.dropoff_fuzzy}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-neutral-600">
                {request.start_time ? "Date & Time" : "Start Date"}
              </span>
              <span className="text-sm font-medium text-neutral-900">
                {formattedDate}
                {request.start_time && ` at ${request.start_time}`}
              </span>
            </div>

            {/* Service-specific metadata */}
            {request.service_type === "school" && request.metadata_safe?.schedule_type && (
              <div className="flex justify-between">
                <span className="text-sm text-neutral-600">Schedule</span>
                <span className="text-sm font-medium text-neutral-900">
                  {request.metadata_safe.schedule_type}
                </span>
              </div>
            )}
            {request.service_type === "school" && request.metadata_safe?.student_count && (
              <div className="flex justify-between">
                <span className="text-sm text-neutral-600">Students</span>
                <span className="text-sm font-medium text-neutral-900">
                  {request.metadata_safe.student_count}
                </span>
              </div>
            )}
            {request.metadata_safe?.note && (
              <div className="pt-2 border-t">
                <span className="text-sm text-neutral-600 block mb-1">
                  Note from parent:
                </span>
                <p className="text-sm text-neutral-900 italic">
                  "{request.metadata_safe.note}"
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Quote form */}
        <Card className="p-6">
          <h2 className="text-lg font-bold text-neutral-900 mb-4">
            Submit Indicative Quote
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Your Price ($) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g., 150.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                disabled={submitting}
                className="text-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Vehicle Type <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g., 14-passenger minibus"
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                required
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Message (optional)
              </label>
              <textarea
                placeholder="Brief note about availability, special features, etc."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={submitting}
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-neutral-500 mt-1">
                {message.length}/500 characters
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-6 text-lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                "Submit Quote"
              )}
            </Button>

            <p className="text-xs text-neutral-500 text-center">
              Quote automatically expires in 72 hours
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
