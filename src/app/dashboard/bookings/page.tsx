"use client";

import { useState, useEffect } from "react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { MessageThread } from "@/components/chat/message-thread";
import {
  Calendar,
  Clock,
  MapPin,
  CreditCard,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
  Bus,
  HeartPulse,
  Gem,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Booking {
  id: string;
  confirmation_code: string;
  status: string;
  payment_status: string;
  amount: number;
  created_at: string;
  special_instructions?: string;
  request: {
    service_type: string;
    pickup_address: string;
    dropoff_address: string;
    start_date: string;
    start_time?: string;
  };
  operator: {
    id: string;
    company_name: string;
    profile?: {
      id: string;
      full_name: string;
      avatar_url?: string;
    };
  };
  quote: {
    vehicle_type: string;
    vehicle_capacity?: number;
  };
}

export default function BookingsPage() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    if (user) {
      fetchBookings();
    }
  }, [user]);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/bookings?user_id=${user?.id}`);
      const data = await response.json();
      if (response.ok) {
        setBookings(data.bookings || []);
      }
    } catch (error) {
      console.error("Failed to fetch bookings:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <Badge className="bg-sky-600 hover:bg-sky-600 text-white font-bold text-[10px] h-5 px-1.5 uppercase">Confirmed</Badge>;
      case "in_progress":
        return <Badge className="bg-amber-500 hover:bg-amber-500 text-white font-bold text-[10px] h-5 px-1.5 uppercase">In Progress</Badge>;
      case "completed":
        return <Badge className="bg-green-600 hover:bg-green-600 text-white font-bold text-[10px] h-5 px-1.5 uppercase">Completed</Badge>;
      case "cancelled":
        return <Badge className="bg-red-600 hover:bg-red-600 text-white font-bold text-[10px] h-5 px-1.5 uppercase">Cancelled</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px] h-5 px-1.5 uppercase">{status}</Badge>;
    }
  };

  const getPaymentBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50 text-[10px] font-bold h-5 px-1.5 uppercase"><CheckCircle className="h-2.5 w-2.5 mr-1" />Paid</Badge>;
      case "pending":
        return <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50 text-[10px] font-bold h-5 px-1.5 uppercase"><AlertCircle className="h-2.5 w-2.5 mr-1" />Unpaid</Badge>;
      case "failed":
        return <Badge variant="outline" className="border-red-200 text-red-700 bg-red-50 text-[10px] font-bold h-5 px-1.5 uppercase"><XCircle className="h-2.5 w-2.5 mr-1" />Failed</Badge>;
      case "refunded":
        return <Badge variant="outline" className="text-neutral-500 text-[10px] font-bold h-5 px-1.5 uppercase">Refunded</Badge>;
      default:
        return null;
    }
  };

  const getServiceIcon = (type: string) => {
    switch (type) {
      case "school":
        return <Bus className="h-5 w-5 text-amber-600" />;
      case "medical":
        return <HeartPulse className="h-5 w-5 text-sky-600" />;
      case "wedding":
        return <Gem className="h-5 w-5 text-violet-600" />;
      default:
        return <Bus className="h-5 w-5" />;
    }
  };

  const activeBookings = bookings.filter(b => ["confirmed", "in_progress"].includes(b.status));
  const pastBookings = bookings.filter(b => ["completed", "cancelled"].includes(b.status));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-20 container mx-auto max-w-[1200px] px-4 sm:px-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900">My Bookings</h1>
          <Button variant="outline" size="sm" onClick={fetchBookings} className="h-9 rounded-md">
            Refresh
          </Button>
        </div>

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="mb-6 bg-white p-1 border border-neutral-200 shadow-sm rounded-md">
            <TabsTrigger value="active" className="text-sm font-medium rounded px-6">
              Active ({activeBookings.length})
            </TabsTrigger>
            <TabsTrigger value="past" className="text-sm font-medium rounded px-6">
              Past ({pastBookings.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {loading ? (
              <div className="flex justify-center py-24">
                <div className="animate-spin h-6 w-6 border-2 border-neutral-900 border-t-transparent rounded-full" />
              </div>
            ) : activeBookings.length === 0 ? (
              <Card className="border-dashed border-2 bg-white shadow-none rounded-lg">
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <div className="w-12 h-12 rounded bg-white flex items-center justify-center mb-4">
                    <Calendar className="h-6 w-6 text-neutral-400" />
                  </div>
                  <h3 className="font-semibold text-neutral-900 mb-1">No Active Bookings</h3>
                  <p className="text-neutral-500 text-sm text-center max-w-sm">
                    Your confirmed trips will appear here once you accept an operator's quote.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {activeBookings.map((booking) => (
                  <Card key={booking.id} className="shadow-sm border-neutral-200 hover:border-neutral-300 transition-colors rounded-lg bg-white overflow-hidden">
                    <CardContent className="p-0">
                      <div className="p-6">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                          <div className="flex items-start gap-4">
                            <div className={cn(
                              "h-12 w-12 rounded flex items-center justify-center shrink-0",
                              booking.request.service_type === 'school' && "bg-amber-100",
                              booking.request.service_type === 'medical' && "bg-sky-100",
                              booking.request.service_type === 'wedding' && "bg-violet-100"
                            )}>
                              {getServiceIcon(booking.request.service_type)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span className="font-mono text-xs font-bold text-neutral-400 uppercase tracking-wider">
                                  ID: {booking.confirmation_code}
                                </span>
                                {getStatusBadge(booking.status)}
                                {getPaymentBadge(booking.payment_status)}
                              </div>
                              <h3 className="text-base font-semibold text-neutral-900">
                                {booking.operator.company_name}
                              </h3>
                              <div className="flex items-center gap-4 mt-2 text-xs text-neutral-500 font-medium">
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                                  {new Date(booking.request.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                                {booking.request.start_time && (
                                  <span className="flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5 text-neutral-400" />
                                    {booking.request.start_time.slice(0, 5)}
                                  </span>
                                )}
                                <span className="flex items-center gap-1.5">
                                  <Bus className="h-3.5 w-3.5 text-neutral-400" />
                                  {booking.quote.vehicle_type}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-4">
                            <p className="text-2xl font-semibold text-neutral-900">
                              ${booking.amount.toFixed(2)}
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs font-semibold rounded-md border-neutral-200"
                                onClick={() => {
                                  setSelectedBooking(booking);
                                  setShowChat(true);
                                }}
                              >
                                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                                Chat
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="px-6 py-4 bg-white/50 border-t border-neutral-100">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm text-neutral-600">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2 h-2 rounded-full bg-neutral-300" />
                            <span className="truncate font-medium">{booking.request.pickup_address}</span>
                          </div>
                          <ChevronRight className="h-4 w-4 text-neutral-300 hidden sm:block shrink-0" />
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2 h-2 rounded-full bg-neutral-900" />
                            <span className="truncate font-medium">{booking.request.dropoff_address}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="past">
            {pastBookings.length === 0 ? (
              <Card className="border-dashed border-2 bg-white shadow-none rounded-lg">
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <div className="w-12 h-12 rounded bg-white flex items-center justify-center mb-4">
                    <CheckCircle className="h-6 w-6 text-neutral-400" />
                  </div>
                  <h3 className="font-semibold text-neutral-900 mb-1">No Past Bookings</h3>
                  <p className="text-neutral-500 text-sm">Your completed trips will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pastBookings.map((booking) => (
                  <Card key={booking.id} className={cn(
                    "shadow-sm border-neutral-200 bg-white rounded-lg overflow-hidden",
                    booking.status === "cancelled" && "opacity-60"
                  )}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="h-10 w-10 rounded bg-white flex items-center justify-center shrink-0">
                            {getServiceIcon(booking.request.service_type)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-mono text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                                {booking.confirmation_code}
                              </span>
                              {getStatusBadge(booking.status)}
                            </div>
                            <h3 className="text-sm font-semibold text-neutral-900">
                              {booking.operator.company_name}
                            </h3>
                            <p className="text-[11px] text-neutral-400 font-medium mt-1 uppercase tracking-tight">
                              {new Date(booking.request.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-neutral-900">
                            ${booking.amount.toFixed(2)}
                          </p>
                          {booking.status === "completed" && (
                            <Button variant="outline" size="sm" className="h-8 text-xs font-semibold rounded-md mt-2 border-neutral-200">
                              Review
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Chat Drawer */}
      {selectedBooking && showChat && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowChat(false)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-full flex flex-col">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="font-semibold">Chat with Operator</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowChat(false)}>
                  Close
                </Button>
              </div>
              <div className="flex-1">
                <MessageThread
                  bookingId={selectedBooking.id}
                  recipientId={selectedBooking.operator.profile?.id || selectedBooking.operator.id}
                  recipientName={selectedBooking.operator.company_name}
                  recipientAvatar={selectedBooking.operator.profile?.avatar_url}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
