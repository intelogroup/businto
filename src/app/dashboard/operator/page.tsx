"use client";

import { Suspense, useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  DollarSign,
  FileText,
  CheckCircle,
  Clock,
  MapPin,
  Calendar,
  Bus,
  HeartPulse,
  Gem,
  Star,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OperatorDashboardData {
  operator: {
    id: string;
    company_name: string;
    company_email: string;
    rating: number;
    total_reviews: number;
    is_partner: boolean;
    specialties: string[];
    service_radius_miles: number;
  } | null;
  stats: {
    totalQuotes: number;
    pendingQuotes: number;
    acceptedQuotes: number;
    activeBookings: number;
    completedTrips: number;
    totalEarnings: number;
  };
  quotes: any[];
  bookings: any[];
}

function getServiceIcon(type: string) {
  switch (type) {
    case "school":
      return <Bus className="h-4 w-4 text-amber-600" />;
    case "medical":
      return <HeartPulse className="h-4 w-4 text-sky-600" />;
    case "wedding":
      return <Gem className="h-4 w-4 text-violet-600" />;
    default:
      return <Bus className="h-4 w-4 text-neutral-500" />;
  }
}

function getQuoteStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 shadow-none text-[10px] font-bold h-5 px-1.5 uppercase">
          Pending
        </Badge>
      );
    case "accepted":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200 shadow-none text-[10px] font-bold h-5 px-1.5 uppercase">
          Accepted
        </Badge>
      );
    case "declined":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 shadow-none text-[10px] font-bold h-5 px-1.5 uppercase">
          Declined
        </Badge>
      );
    case "expired":
      return (
        <Badge className="bg-neutral-100 text-neutral-500 border-neutral-200 shadow-none text-[10px] font-bold h-5 px-1.5 uppercase">
          Expired
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-[10px] font-bold h-5 px-1.5 uppercase">
          {status}
        </Badge>
      );
  }
}

function getBookingStatusBadge(status: string) {
  switch (status) {
    case "confirmed":
      return (
        <Badge className="bg-sky-600 hover:bg-sky-600 text-white font-bold text-[10px] h-5 px-1.5 uppercase">
          Confirmed
        </Badge>
      );
    case "in_progress":
      return (
        <Badge className="bg-amber-500 hover:bg-amber-500 text-white font-bold text-[10px] h-5 px-1.5 uppercase">
          In Progress
        </Badge>
      );
    case "completed":
      return (
        <Badge className="bg-green-600 hover:bg-green-600 text-white font-bold text-[10px] h-5 px-1.5 uppercase">
          Completed
        </Badge>
      );
    case "cancelled":
      return (
        <Badge className="bg-red-600 hover:bg-red-600 text-white font-bold text-[10px] h-5 px-1.5 uppercase">
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 uppercase">
          {status}
        </Badge>
      );
  }
}

