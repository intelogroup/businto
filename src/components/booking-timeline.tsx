"use client";

import { CheckCircle2, Circle, Clock, FileText, Handshake, Truck, Flag } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineStep {
  label: string;
  description: string;
  icon: React.ReactNode;
  status: "completed" | "current" | "upcoming";
  timestamp?: string;
}

interface BookingTimelineProps {
  /** Transport request status */
  requestStatus: string;
  /** Number of quotes received */
  quoteCount: number;
  /** Accepted operator name (if any) */
  operatorName?: string;
  /** Booking confirmation code (if booked) */
  confirmationCode?: string;
  /** When the request was created */
  createdAt?: string;
}

function resolveStepStatus(
  stepIndex: number,
  currentStepIndex: number
): "completed" | "current" | "upcoming" {
  if (stepIndex < currentStepIndex) return "completed";
  if (stepIndex === currentStepIndex) return "current";
  return "upcoming";
}

function getCurrentStepIndex(requestStatus: string, quoteCount: number): number {
  switch (requestStatus) {
    case "pending":
      return 0;
    case "quoted":
      return 1;
    case "booked":
    case "quote_accepted":
      return 2;
    case "in-progress":
    case "in_progress":
      return 3;
    case "completed":
      return 4;
    case "cancelled":
      return -1; // Special case
    default:
      return 0;
  }
}

export function BookingTimeline({
  requestStatus,
  quoteCount,
  operatorName,
  confirmationCode,
  createdAt,
}: BookingTimelineProps) {
  const currentStep = getCurrentStepIndex(requestStatus, quoteCount);
  const isCancelled = requestStatus === "cancelled";

  const steps: TimelineStep[] = [
    {
      label: "Request Submitted",
      description: createdAt
        ? `Submitted ${new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
        : "Your request has been sent to matching operators",
      icon: <FileText className="h-4 w-4" />,
      status: isCancelled ? "completed" : resolveStepStatus(0, currentStep),
    },
    {
      label: "Quotes Received",
      description:
        quoteCount > 0
          ? `${quoteCount} quote${quoteCount > 1 ? "s" : ""} received — review and compare below`
          : "Waiting for operators to respond with pricing",
      icon: <Clock className="h-4 w-4" />,
      status: isCancelled ? "completed" : resolveStepStatus(1, currentStep),
    },
    {
      label: "Quote Accepted",
      description: operatorName
        ? `Booked with ${operatorName}${confirmationCode ? ` · #${confirmationCode}` : ""}`
        : "Choose an operator quote to lock in your trip",
      icon: <Handshake className="h-4 w-4" />,
      status: isCancelled ? "upcoming" : resolveStepStatus(2, currentStep),
    },
    {
      label: "En Route",
      description: "Your operator is on the way to the pickup location",
      icon: <Truck className="h-4 w-4" />,
      status: isCancelled ? "upcoming" : resolveStepStatus(3, currentStep),
    },
    {
      label: "Trip Completed",
      description: "Trip finished successfully — you can leave a review",
      icon: <Flag className="h-4 w-4" />,
      status: isCancelled ? "upcoming" : resolveStepStatus(4, currentStep),
    },
  ];

  if (isCancelled) {
    return (
      <div className="bg-white rounded-lg p-6 shadow-sm border border-neutral-200">
        <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wider mb-4">
          Trip Status
        </h3>
        <div className="flex items-center gap-3 p-4 rounded-md bg-red-50 border border-red-100">
          <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <Circle className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-700">Trip Cancelled</p>
            <p className="text-xs text-red-500 mt-0.5">
              This trip has been cancelled. No further action is needed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-neutral-200">
      <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wider mb-6">
        Trip Status
      </h3>
      <div className="relative">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          return (
            <div key={step.label} className="flex gap-4 relative">
              {/* Vertical line connector */}
              {!isLast && (
                <div
                  className={cn(
                    "absolute left-[15px] top-[32px] w-[2px] h-[calc(100%-8px)]",
                    step.status === "completed" ? "bg-neutral-900" : "bg-neutral-200"
                  )}
                />
              )}

              {/* Icon circle */}
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0 z-10 transition-colors",
                  step.status === "completed" && "bg-neutral-900 text-white",
                  step.status === "current" && "bg-neutral-900 text-white ring-4 ring-neutral-100",
                  step.status === "upcoming" && "bg-neutral-100 text-neutral-400"
                )}
              >
                {step.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  step.icon
                )}
              </div>

              {/* Text */}
              <div className={cn("pb-8", isLast && "pb-0")}>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    step.status === "upcoming" ? "text-neutral-400" : "text-neutral-900"
                  )}
                >
                  {step.label}
                </p>
                <p
                  className={cn(
                    "text-xs mt-0.5",
                    step.status === "upcoming" ? "text-neutral-300" : "text-neutral-500"
                  )}
                >
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
