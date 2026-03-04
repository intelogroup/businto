"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { quoteSchema } from "@/lib/quote-validation";

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
  const [passed, setPassed] = useState(false);
  const [passing, setPassing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<TransportRequest | null>(null);
  const [operatorId, setOperatorId] = useState<string | null>(null);

  // Form state
  const [price, setPrice] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [message, setMessage] = useState("");

  const logClientError = async (message: string, metadata: any = {}) => {
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'operator_claim_page_error',
          status: 'error',
          message,
          request_id: requestId,
          metadata
        })
      });
    } catch (e) {
      console.error('Failed to send error log to server', e);
    }
  };

  useEffect(() => {
    async function init() {
      console.log('🔍 Quote Submit Page - Initializing...');
      
      // Early log for tracking link clicks
      fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'operator_claim_page_load_start',
          status: 'info',
          message: 'Operator clicked claim link and page started loading',
          request_id: requestId,
          metadata: {
            has_token: !!accessToken,
            referrer: typeof document !== 'undefined' ? document.referrer : 'unknown'
          }
        })
      }).catch(e => console.error('Failed to log page load start', e));

      console.log('📋 Request ID:', requestId);
      console.log('🔑 Access Token:', accessToken ? `${accessToken.substring(0, 20)}...` : 'MISSING');

      if (!accessToken) {
        console.error('❌ No access token provided');
        setError("Access token required. Please use the link from your email.");
        setLoading(false);
        logClientError("Missing token in URL", { request_id: requestId });
        return;
      }

      console.log('✅ AccessToken present. Fetching request details...');

      // Fetch sanitized request details via operator view API with token
      // This endpoint only returns safe fields, no PII
      try {
        const apiUrl = requestId 
          ? `/api/requests/${requestId}/operator-view?token=${accessToken}`
          : `/api/requests/view-by-token?token=${accessToken}`;
        
        const sanitizedUrl = apiUrl.includes('token=') 
          ? apiUrl.split('token=')[0] + 'token=[REDACTED]' 
          : apiUrl;
          
        console.log('🌐 Fetching from:', sanitizedUrl);

        const response = await fetch(apiUrl);
        console.log('📡 Response status:', response.status, response.statusText);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ API Error Response:', errorText);
          
          await logClientError("API Fetch Failed", { 
            status: response.status, 
            statusText: response.statusText,
            errorText,
            url: sanitizedUrl
          });

          if (response.status === 401) {
            console.error('🔒 Authentication failed - invalid or expired token');
            setError("Invalid or expired access token. Please use the link from your email.");
            logClientError("Invalid/Expired Token", { status: 401, errorText });
          } else if (response.status === 429) {
            console.error('⏱️ Rate limit exceeded');
            setError("Rate limit exceeded. Please try again later.");
            logClientError("Rate Limited", { status: 429 });
          } else {
            console.error(`🚫 Request failed with status ${response.status}`);
            setError(`Request not found (${response.status})`);
            logClientError("Upstream API Error", { status: response.status, errorText });
          }
          setLoading(false);
          return;
        }

        const requestData = await response.json();
        console.log('✅ Request data loaded:', {
          id: requestData.id,
          service_type: requestData.service_type,
          pickup: requestData.pickup_fuzzy,
          dropoff: requestData.dropoff_fuzzy,
          operator_id: requestData.operator_id
        });
        setRequest(requestData);
        // Explicitly set to null if not present to avoid 'undefined' issues
        setOperatorId(requestData.operator_id || null);
        setLoading(false);

        // Log successful open
        fetch('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: 'operator_claim_page_open',
            status: 'success',
            message: 'Operator opened inquiry page',
            request_id: requestId,
            operator_id: requestData.operator_id
          })
        }).catch(e => console.error('Failed to log page open', e));

      } catch (err) {
        console.error('💥 Fatal error fetching request:', err);
        const errMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to load request details: ${errMessage}`);
        logClientError("Fetch Exception", {
          message: errMessage,
          stack: err instanceof Error ? err.stack : undefined
        });
        setLoading(false);
      }
    }

    init();
  }, [requestId, accessToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('📤 Quote submission initiated');

    if (!request) {
      console.error('❌ No request data available');
      logClientError("Submission Attempted Without Request Data");
      return;
    }

    setSubmitting(true);
    setError(null);

    const priceNum = price ? parseFloat(price) : 0;
    const quotePayload = {
      request_id: request.id,
      operator_id: operatorId || null,
      total_price: priceNum,
      vehicle_type: vehicleType.trim(),
      note: message.trim() || undefined,
    };

    const validation = quoteSchema.safeParse(quotePayload);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || "Invalid quote data";
      console.error('❌ Quote validation failed:', validation.error.format());
      setError(firstError);
      setSubmitting(false);
      logClientError("Quote Validation Failed", { errors: validation.error.format() });
      return;
    }

    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit quote");
      }

      setSubmitted(true);
      fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'operator_claim_submit_success',
          status: 'success',
          message: 'Operator submitted quote successfully',
          request_id: requestId,
          operator_id: operatorId
        })
      }).catch(e => console.error('Failed to log submission success', e));

    } catch (err: any) {
      const errMessage = err.message || "Failed to submit quote";
      setError(errMessage);
      setSubmitting(false);
      logClientError("Quote Submission Failed", { message: errMessage });
    }
  };

  const handlePass = async () => {
    if (!requestId || !accessToken || passing) return;
    setPassing(true);
    try {
      const res = await fetch('/api/quotes/pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, token: accessToken }),
      });
      if (res.ok) {
        setPassed(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to submit. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setPassing(false);
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
    "bg-white text-neutral-800";

  if (passed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <Card className="max-w-md w-full p-10 text-center shadow-none border border-neutral-200">
          <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-6 h-6 text-neutral-500" />
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mb-2">
            Thanks for letting us know
          </h1>
          <p className="text-sm text-neutral-500">
            We'll find another operator for this request. No action needed on your end.
          </p>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <Card className="max-w-md w-full p-10 text-center shadow-none border border-neutral-200">
          <div className="w-12 h-12 rounded-full bg-neutral-900 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mb-2">
            Details Submitted!
          </h1>
          <p className="text-sm text-neutral-500 mb-8">
            Your claim/quote has been sent to the customer. They will be in touch if interested.<br /><br />
            <strong>Note:</strong> The customer is the only one who can lock a job. If they proceed with another operator, this request will be closed.
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
    <div className="min-h-screen bg-background">
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
            <strong>Important:</strong> Claiming this job notifies the parent of your interest, but the parent makes the final decision. If they choose another operator first, this request will be closed.
          </p>
        </div>

        {/* Request details */}
        <Card className="p-6 mb-5 shadow-none border border-neutral-200">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-md bg-white flex items-center justify-center text-lg shrink-0">
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

            {request.service_type === "medical" && (
              <div className="space-y-0.5 pt-1 pb-2">
                <div className="flex justify-between py-2.5">
                  <span className="text-xs text-neutral-500 uppercase tracking-wide">Mobility</span>
                  <span className="text-sm font-bold text-neutral-900 capitalize">
                    {request.metadata_safe.mobility_level?.replace('-', ' ')}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-xs text-neutral-500 uppercase tracking-wide">Service Level</span>
                  <span className="text-sm font-medium text-neutral-900 capitalize">
                    {request.metadata_safe.service_level?.replace(/-/g, ' ')}
                  </span>
                </div>
                {request.metadata_safe.facility_details && (
                  <div className="flex justify-between py-2.5">
                    <span className="text-xs text-neutral-500 uppercase tracking-wide">Facility Info</span>
                    <span className="text-sm font-medium text-neutral-900">
                      {request.metadata_safe.facility_details}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-2.5">
                  <span className="text-xs text-neutral-500 uppercase tracking-wide">Stairs</span>
                  <span className="text-sm font-medium text-neutral-900">
                    {request.metadata_safe.stair_factor === 'none' ? 'No Stairs' :
                      request.metadata_safe.stair_factor === '1-5' ? '1-5 Stairs' :
                        request.metadata_safe.stair_factor === 'flight' ? 'Full Flight' : 'Not specified'}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-xs text-neutral-500 uppercase tracking-wide">Timing</span>
                  <span className="text-sm font-medium text-neutral-900">
                    {request.metadata_safe.trip_type === 'round-trip' ? 'Round Trip' : 'One Way'}
                    {request.metadata_safe.return_status && ` (${request.metadata_safe.return_status === 'will-call' ? 'Will-Call' : 'Fixed Return'})`}
                  </span>
                </div>

                {/* Critical Flags */}
                <div className="flex flex-wrap gap-2 py-3">
                  {request.metadata_safe.oxygen_use && (
                    <Badge className="bg-sky-50 text-sky-700 border-sky-100 shadow-none hover:bg-sky-50">PORTABLE OXYGEN</Badge>
                  )}
                  {request.metadata_safe.is_bariatric && (
                    <Badge className="bg-red-50 text-red-700 border-red-100 shadow-none hover:bg-red-50">BARIATRIC (250+ LBS)</Badge>
                  )}
                  {request.metadata_safe.service_animal && (
                    <Badge className="bg-amber-50 text-amber-700 border-amber-100 shadow-none hover:bg-amber-50">SERVICE ANIMAL</Badge>
                  )}
                  {request.metadata_safe.additional_passengers > 0 && (
                    <Badge className="bg-white text-neutral-700 border-neutral-100 shadow-none hover:bg-white">
                      +{request.metadata_safe.additional_passengers} ESCORT(S)
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {request.service_type === "wedding" && (
              <div className="space-y-0.5 pt-1 pb-2">
                <div className="flex justify-between py-2.5">
                  <span className="text-xs text-neutral-500 uppercase tracking-wide">Event Category</span>
                  <span className="text-sm font-bold text-neutral-900 capitalize">
                    {request.metadata_safe.event_category || 'Event'}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-xs text-neutral-500 uppercase tracking-wide">Guest Count</span>
                  <span className="text-sm font-medium text-neutral-900">
                    {request.metadata_safe.guest_count} passengers
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-xs text-neutral-500 uppercase tracking-wide">Shuttle Mode</span>
                  <span className="text-sm font-medium text-neutral-900 capitalize">
                    {request.metadata_safe.shuttle_mode?.replace('-', ' ')}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-xs text-neutral-500 uppercase tracking-wide">Vehicle Pref.</span>
                  <span className="text-sm font-medium text-neutral-900 capitalize">
                    {request.metadata_safe.vehicle_style?.replace('-', ' ')}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-xs text-neutral-500 uppercase tracking-wide">Timing</span>
                  <span className="text-sm font-medium text-neutral-900">
                    Starts: {request.metadata_safe.pickup_time}
                    {request.metadata_safe.event_start_time && ` · Ceremony: ${request.metadata_safe.event_start_time}`}
                  </span>
                </div>

                {/* Amenities Flags */}
                <div className="flex flex-wrap gap-2 py-3">
                  {request.metadata_safe.alcohol_allowed && (
                    <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 shadow-none hover:bg-indigo-50">ALCOHOL ALLOWED</Badge>
                  )}
                  {request.metadata_safe.refreshments_provided && (
                    <Badge className="bg-green-50 text-green-700 border-green-100 shadow-none hover:bg-green-50">REFRESHMENTS</Badge>
                  )}
                  {request.metadata_safe.av_needs && (
                    <Badge className="bg-violet-50 text-violet-700 border-violet-100 shadow-none hover:bg-violet-50">AV / BLUETOOTH</Badge>
                  )}
                  {request.metadata_safe.special_decor && (
                    <Badge className="bg-rose-50 text-rose-700 border-rose-100 shadow-none hover:bg-rose-50">CUSTOM DECOR</Badge>
                  )}
                </div>
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
            Quote Details
          </h2>
          <p className="text-xs text-neutral-400 mb-5">Leave price empty to submit a "Claim Job / Need to Discuss" request.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
                Price (USD) <span className="text-neutral-400 normal-case font-normal">(optional - leave blank to request a call)</span>
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
                "Claim Job"
              )}
            </Button>

            <p className="text-xs text-neutral-400 text-center">
              Expires automatically in 72 hours
            </p>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={handlePass}
                disabled={passing}
                className="text-xs text-neutral-400 hover:text-neutral-600 underline underline-offset-4 disabled:opacity-50"
              >
                {passing ? 'Submitting...' : "I can't take this job"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function SubmitQuotePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SubmitQuoteContent />
    </Suspense>
  );
}
