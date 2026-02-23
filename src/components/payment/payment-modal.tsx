"use client";

import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { CheckoutForm } from "./checkout-form";
import { Loader2 } from "lucide-react";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  amount: number; // operator quote amount (shown for reference only)
  confirmationCode: string;
  onSuccess?: () => void;
}

export function PaymentModal({
  open,
  onOpenChange,
  bookingId,
  amount,
  confirmationCode,
  onSuccess
}: PaymentModalProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routingFee, setRoutingFee] = useState<number>(1.99);

  useEffect(() => {
    if (open && bookingId && amount) {
      setLoading(true);
      setError(null);

      fetch("/api/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId })
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
          } else {
            setClientSecret(data.clientSecret);
            setRoutingFee(data.routingFee || 1.99);
          }
        })
        .catch((err) => {
          setError("Failed to initialize payment");
          console.error(err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open, bookingId, amount]);

  const handleSuccess = () => {
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Platform Routing Fee</DialogTitle>
          <DialogDescription>
            This ${routingFee.toFixed(2)} fee connects you with the operator. You will pay the operator ${amount.toFixed(2)} separately for the trip.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-600 text-sm p-4 rounded-lg">
            {error}
          </div>
        ) : clientSecret ? (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "stripe",
                variables: {
                  colorPrimary: "#4f46e5"
                }
              }
            }}
          >
            <CheckoutForm
              routingFee={routingFee}
              operatorQuote={amount}
              bookingId={bookingId}
              confirmationCode={confirmationCode}
              onSuccess={handleSuccess}
              onCancel={() => onOpenChange(false)}
            />
          </Elements>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
