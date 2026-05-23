"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Bus, HeartPulse, Gem, MapPin, Calendar, Plane } from "lucide-react";
import { ServiceSwitcher } from "./service-switcher";
import { motion, useMotionValue } from "framer-motion";
import { AIChatPanel } from "@/components/dashboard/ai-chat-panel";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { cn } from "@/lib/utils";

// Domain Sub-Forms
import { SchoolForm } from "@/domains/request/components/SchoolForm";
import { MedicalForm } from "@/domains/request/components/MedicalForm";
import { WeddingForm } from "@/domains/request/components/WeddingForm";

export function Forms({ hideRecentTrips = false }: { hideRecentTrips?: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("school");
  const [recentTrips, setRecentTrips] = useState<any[]>([]);
  const [currentStepCount, setCurrentStepCount] = useState(1);
  const totalSteps = 2;

  // Interactive Background
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  // Restore activeTab from sessionStorage on mount (if available)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const draft = sessionStorage.getItem("businto_form_draft");
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          if (parsed.activeTab) {
            setActiveTab(parsed.activeTab);
          }
        } catch (e) {}
      }
    }
  }, []);

  // Fetch recent trips for logged-in users
  useEffect(() => {
    if (user) {
      const fetchRecentTrips = async () => {
        try {
          const response = await fetch("/api/requests");
          if (response.ok) {
            const result = await response.json();
            const trips = Array.isArray(result) ? result : result.requests || [];
            setRecentTrips(trips.slice(0, 3)); // Show 3 most recent
          }
        } catch (error) {
          console.error("Error fetching recent trips:", error);
        }
      };
      fetchRecentTrips();
    }
  }, [user]);

  const stepBarColor =
    activeTab === "school"
      ? "bg-amber-500"
      : activeTab === "medical"
      ? "bg-emerald-600"
      : "bg-indigo-600";

  return (
    <section
      className="relative pt-24 pb-32 px-4 overflow-hidden bg-background selection:bg-orange-100 selection:text-orange-900"
      onMouseMove={handleMouseMove}
    >
      <div className="container mx-auto max-w-7xl relative z-10">
        {/* Headline + Hero Image — side by side */}
        {!user && (
          <div className="mb-12 md:mb-16 flex flex-col lg:flex-row items-center gap-8">
            <div className="flex flex-col items-start text-left flex-1">
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-neutral-900 mb-6 leading-tight">
                Book Your Immediate and Private Rides
              </h1>
              <p className="text-lg md:text-xl text-neutral-500 leading-relaxed">
                Coordinating school runs, medical transports, and specialized charters with a unified, intelligent marketplace.
              </p>
            </div>
            <div className="relative w-full lg:w-[45%] h-64 lg:h-80 flex-shrink-0">
              <Image
                src="/hero_image.png"
                alt="Premium vehicle"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>
        )}

        {/* 2-col grid — form (left) sizes to content, chat (right) independent */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          {/* Left Column - Form card */}
          <div>
            <div>
              <div className="bg-white rounded-lg p-7 md:p-10 border border-neutral-200 relative">
                <ServiceSwitcher activeTab={activeTab} onTabChange={(id) => {
                  setActiveTab(id);
                  // Preserve tab in sessionStorage draft context
                  if (typeof window !== "undefined") {
                    const draftStr = sessionStorage.getItem("businto_form_draft");
                    let draft: any = {};
                    if (draftStr) {
                      try { draft = JSON.parse(draftStr); } catch (e) {}
                    }
                    draft.activeTab = id;
                    sessionStorage.setItem("businto_form_draft", JSON.stringify(draft));
                  }
                }} />

                {/* Step progress bar */}
                <div className="mt-5 mb-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      Step {currentStepCount} of {totalSteps}
                    </span>
                    {currentStepCount === totalSteps && (
                      <span className="text-[10px] font-semibold text-emerald-600">Ready to submit</span>
                    )}
                  </div>
                  <div className="h-0.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${stepBarColor}`}
                      initial={false}
                      animate={{ width: `${(currentStepCount / totalSteps) * 100}%` }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                    />
                  </div>
                </div>

                <div className="mt-6 min-h-[120px]">
                  {activeTab === "school" && (
                    <SchoolForm onStepChange={setCurrentStepCount} />
                  )}
                  {activeTab === "medical" && (
                    <MedicalForm onStepChange={setCurrentStepCount} />
                  )}
                  {activeTab === "wedding" && (
                    <WeddingForm onStepChange={setCurrentStepCount} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - AI Dispatch Interface */}
          <div className="relative lg:pl-10 h-full">
            <AIChatPanel />
          </div>
        </div>

        {/* Recent Trips Section - Only for logged-in users */}
        {user && recentTrips.length > 0 && !hideRecentTrips && (
          <div className="mt-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-widest">Recent Activity</h2>
              <Link href="/trips" className="text-xs font-medium text-neutral-500 hover:text-black transition-colors flex items-center gap-1">
                View all trips <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recentTrips.map((trip) => (
                <Card key={trip.id} className="p-4 shadow-sm border border-neutral-200 hover:border-neutral-300 transition-colors duration-150 cursor-pointer">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded flex items-center justify-center shrink-0",
                        trip.service_type === "school" && "bg-amber-100 text-amber-600",
                        trip.service_type === "medical" && "bg-sky-100 text-sky-600",
                        trip.service_type === "wedding" && "bg-violet-100 text-violet-600"
                      )}>
                        {trip.service_type === "school" ? (
                          <Bus className="h-4 w-4" />
                        ) : trip.service_type === "medical" ? (
                          <HeartPulse className="h-4 w-4" />
                        ) : (
                          <Plane className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-neutral-900 truncate">
                          {trip.service_type === "school"
                            ? "School Run"
                            : trip.service_type === "medical"
                            ? "Care Ride"
                            : "Event Shuttle"}
                        </div>
                        <div className="text-[10px] text-neutral-400 font-mono">#{trip.id.slice(0, 8).toUpperCase()}</div>
                      </div>
                    </div>

                    <Badge variant="outline" className={cn(
                      "text-[10px] h-5 px-1.5 font-bold uppercase",
                      trip.status === "pending" && "border-amber-200 text-amber-600 bg-amber-50",
                      trip.status === "booked" && "border-green-200 text-green-600 bg-green-50",
                      trip.status === "completed" && "border-neutral-200 text-neutral-500 bg-white"
                    )}>
                      {trip.status}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 pt-3 border-t border-neutral-100">
                    <div className="flex items-center gap-2 text-[11px] text-neutral-600">
                      <Calendar className="h-3 w-3 text-neutral-400" />
                      <span>{new Date(trip.start_date || trip.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    </div>
                    <div className="flex items-start gap-2 text-[11px] text-neutral-900">
                      <MapPin className="h-3 w-3 text-neutral-400 mt-0.5 shrink-0" />
                      <span className="truncate font-medium">{trip.pickup_address}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}