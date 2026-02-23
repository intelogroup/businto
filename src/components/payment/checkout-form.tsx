"use client";

import { useState } from "react";
import {
  PaymentElement,
  useStripe,
  useElements
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, ShieldCheck } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";

interface CheckoutFormProps {
  routingFee: number;
  operatorQuote: number;
  bookingId: string;
  confirmationCode: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function CheckoutForm({
  routingFee,
  operatorQuote,
  bookingId,
  confirmationCode,
  onSuccess,
  onCancel
}: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { addNotification } = useNotifications();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/dashboard?booking=${bookingId}&payment=success`
      },
      redirect: "if_required"
    });

    if (submitError) {
      if (submitError.type === "card_error" || submitError.type === "validation_error") {
        setError(submitError.message || "Payment failed");
      } else {
        setError("An unexpected error occurred");
      }
      setIsLoading(false);
    } else {
      addNotification({
        title: "Payment Successful!",
        message: `Your booking ${confirmationCode} is confirmed.`,
        type: "success"
      });
      onSuccess?.();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
        <p className="text-sm font-medium text-amber-900">⚠️ Payment Notice</p>
        <p className="text-xs text-amber-800">
          You are paying a <strong>${routingFee.toFixed(2)} platform routing fee</strong> to connect with the operator.
          The trip cost of <strong>${operatorQuote.toFixed(2)}</strong> will be paid directly to the operator.
        </p>
      </div>

      <div className="bg-neutral-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-neutral-600">Booking</span>
          <span className="font-mono text-sm font-semibold">{confirmationCode}</span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-neutral-900">Platform Routing Fee</span>
          <span className="text-xl font-bold text-indigo-600">${routingFee.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-neutral-200">
          <span className="text-xs text-neutral-500">Trip Cost (pay operator directly)</span>
          <span className="text-sm text-neutral-600">${operatorQuote.toFixed(2)}</span>
        </div>
      </div>

      <PaymentElement
        options={{
          layout: "tabs"
        }}
      />

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <ShieldCheck className="h-4 w-4" />
        <span>Your payment is secured with 256-bit encryption</span>
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={!stripe || isLoading}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4 mr-2" />
              Pay Routing Fee ${routingFee.toFixed(2)}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
