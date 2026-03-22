"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  DollarSign,
  TrendingUp,
  Calendar,
  MapPin,
  Clock,
  ArrowLeft,
  Bus,
  HeartPulse,
  Gem,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface EarningsTrip {
  id: string;
  confirmationCode: string;
  amount: number;
  serviceType: string;
  pickupFuzzy: string;
  dropoffFuzzy: string;
  startDate: string | null;
  startTime: string | null;
  completedAt: string;
}

interface MonthlySummary {
  month: string;
  total: number;
  tripCount: number;
}

interface EarningsData {
  trips: EarningsTrip[];
  monthlySummary: MonthlySummary[];
  currentMonth: MonthlySummary;
  allTimeTotal: number;
  totalTrips: number;
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

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function OperatorEarningsContent() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login?redirect=/dashboard/operator/earnings");
      return;
    }
    if (user.role !== "operator" && user.role !== "admin" && user.role !== "manager") {
      setError("This page is for registered operators only.");
      setLoading(false);
      return;
    }
    fetchEarnings();
  }, [user, authLoading]);

  const fetchEarnings = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/operator/earnings");
      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Failed to load earnings");
        setLoading(false);
        return;
      }
      const earningsData = await res.json();
      setData(earningsData);
    } catch {
      setError("Failed to load earnings. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const filteredTrips = useMemo(() => {
    if (!data) return [];
    if (selectedMonth === "all") return data.trips;
    return data.trips.filter(
      (t) => t.completedAt?.substring(0, 7) === selectedMonth
    );
  }, [data, selectedMonth]);

  const filteredTotal = useMemo(() => {
    return filteredTrips.reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTrips]);

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
          <Button variant="outline" className="mt-6" onClick={() => router.push("/dashboard/operator")}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-20 container mx-auto max-w-[1000px] px-4 sm:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/operator")}
            className="h-9 px-2"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Earnings History</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Track your completed trips and payouts
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card className="shadow-sm border-neutral-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded bg-emerald-50 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-neutral-900">
                    ${data.currentMonth.total.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-neutral-500 font-medium uppercase tracking-wide">
                    This Month
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-neutral-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded bg-sky-50 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-sky-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-neutral-900">
                    ${data.allTimeTotal.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-neutral-500 font-medium uppercase tracking-wide">
                    All Time
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
                  <p className="text-2xl font-bold text-neutral-900">{data.totalTrips}</p>
                  <p className="text-[11px] text-neutral-500 font-medium uppercase tracking-wide">
                    Completed Trips
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Summary */}
        {data.monthlySummary.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide mb-3">
              Monthly Breakdown
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {data.monthlySummary.slice(0, 8).map((ms) => (
                <button
                  key={ms.month}
                  onClick={() =>
                    setSelectedMonth(selectedMonth === ms.month ? "all" : ms.month)
                  }
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    selectedMonth === ms.month
                      ? "border-neutral-900 bg-neutral-50"
                      : "border-neutral-200 bg-white hover:border-neutral-300"
                  }`}
                >
                  <p className="text-xs text-neutral-500 mb-0.5">{formatMonth(ms.month)}</p>
                  <p className="text-lg font-semibold text-neutral-900">
                    ${ms.total.toFixed(0)}
                  </p>
                  <p className="text-[10px] text-neutral-400">
                    {ms.tripCount} trip{ms.tripCount !== 1 ? "s" : ""}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filter + Trip List */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">
            {selectedMonth === "all"
              ? `All Trips (${filteredTrips.length})`
              : `${formatMonth(selectedMonth)} (${filteredTrips.length} trips — $${filteredTotal.toFixed(2)})`}
          </h2>
          {selectedMonth !== "all" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedMonth("all")}
              className="text-xs text-neutral-500"
            >
              Show All
            </Button>
          )}
        </div>

        {filteredTrips.length === 0 ? (
          <Card className="border-dashed border-2 bg-white shadow-none rounded-lg">
            <CardContent className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 rounded bg-white flex items-center justify-center mb-4">
                <DollarSign className="h-6 w-6 text-neutral-400" />
              </div>
              <h3 className="font-semibold text-neutral-900 mb-1">No Earnings Yet</h3>
              <p className="text-neutral-500 text-sm text-center max-w-sm">
                Completed and paid trips will appear here with payout details.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredTrips.map((trip) => (
              <Card
                key={trip.id}
                className="shadow-sm border-neutral-200 rounded-lg bg-white"
              >
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {getServiceIcon(trip.serviceType)}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-neutral-900 capitalize">
                            {trip.serviceType} Transport
                          </span>
                          <span className="font-mono text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                            {trip.confirmationCode}
                          </span>
                          <Badge className="bg-green-100 text-green-700 border-green-200 shadow-none text-[10px] font-bold h-5 px-1.5 uppercase">
                            Paid
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
                          <MapPin className="h-3 w-3 text-neutral-400 shrink-0" />
                          <span className="truncate max-w-[180px]">{trip.pickupFuzzy}</span>
                          <span className="text-neutral-300">&rarr;</span>
                          <span className="truncate max-w-[180px]">{trip.dropoffFuzzy}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-neutral-400">
                          {trip.startDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(trip.startDate).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          )}
                          {trip.startTime && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {trip.startTime.slice(0, 5)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-semibold text-emerald-700">
                        +${trip.amount.toFixed(2)}
                      </p>
                      <p className="text-[10px] text-neutral-400 mt-0.5">
                        {new Date(trip.completedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function OperatorEarningsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <OperatorEarningsContent />
    </Suspense>
  );
}
