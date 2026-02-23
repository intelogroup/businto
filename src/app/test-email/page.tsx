"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Send, CheckCircle2, AlertCircle } from "lucide-react";

export default function EmailTestPage() {
  const [emailType, setEmailType] = useState("request-confirmation");
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; previewUrl?: string } | null>(null);

  const testData = {
    "request-confirmation": {
      userName: "John Smith",
      userEmail: userEmail,
      serviceType: "School Run",
      pickupAddress: "123 Main St, Boston, MA",
      dropoffAddress: "Lincoln Elementary School, 456 School Rd, Boston, MA",
      date: "January 15, 2026",
      requestId: "REQ-12345"
    },
    "quote-received": {
      userName: "John Smith",
      userEmail: userEmail,
      operatorName: "Alpha Transit Services",
      price: 420.00,
      vehicleType: "School Bus (35-passenger)",
      requestId: "REQ-12345",
      quoteId: "test-quote-id-12345"
    },
    "booking-confirmation": {
      userName: "John Smith",
      userEmail: userEmail,
      confirmationCode: "BUS-2026-0115",
      operatorName: "Alpha Transit Services",
      vehicleType: "School Bus (35-passenger)",
      pickupAddress: "123 Main St, Boston, MA",
      dropoffAddress: "Lincoln Elementary School, Boston, MA",
      date: "January 15, 2026",
      time: "7:30 AM",
      amount: 420.00
    },
    "payment-success": {
      userName: "John Smith",
      userEmail: userEmail,
      confirmationCode: "BUS-2026-0115",
      amount: 420.00
    },
    "quote-accepted": {
      operatorName: "Alpha Transit Services",
      userEmail: userEmail,
      parentName: "John Smith",
      parentEmail: "parent@test.com",
      parentPhone: "+1 (555) 123-4567",
      quoteAmount: 420.00,
      pickup: "123 Main St, Boston, MA",
      dropoff: "Lincoln Elementary School, 456 School Rd, Boston, MA",
      date: "January 15, 2026",
      passengers: 25,
      vehicleType: "School Bus (35-passenger)"
    }
  };

  const handleSendEmail = async () => {
    if (!userEmail) {
      setResult({ success: false, message: "Please enter an email address" });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: emailType,
          data: testData[emailType as keyof typeof testData]
        })
      });

      const data = await response.json();

      if (response.ok) {
        setResult({ 
          success: true, 
          message: "Email sent successfully!",
          previewUrl: data.previewUrl 
        });
      } else {
        setResult({ success: false, message: data.error || "Failed to send email" });
      }
    } catch (error) {
      setResult({ success: false, message: "Network error: " + (error instanceof Error ? error.message : "Unknown error") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 bg-white rounded-full px-6 py-3 shadow-lg mb-4">
            <Mail className="w-6 h-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-neutral-900">Email Testing Dashboard</h1>
          </div>
          <p className="text-neutral-600">Test all email notifications in your Businto workflow</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Email Tester */}
          <Card className="shadow-xl border-0">
            <CardHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-xl">
              <CardTitle>Send Test Email</CardTitle>
              <CardDescription className="text-indigo-100">
                Choose an email type and recipient
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">Recipient Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="test@example.com"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Email Type</Label>
                <Select value={emailType} onValueChange={setEmailType}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="request-confirmation">
                      <div className="flex flex-col items-start py-1">
                        <span className="font-semibold">Request Confirmation</span>
                        <span className="text-xs text-neutral-500">Sent after user submits request</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="quote-received">
                      <div className="flex flex-col items-start py-1">
                        <span className="font-semibold">Quote Received</span>
                        <span className="text-xs text-neutral-500">Sent when operator sends quote</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="booking-confirmation">
                      <div className="flex flex-col items-start py-1">
                        <span className="font-semibold">Booking Confirmation</span>
                        <span className="text-xs text-neutral-500">Sent when booking is confirmed</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="payment-success">
                      <div className="flex flex-col items-start py-1">
                        <span className="font-semibold">Payment Success</span>
                        <span className="text-xs text-neutral-500">Sent after payment processed</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="quote-accepted">
                      <div className="flex flex-col items-start py-1">
                        <span className="font-semibold">Quote Accepted</span>
                        <span className="text-xs text-neutral-500">Sent to operator when quote accepted</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleSendEmail}
                disabled={loading || !userEmail}
                className="w-full h-12 text-base font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
              >
                {loading ? (
                  "Sending..."
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    Send Test Email
                  </>
                )}
              </Button>

              {result && (
                <div className={`p-4 rounded-lg border ${
                  result.success 
                    ? "bg-green-50 border-green-200" 
                    : "bg-red-50 border-red-200"
                }`}>
                  <div className="flex items-start gap-3">
                    {result.success ? (
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-green-600 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className={`font-medium ${result.success ? "text-green-700" : "text-red-700"}`}>
                        {result.message}
                      </p>
                      {result.previewUrl && (
                        <a 
                          href={result.previewUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
                        >
                          🔗 View Email Preview
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Email Flow Preview */}
          <Card className="shadow-xl border-0">
            <CardHeader className="bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-t-xl">
              <CardTitle>Email Workflow</CardTitle>
              <CardDescription className="text-purple-100">
                User journey email sequence
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {[
                  {
                    step: 1,
                    title: "Request Confirmation",
                    desc: "User submits transport request",
                    trigger: "Immediate",
                    color: "indigo"
                  },
                  {
                    step: 2,
                    title: "Quote Received",
                    desc: "Operator submits a quote",
                    trigger: "When quote submitted",
                    color: "green"
                  },
                  {
                    step: 3,
                    title: "Booking Confirmation",
                    desc: "User accepts quote and books",
                    trigger: "When booking created",
                    color: "blue"
                  },
                  {
                    step: 4,
                    title: "Payment Success",
                    desc: "Payment processed successfully",
                    trigger: "After payment",
                    color: "emerald"
                  }
                ].map((item) => (
                  <div
                    key={item.step}
                    className="relative pl-8 pb-4 border-l-2 border-neutral-200 last:border-l-0 last:pb-0"
                  >
                    <div
                      className={`absolute left-0 -translate-x-1/2 w-6 h-6 rounded-full bg-${item.color}-500 text-white flex items-center justify-center text-xs font-bold`}
                      style={{ backgroundColor: `var(--${item.color}-500, #6366f1)` }}
                    >
                      {item.step}
                    </div>
                    <div>
                      <h3 className="font-bold text-neutral-900">{item.title}</h3>
                      <p className="text-sm text-neutral-600">{item.desc}</p>
                      <p className="text-xs text-neutral-400 mt-1">⏱ {item.trigger}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sample Data Preview */}
        <Card className="mt-6 shadow-xl border-0">
          <CardHeader>
            <CardTitle>Sample Data Preview</CardTitle>
            <CardDescription>
              Data being sent for {emailType.replace("-", " ")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-neutral-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm">
              {JSON.stringify(testData[emailType as keyof typeof testData], null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
