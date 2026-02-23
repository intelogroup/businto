"use client";

import { useState, useEffect } from "react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { PaymentModal } from "@/components/payment/payment-modal";
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
    full_name: string;
    company_name?: string;
    avatar_url?: string;
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
  const [showPayment, setShowPayment] = useState(false);
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
        return <Badge className="bg-blue-100 text-blue-700">Confirmed</Badge>;
      case "in_progress":
        return <Badge className="bg-amber-100 text-amber-700">In Progress</Badge>;
      case "completed":
        return <Badge className="bg-green-100 text-green-700">Completed</Badge>;
      case "cancelled":
        return <Badge className="bg-red-100 text-red-700">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
      case "pending":
        return <Badge className="bg-amber-100 text-amber-700"><AlertCircle className="h-3 w-3 mr-1" />Pending</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-700"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case "refunded":
        return <Badge className="bg-neutral-100 text-neutral-700">Refunded</Badge>;
      default:
        return null;
    }
  };

  const getServiceIcon = (type: string) => {
    switch (type) {
      case "school":
        return <Bus className="h-5 w-5 text-amber-500" />;
      case "medical":
        return <HeartPulse className="h-5 w-5 text-sky-500" />;
      case "wedding":
        return <Gem className="h-5 w-5 text-indigo-500" />;
      default:
        return <Bus className="h-5 w-5" />;
    }
  };

  const activeBookings = bookings.filter(b => ["confirmed", "in_progress"].includes(b.status));
  const pastBookings = bookings.filter(b => ["completed", "cancelled"].includes(b.status));

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <Navbar />

      <main className="pt-32 pb-20 container mx-auto max-w-[1200px] px-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-neutral-900">My Bookings</h1>
          <Button variant="outline" onClick={fetchBookings}>
            Refresh
          </Button>
        </div>

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="active">
              Active ({activeBookings.length})
            </TabsTrigger>
            <TabsTrigger value="past">
              Past ({pastBookings.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
              </div>
            ) : activeBookings.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="h-12 w-12 text-neutral-300 mb-4" />
                  <h3 className="font-semibold text-neutral-900 mb-2">No Active Bookings</h3>
                  <p className="text-neutral-500 text-sm text-center max-w-sm">
                    When you accept a quote, your booking will appear here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {activeBookings.map((booking) => (
                  <Card key={booking.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="h-12 w-12 rounded-lg bg-neutral-100 flex items-center justify-center">
                            {getServiceIcon(booking.request.service_type)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-sm font-semibold text-neutral-900">
                                {booking.confirmation_code}
                              </span>
                              {getStatusBadge(booking.status)}
                              {getPaymentBadge(booking.payment_status)}
                            </div>
                            <p className="text-sm text-neutral-600 mb-2">
                              {booking.operator.company_name || booking.operator.full_name}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-neutral-500">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(booking.request.start_date).toLocaleDateString()}
                              </span>
                              {booking.request.start_time && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {booking.request.start_time}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {booking.quote.vehicle_type}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-xl font-bold text-neutral-900">
                            ${booking.amount.toFixed(2)}
                          </p>
                          <div className="flex gap-2 mt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedBooking(booking);
                                setShowChat(true);
                              }}
                            >
                              <MessageSquare className="h-4 w-4 mr-1" />
                              Chat
                            </Button>
                            {booking.payment_status === "pending" && (
                              <Button
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-700"
                                onClick={() => {
                                  setSelectedBooking(booking);
                                  setShowPayment(true);
                                }}
                              >
                                <CreditCard className="h-4 w-4 mr-1" />
                                Pay
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-neutral-100">
                        <div className="flex items-center gap-2 text-sm text-neutral-600">
                          <MapPin className="h-4 w-4 text-green-500" />
                          <span>{booking.request.pickup_address}</span>
                          <ChevronRight className="h-4 w-4 text-neutral-300" />
                          <MapPin className="h-4 w-4 text-red-500" />
                          <span>{booking.request.dropoff_address}</span>
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
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle className="h-12 w-12 text-neutral-300 mb-4" />
                  <h3 className="font-semibold text-neutral-900 mb-2">No Past Bookings</h3>
                  <p className="text-neutral-500 text-sm">Your completed trips will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pastBookings.map((booking) => (
                  <Card key={booking.id} className={cn(
                    booking.status === "cancelled" && "opacity-60"
                  )}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="h-12 w-12 rounded-lg bg-neutral-100 flex items-center justify-center">
                            {getServiceIcon(booking.request.service_type)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-sm font-semibold text-neutral-900">
                                {booking.confirmation_code}
                              </span>
                              {getStatusBadge(booking.status)}
                            </div>
                            <p className="text-sm text-neutral-600">
                              {booking.operator.company_name || booking.operator.full_name}
                            </p>
                            <p className="text-xs text-neutral-400 mt-1">
                              {new Date(booking.request.start_date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-neutral-900">
                            ${booking.amount.toFixed(2)}
                          </p>
                          {booking.status === "completed" && (
                            <Button variant="outline" size="sm" className="mt-2">
                              Leave Review
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

      {/* Payment Modal */}
      {selectedBooking && (
        <PaymentModal
          open={showPayment}
          onOpenChange={setShowPayment}
          bookingId={selectedBooking.id}
          amount={selectedBooking.amount}
          confirmationCode={selectedBooking.confirmation_code}
          onSuccess={() => {
            fetchBookings();
            addNotification({
              title: "Payment Complete",
              message: "Your booking is now confirmed!",
              type: "success"
            });
          }}
        />
      )}

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
                  recipientId={selectedBooking.operator.id}
                  recipientName={selectedBooking.operator.company_name || selectedBooking.operator.full_name}
                  recipientAvatar={selectedBooking.operator.avatar_url}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