function OperatorDashboardContent() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<OperatorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login?redirect=/dashboard/operator");
      return;
    }
    if (user.role !== "operator" && user.role !== "admin" && user.role !== "manager") {
      setError("This dashboard is for registered operators only.");
      setLoading(false);
      return;
    }
    fetchDashboard();
  }, [user, authLoading]);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/operator/dashboard");
      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Failed to load dashboard");
        setLoading(false);
        return;
      }
      const dashboardData = await res.json();
      setData(dashboardData);
    } catch (err) {
      setError("Failed to load dashboard. Please try again.");
    } finally {
      setLoading(false);
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
        <div className="container mx-auto max-w-4xl px-4 pt-24 text-center">
          <AlertCircle className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">Access Denied</h2>
          <p className="text-neutral-500 text-sm">{error}</p>
          <Button variant="outline" className="mt-6" onClick={() => router.push("/dashboard")}>
            Go to Customer Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { operator, stats, quotes, bookings } = data;
  const pendingQuotes = quotes.filter((q) => q.status === "pending");
  const activeBookings = bookings.filter((b) => ["confirmed", "in_progress"].includes(b.status));
  const pastBookings = bookings.filter((b) => ["completed", "cancelled"].includes(b.status));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-20 container mx-auto max-w-[1200px] px-4 sm:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              {operator?.company_name || "Operator Dashboard"}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              {operator?.is_partner && (
                <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 shadow-none text-[10px] font-bold px-1.5 uppercase">
                  Affiliate Partner
                </Badge>
              )}
              {operator?.rating && (
                <span className="flex items-center gap-1 text-xs text-neutral-500">
                  <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                  {operator.rating.toFixed(1)} ({operator.total_reviews || 0} reviews)
                </span>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDashboard} className="h-9 rounded-md">
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="shadow-sm border-neutral-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded bg-amber-50 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-neutral-900">{stats.pendingQuotes}</p>
                  <p className="text-[11px] text-neutral-500 font-medium uppercase tracking-wide">
                    Pending Quotes
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-neutral-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded bg-sky-50 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-sky-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-neutral-900">{stats.activeBookings}</p>
                  <p className="text-[11px] text-neutral-500 font-medium uppercase tracking-wide">
                    Active Trips
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-neutral-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded bg-green-50 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-neutral-900">{stats.completedTrips}</p>
                  <p className="text-[11px] text-neutral-500 font-medium uppercase tracking-wide">
                    Completed
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-neutral-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded bg-emerald-50 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-neutral-900">
                    ${stats.totalEarnings.toFixed(0)}
                  </p>
                  <p className="text-[11px] text-neutral-500 font-medium uppercase tracking-wide">
                    Total Earnings
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs: Active Bookings / Quote History */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="mb-6 bg-white p-1 border border-neutral-200 shadow-sm rounded-md">
            <TabsTrigger value="active" className="text-sm font-medium rounded px-6">
              Active Trips ({activeBookings.length})
            </TabsTrigger>
            <TabsTrigger value="quotes" className="text-sm font-medium rounded px-6">
              Quote History ({quotes.length})
            </TabsTrigger>
            <TabsTrigger value="past" className="text-sm font-medium rounded px-6">
              Past Trips ({pastBookings.length})
            </TabsTrigger>
          </TabsList>

          {/* Active Bookings */}
          <TabsContent value="active">
            {activeBookings.length === 0 ? (
              <Card className="border-dashed border-2 bg-white shadow-none rounded-lg">
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <div className="w-12 h-12 rounded bg-white flex items-center justify-center mb-4">
                    <TrendingUp className="h-6 w-6 text-neutral-400" />
                  </div>
                  <h3 className="font-semibold text-neutral-900 mb-1">No Active Trips</h3>
                  <p className="text-neutral-500 text-sm text-center max-w-sm">
                    When a customer accepts one of your quotes, their trip will appear here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {activeBookings.map((booking: any) => (
                  <Card
                    key={booking.id}
                    className="shadow-sm border-neutral-200 hover:border-neutral-300 transition-colors rounded-lg bg-white overflow-hidden"
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div
                            className={cn(
                              "h-10 w-10 rounded flex items-center justify-center shrink-0",
                              booking.request?.service_type === "school" && "bg-amber-100",
                              booking.request?.service_type === "medical" && "bg-sky-100",
                              booking.request?.service_type === "wedding" && "bg-violet-100"
                            )}
                          >
                            {getServiceIcon(booking.request?.service_type)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-mono text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                                {booking.confirmation_code}
                              </span>
                              {getBookingStatusBadge(booking.status)}
                            </div>
                            <div className="flex items-center gap-2 mt-2 text-xs text-neutral-600">
                              <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                              <span className="truncate max-w-[200px]">
                                {booking.request?.pickup_fuzzy}
                              </span>
                              <span className="text-neutral-300">→</span>
                              <span className="truncate max-w-[200px]">
                                {booking.request?.dropoff_fuzzy}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 mt-1.5 text-xs text-neutral-500">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {booking.request?.start_date
                                  ? new Date(booking.request.start_date).toLocaleDateString(
                                      "en-US",
                                      { month: "short", day: "numeric" }
                                    )
                                  : "TBD"}
                              </span>
                              {booking.request?.start_time && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {booking.request.start_time.slice(0, 5)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-semibold text-neutral-900">
                            ${(booking.amount || 0).toFixed(2)}
                          </p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-bold h-5 px-1.5 uppercase mt-1",
                              booking.payment_status === "paid"
                                ? "border-green-200 text-green-700 bg-green-50"
                                : "border-amber-200 text-amber-700 bg-amber-50"
                            )}
                          >
                            {booking.payment_status === "paid" ? "Paid" : "Pending Payment"}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Quote History */}
          <TabsContent value="quotes">
            {quotes.length === 0 ? (
              <Card className="border-dashed border-2 bg-white shadow-none rounded-lg">
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <div className="w-12 h-12 rounded bg-white flex items-center justify-center mb-4">
                    <FileText className="h-6 w-6 text-neutral-400" />
                  </div>
                  <h3 className="font-semibold text-neutral-900 mb-1">No Quotes Yet</h3>
                  <p className="text-neutral-500 text-sm text-center max-w-sm">
                    Your submitted quotes will appear here. Check your email for new job requests.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {quotes.map((quote: any) => (
                  <Card
                    key={quote.id}
                    className="shadow-sm border-neutral-200 rounded-lg bg-white"
                  >
                    <CardContent className="p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {getServiceIcon(quote.request?.service_type)}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-neutral-900 capitalize">
                                {quote.request?.service_type || "Transport"} Trip
                              </span>
                              {getQuoteStatusBadge(quote.status)}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
                              <span className="truncate max-w-[180px]">
                                {quote.request?.pickup_fuzzy}
                              </span>
                              <span className="text-neutral-300">→</span>
                              <span className="truncate max-w-[180px]">
                                {quote.request?.dropoff_fuzzy}
                              </span>
                            </div>
                            <p className="text-[10px] text-neutral-400 mt-1">
                              Quoted{" "}
                              {new Date(quote.created_at).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                              {quote.vehicle_type && ` · ${quote.vehicle_type}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-semibold text-neutral-900">
                            {quote.total_price > 0
                              ? `$${quote.total_price.toFixed(2)}`
                              : "Call to discuss"}
                          </p>
                          {quote.request?.start_date && (
                            <p className="text-[10px] text-neutral-400 mt-0.5">
                              Trip:{" "}
                              {new Date(quote.request.start_date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Past Trips */}
          <TabsContent value="past">
            {pastBookings.length === 0 ? (
              <Card className="border-dashed border-2 bg-white shadow-none rounded-lg">
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <div className="w-12 h-12 rounded bg-white flex items-center justify-center mb-4">
                    <CheckCircle className="h-6 w-6 text-neutral-400" />
                  </div>
                  <h3 className="font-semibold text-neutral-900 mb-1">No Past Trips</h3>
                  <p className="text-neutral-500 text-sm">
                    Your completed and cancelled trips will appear here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {pastBookings.map((booking: any) => (
                  <Card
                    key={booking.id}
                    className={cn(
                      "shadow-sm border-neutral-200 bg-white rounded-lg",
                      booking.status === "cancelled" && "opacity-60"
                    )}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          {getServiceIcon(booking.request?.service_type)}
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[10px] font-bold text-neutral-400 uppercase">
                                {booking.confirmation_code}
                              </span>
                              {getBookingStatusBadge(booking.status)}
                            </div>
                            <p className="text-xs text-neutral-500 mt-1">
                              {booking.request?.pickup_fuzzy} → {booking.request?.dropoff_fuzzy}
                            </p>
                          </div>
                        </div>
                        <p className="text-lg font-semibold text-neutral-900">
                          ${(booking.amount || 0).toFixed(2)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default function OperatorDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <OperatorDashboardContent />
    </Suspense>
  );
}
