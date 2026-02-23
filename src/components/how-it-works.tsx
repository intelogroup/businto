"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { School, HeartPulse, CalendarDays, ArrowRight } from "lucide-react";
import { FormTrigger } from "@/components/forms/form-trigger";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export function HowItWorks() {
  const { user } = useAuth();

  // Don't show this section if user is logged in
  if (user) {
    return null;
  }

  return (
    <section className="py-32 px-6 bg-white relative overflow-hidden">
      <div className="absolute inset-0 bg-noise opacity-[0.02] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] bg-neutral-50 rounded-full blur-[140px] pointer-events-none" />

      <div className="container mx-auto max-w-7xl relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-end mb-24 gap-12">
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-6xl font-semibold tracking-tighter text-neutral-900 mb-8 leading-[1.1]">
              Tailored for every <br />
              <span className="text-neutral-400">transportation need.</span>
            </h2>
            <p className="text-neutral-500 text-lg md:text-xl font-medium leading-relaxed max-w-lg">
              Simple, transparent, and built specifically for your community requirements.
            </p>
          </div>
          <button className="hidden md:flex items-center text-sm font-bold text-neutral-900 hover:text-orange-600 transition-colors duration-150">
            View all services <ArrowRight className="ml-2 w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Medical / NEMT Card */}
          <Card className="group relative overflow-hidden border border-black/[0.03] bg-white shadow-sm transition-colors duration-150 rounded-lg flex flex-col">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-green-500" />

            <CardHeader className="pb-4 pt-10 px-10">
              <div className="flex items-center justify-between mb-8">
                <div className="p-4 rounded-lg bg-green-50 text-green-600 transition-colors duration-150">
                  <HeartPulse className="h-7 w-7" />
                </div>
                <Badge variant="secondary" className="bg-green-50 text-green-700 font-bold px-4 py-1.5 text-[0.65rem] uppercase tracking-[0.15em] border-0 rounded-full">
                  MEDICAL
                </Badge>
              </div>
              <CardTitle className="text-3xl font-semibold tracking-tight text-neutral-900 mb-3">Hospital Discharge</CardTitle>
            </CardHeader>
            <CardContent className="px-10 pb-10 flex-1 flex flex-col">
              <p className="text-neutral-500 mb-10 leading-relaxed text-base font-medium">
                Find wheelchair vans instantly for hospital discharge or dialysis. Professional care at your fingertips.
              </p>
              <div className="mt-auto">
                <FormTrigger type="medical">
                  <Button className="w-full h-10 rounded-md bg-green-500 hover:bg-green-600 text-white font-semibold transition-colors duration-150 shadow-sm">
                    Find Transport
                  </Button>
                </FormTrigger>
              </div>
            </CardContent>
          </Card>

          {/* School Card */}
          <Card className="group relative overflow-hidden border border-black/[0.03] bg-white shadow-sm transition-colors duration-150 rounded-lg flex flex-col">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-orange-500" />

            <CardHeader className="pb-4 pt-10 px-10">
              <div className="flex items-center justify-between mb-8">
                <div className="p-4 rounded-lg bg-orange-50 text-orange-600 transition-colors duration-150">
                  <School className="h-7 w-7" />
                </div>
                <Badge variant="secondary" className="bg-orange-50 text-orange-700 font-bold px-4 py-1.5 text-[0.65rem] uppercase tracking-[0.15em] border-0 rounded-full">
                  EDUCATION
                </Badge>
              </div>
              <CardTitle className="text-3xl font-semibold tracking-tight text-neutral-900 mb-3">School Commutes</CardTitle>
            </CardHeader>
            <CardContent className="px-10 pb-10 flex-1 flex flex-col">
              <p className="text-neutral-500 mb-10 leading-relaxed text-base font-medium">
                Pool demand with neighbors for daily AM/PM school routes. Safe, reliable, and community-driven.
              </p>
              <div className="mt-auto">
                <FormTrigger type="school">
                  <Button className="w-full h-10 rounded-md bg-orange-500 hover:bg-orange-600 text-white font-semibold transition-colors duration-150 shadow-sm">
                    Find Ride
                  </Button>
                </FormTrigger>
              </div>
            </CardContent>
          </Card>

          {/* Event Card */}
          <Card className="group relative overflow-hidden border border-black/[0.03] bg-white shadow-sm transition-colors duration-150 rounded-lg flex flex-col">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-violet-500" />

            <CardHeader className="pb-4 pt-10 px-10">
              <div className="flex items-center justify-between mb-8">
                <div className="p-4 rounded-lg bg-violet-50 text-violet-600 transition-colors duration-150">
                  <CalendarDays className="h-7 w-7" />
                </div>
                <Badge variant="secondary" className="bg-violet-50 text-violet-700 font-bold px-4 py-1.5 text-[0.65rem] uppercase tracking-[0.15em] border-0 rounded-full">
                  CHARTERS
                </Badge>
              </div>
              <CardTitle className="text-3xl font-semibold tracking-tight text-neutral-900 mb-3">Event Shuttles</CardTitle>
            </CardHeader>
            <CardContent className="px-10 pb-10 flex-1 flex flex-col">
              <p className="text-neutral-500 mb-10 leading-relaxed text-base font-medium">
                Direct quotes for events, camps, and away games. No brokers, just direct access to operators.
              </p>
              <div className="mt-auto">
                <FormTrigger type="wedding">
                  <Button className="w-full h-10 rounded-md bg-violet-500 hover:bg-violet-600 text-white font-semibold transition-colors duration-150 shadow-sm">
                    Request Quote
                  </Button>
                </FormTrigger>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 text-center md:hidden">
          <button className="inline-flex items-center text-sm font-bold text-neutral-900 hover:text-orange-600 transition-colors">
            View all services <ArrowRight className="ml-2 w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
}