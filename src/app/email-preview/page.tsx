"use client";

import { useState } from "react";
import { FirstQuoteEmail } from "@/components/emails/first-quote-email";
import { MultipleQuotesEmail } from "@/components/emails/multiple-quotes-email";
import { TripRequest, Quote } from "@/types/quotes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function EmailPreviewPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<'first' | 'multiple'>('first');

  // Mock data for email previews
  const mockTripRequest: TripRequest = {
    id: "trip-123",
    userId: "user-123",
    service_type: "school",
    pickup_fuzzy_location: "Oak St area, Boston",
    dropoff_fuzzy_location: "Lincoln Elementary School",
    pickup_lat: 42.3601,
    pickup_lng: -71.0589,
    dropoff_lat: 42.3656,
    dropoff_lng: -71.0621,
    distance: 4.2,
    duration: 18,
    pickup_date: "2025-01-15",
    pickup_time: "7:45 AM",
    passengers: 2,
    requirements: {
      childSeats: 2,
    },
    status: "quoted",
    created_at: new Date(),
  };

  const mockQuote: Quote = {
    id: "quote-1",
    tripRequestId: "trip-123",
    operatorId: "op-1",
    operatorName: "Alpha Transit",
    operatorRating: 4.8,
    operatorReviewCount: 124,
    totalPrice: 65,
    baseFare: 45,
    distanceCharge: 12,
    additionalFees: [{ name: "Monitor fee", amount: 8 }],
    vehicleType: "Mercedes Sprinter",
    vehicleYear: 2022,
    vehicleCapacity: 14,
    coriCertified: true,
    insuranceVerified: true,
    wheelchairAccessible: true,
    operatorNote: "I have 3 other pickups nearby - can offer 10% discount if flexible on time",
    responseTime: 3,
    status: "pending",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  };

  const mockQuotes: Quote[] = [
    mockQuote,
    {
      ...mockQuote,
      id: "quote-2",
      operatorName: "Boston Coach",
      operatorRating: 4.9,
      operatorReviewCount: 98,
      totalPrice: 55,
      baseFare: 40,
      distanceCharge: 15,
      additionalFees: [],
      responseTime: 5,
      isLowestPrice: true,
      discount: { percentage: 10, reason: "First-time customer" },
      operatorNote: undefined,
    },
    {
      ...mockQuote,
      id: "quote-3",
      operatorName: "SafeWay Vans",
      operatorRating: 5.0,
      operatorReviewCount: 67,
      totalPrice: 68,
      baseFare: 50,
      distanceCharge: 18,
      additionalFees: [],
      responseTime: 7,
      isHighestRated: true,
      operatorNote: undefined,
    },
    {
      ...mockQuote,
      id: "quote-4",
      operatorName: "Legacy Limo",
      operatorRating: 4.7,
      operatorReviewCount: 156,
      totalPrice: 72,
      baseFare: 48,
      distanceCharge: 24,
      additionalFees: [],
      responseTime: 4,
      operatorNote: undefined,
    },
    {
      ...mockQuote,
      id: "quote-5",
      operatorName: "Elite Transport",
      operatorRating: 4.6,
      operatorReviewCount: 89,
      totalPrice: 70,
      baseFare: 46,
      distanceCharge: 24,
      additionalFees: [],
      responseTime: 9,
      operatorNote: undefined,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg p-8 shadow-lg border border-neutral-200">
          <h1 className="text-4xl font-bold text-neutral-900 mb-2">Email Template Preview</h1>
          <p className="text-neutral-600">
            Preview the email templates sent to users when they receive quotes
          </p>
        </div>

        {/* Template Selector */}
        <div className="bg-white rounded-lg p-6 shadow-lg border border-neutral-200">
          <Tabs value={selectedTemplate} onValueChange={(v) => setSelectedTemplate(v as 'first' | 'multiple')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="first">First Quote Email</TabsTrigger>
              <TabsTrigger value="multiple">Multiple Quotes Email</TabsTrigger>
            </TabsList>

            <div className="mt-6">
              <TabsContent value="first">
                <div className="space-y-4">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <h3 className="font-bold text-indigo-900 mb-2">When is this sent?</h3>
                    <p className="text-sm text-indigo-800">
                      This email is sent immediately when the user receives their first quote from an operator.
                      It creates excitement and urgency while informing them that more quotes are likely coming.
                    </p>
                  </div>
                  <FirstQuoteEmail tripRequest={mockTripRequest} quote={mockQuote} />
                </div>
              </TabsContent>

              <TabsContent value="multiple">
                <div className="space-y-4">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <h3 className="font-bold text-indigo-900 mb-2">When is this sent?</h3>
                    <p className="text-sm text-indigo-800">
                      This email is sent after the user has received 5 or more quotes. It provides a comparison
                      view with statistics and highlights the best options, encouraging them to make a decision.
                    </p>
                  </div>
                  <MultipleQuotesEmail tripRequest={mockTripRequest} quotes={mockQuotes} />
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Implementation Notes */}
        <div className="bg-white rounded-lg p-6 shadow-lg border border-neutral-200">
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">Implementation Guide</h2>
          <div className="space-y-4 text-sm text-neutral-700">
            <div>
              <h3 className="font-bold text-neutral-900 mb-2">1. Email Service Setup</h3>
              <p className="mb-2">Install an email service provider (Resend recommended):</p>
              <code className="block bg-neutral-100 p-3 rounded-lg font-mono text-xs">
                npm install resend
              </code>
            </div>

            <div>
              <h3 className="font-bold text-neutral-900 mb-2">2. Environment Variables</h3>
              <p className="mb-2">Add to your .env.local:</p>
              <code className="block bg-neutral-100 p-3 rounded-lg font-mono text-xs">
                RESEND_API_KEY=your_api_key_here
              </code>
            </div>

            <div>
              <h3 className="font-bold text-neutral-900 mb-2">3. Trigger Notifications</h3>
              <p className="mb-2">Call the notification API when new quotes arrive:</p>
              <code className="block bg-neutral-100 p-3 rounded-lg font-mono text-xs overflow-x-auto">
                {`await fetch('/api/quotes/notify', {
  method: 'POST',
  body: JSON.stringify({
    userId: 'user-123',
    tripRequestId: 'trip-123',
    quoteCount: 1,
    emailType: 'first'
  })
});`}
              </code>
            </div>

            <div>
              <h3 className="font-bold text-neutral-900 mb-2">4. Real-time Subscriptions</h3>
              <p className="mb-2">Use the useNotifications hook in your app:</p>
              <code className="block bg-neutral-100 p-3 rounded-lg font-mono text-xs overflow-x-auto">
                {`import { useNotifications } from '@/hooks/use-notifications';

function MyComponent() {
  const { unreadCount } = useNotifications();

  return <div>New quotes: {unreadCount}</div>;
}`}
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
