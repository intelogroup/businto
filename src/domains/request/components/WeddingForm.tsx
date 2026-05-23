"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, AlertCircle, Loader2, CheckCircle2, Gem, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { validateTransportRequest } from "@/lib/validation";
import { splitMetadataByServiceType } from "@/lib/metadata-helpers";
import { LocationInput } from "@/components/location-input";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";

interface WeddingFormProps {
  onStepChange?: (step: number) => void;
  isImmediateInitial?: boolean;
}

export function WeddingForm({ onStepChange, isImmediateInitial = false }: WeddingFormProps) {
  const { user } = useAuth();
  const router = useRouter();

  // State
  const [guestCount, setGuestCount] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [hotelZip, setHotelZip] = useState("");
  const [hotelZipLat, setHotelZipLat] = useState<number | null>(null);
  const [hotelZipLng, setHotelZipLng] = useState<number | null>(null);
  const [venueZip, setVenueZip] = useState("");
  const [venueZipLat, setVenueZipLat] = useState<number | null>(null);
  const [venueZipLng, setVenueZipLng] = useState<number | null>(null);
  const [vehicleStyle, setVehicleStyle] = useState("");
  const [itineraryType, setItineraryType] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [weddingReturnTime, setWeddingReturnTime] = useState("");
  const [eventDurationType, setEventDurationType] = useState("");
  const [eventCategory, setEventCategory] = useState("");
  const [shuttleMode, setShuttleMode] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [alcoholAllowed, setAlcoholAllowed] = useState(false);
  const [refreshmentsProvided, setRefreshmentsProvided] = useState(false);
  const [avNeeds, setAvNeeds] = useState(false);
  const [specialDecor, setSpecialDecor] = useState(false);
  const [dayOfContactName, setDayOfContactName] = useState("");
  const [dayOfContactPhone, setDayOfContactPhone] = useState("");
  const [note, setNote] = useState("");
  const [isImmediate, setIsImmediate] = useState(isImmediateInitial);

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load draft from sessionStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const draft = sessionStorage.getItem("businto_form_draft");
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          if (parsed.activeTab === "wedding") {
            if (parsed.guestCount) setGuestCount(parsed.guestCount);
            if (parsed.eventDate) setEventDate(parsed.eventDate);
            if (parsed.hotelZip) setHotelZip(parsed.hotelZip);
            if (parsed.venueZip) setVenueZip(parsed.venueZip);
            if (parsed.vehicleStyle) setVehicleStyle(parsed.vehicleStyle);
            if (parsed.itineraryType) setItineraryType(parsed.itineraryType);
            if (parsed.pickupTime) setPickupTime(parsed.pickupTime);
            if (parsed.weddingReturnTime) setWeddingReturnTime(parsed.weddingReturnTime);
            if (parsed.eventCategory) setEventCategory(parsed.eventCategory);
            if (parsed.shuttleMode) setShuttleMode(parsed.shuttleMode);
            if (parsed.eventStartTime) setEventStartTime(parsed.eventStartTime);
            if (parsed.alcoholAllowed !== undefined) setAlcoholAllowed(parsed.alcoholAllowed);
            if (parsed.refreshmentsProvided !== undefined) setRefreshmentsProvided(parsed.refreshmentsProvided);
            if (parsed.avNeeds !== undefined) setAvNeeds(parsed.avNeeds);
            if (parsed.specialDecor !== undefined) setSpecialDecor(parsed.specialDecor);
            if (parsed.dayOfContactName) setDayOfContactName(parsed.dayOfContactName);
            if (parsed.dayOfContactPhone) setDayOfContactPhone(parsed.dayOfContactPhone);
            if (parsed.note) setNote(parsed.note);
            if (parsed.isImmediate !== undefined) setIsImmediate(parsed.isImmediate);
            if (parsed.eventDurationType) setEventDurationType(parsed.eventDurationType);
          }
        } catch (e) {
          console.error("Failed to restore form draft:", e);
        }
      }
    }
  }, []);

  // Save draft to sessionStorage whenever form changes
  useEffect(() => {
    if (typeof window !== "undefined" && !isSubmitted) {
      const existingDraftStr = sessionStorage.getItem("businto_form_draft");
      let existingDraft: any = {};
      if (existingDraftStr) {
        try {
          existingDraft = JSON.parse(existingDraftStr);
        } catch (e) {}
      }

      const draft = {
        ...existingDraft,
        activeTab: "wedding",
        guestCount,
        eventDate,
        hotelZip,
        venueZip,
        vehicleStyle,
        itineraryType,
        pickupTime,
        weddingReturnTime,
        eventCategory,
        shuttleMode,
        eventStartTime,
        alcoholAllowed,
        refreshmentsProvided,
        avNeeds,
        specialDecor,
        dayOfContactName,
        dayOfContactPhone,
        note,
        isImmediate,
        eventDurationType,
      };
      sessionStorage.setItem("businto_form_draft", JSON.stringify(draft));
    }
  }, [
    guestCount,
    eventDate,
    hotelZip,
    venueZip,
    vehicleStyle,
    itineraryType,
    pickupTime,
    weddingReturnTime,
    eventCategory,
    shuttleMode,
    eventStartTime,
    alcoholAllowed,
    refreshmentsProvided,
    avNeeds,
    specialDecor,
    dayOfContactName,
    dayOfContactPhone,
    note,
    isImmediate,
    eventDurationType,
    isSubmitted,
  ]);

  // Step Progress Calculation
  const weddingVisibleSteps = useMemo(() => {
    const step2 =
      eventCategory.length > 0 &&
      guestCount.length > 0 &&
      vehicleStyle.length > 0 &&
      hotelZip.trim().length > 0 &&
      venueZip.trim().length > 0 &&
      shuttleMode.length > 0;
    return step2 ? 2 : 1;
  }, [eventCategory, guestCount, vehicleStyle, hotelZip, venueZip, shuttleMode]);

  const effectiveWeddingSteps = isImmediate ? 2 : weddingVisibleSteps;

  useEffect(() => {
    if (onStepChange) {
      onStepChange(effectiveWeddingSteps);
    }
  }, [effectiveWeddingSteps, onStepChange]);

  const handleSubmit = async () => {
    setValidationErrors({});
    setSubmitError(null);

    if (!user) {
      router.push("/login?next=/");
      return;
    }

    const weddingMetadata = {
      event_category: eventCategory,
      guest_count: guestCount ? parseInt(guestCount) : undefined,
      vehicle_style: vehicleStyle,
      itinerary_type: itineraryType,
      shuttle_mode: shuttleMode,
      event_duration_type: eventDurationType || undefined,
      pickup_time: pickupTime,
      return_time: itineraryType === "shuttle-service" || itineraryType === "full-day" ? weddingReturnTime : undefined,
      event_start_time: eventStartTime || undefined,
      alcohol_allowed: alcoholAllowed,
      refreshments_provided: refreshmentsProvided,
      av_needs: avNeeds,
      special_decor: specialDecor,
      is_immediate: isImmediate,
      note: note || undefined,
      contact_name: user?.name || "Event Coordinator",
      contact_phone: dayOfContactPhone || "555-000-0000",
      contact_email: user?.email || "event@example.com",
      day_of_contact_name: dayOfContactName || undefined,
      day_of_contact_phone: dayOfContactPhone || undefined,
    };

    const { metadata_safe, metadata_private } = splitMetadataByServiceType("wedding", weddingMetadata);

    const requestData = {
      service_type: "wedding" as const,
      is_immediate: isImmediate,
      pickup_address: hotelZip,
      dropoff_address: venueZip,
      pickup_fuzzy: hotelZip,
      dropoff_fuzzy: venueZip,
      pickup_lat: hotelZipLat ?? undefined,
      pickup_lng: hotelZipLng ?? undefined,
      dropoff_lat: venueZipLat ?? undefined,
      dropoff_lng: venueZipLng ?? undefined,
      start_date: isImmediate ? new Date().toISOString().split("T")[0] : eventDate,
      start_time: isImmediate ? new Date().toLocaleTimeString("en-GB").slice(0, 5) : pickupTime,
      is_recurring: false,
      metadata: weddingMetadata,
      metadata_safe,
      metadata_private,
    };

    const validation = validateTransportRequest(requestData);

    if (!validation.success) {
      setValidationErrors(validation.errors);
      setSubmitError("Please fix the errors below");
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit request");
      }

      if (typeof window !== "undefined") {
        sessionStorage.removeItem("businto_form_draft");
      }

      setSubmittedData(data.request);
      setIsSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setIsSubmitted(false);
    setSubmittedData(null);
    setGuestCount("");
    setEventDate("");
    setHotelZip("");
    setVenueZip("");
    setVehicleStyle("");
    setItineraryType("");
    setPickupTime("");
    setWeddingReturnTime("");
    setEventDurationType("");
    setEventCategory("");
    setShuttleMode("");
    setEventStartTime("");
    setAlcoholAllowed(false);
    setRefreshmentsProvided(false);
    setAvNeeds(false);
    setSpecialDecor(false);
    setDayOfContactName("");
    setDayOfContactPhone("");
    setNote("");
    setIsImmediate(false);
  };

  if (isSubmitted) {
    return (
      <div className="space-y-6">
        <div className="bg-neutral-900 rounded-lg overflow-hidden text-white shadow-lg relative">
          <div className="p-8 space-y-6 relative z-10">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
                  Request ID: {submittedData?.id?.slice(0, 8).toUpperCase()}
                </div>
                <h3 className="text-2xl font-semibold tracking-tight">
                  {submittedData?.matched_operators_count === 0 ? "Under Review" : "Trip Submitted!"}
                </h3>
              </div>
              <div className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center shadow-sm",
                submittedData?.matched_operators_count === 0 ? "bg-amber-500" : "bg-green-600"
              )}>
                {submittedData?.matched_operators_count === 0 ? (
                  <AlertCircle className="h-6 w-6 text-white" />
                ) : (
                  <CheckCircle2 className="h-6 w-6 text-white" />
                )}
              </div>
            </div>
            <p className="text-neutral-400 text-sm leading-relaxed">
              {submittedData?.matched_operators_count === 0 ? (
                <>
                  We couldn't find operators matching your strict requirements (e.g., Immediate).{" "}
                  <span className="text-white block mt-2 font-medium">Our team has been notified to manually handle this specialized request.</span>
                </>
              ) : (
                "Broadcasting to our network of local operators. You'll receive quotes in your dashboard and via email shortly."
              )}
            </p>

            <div className="flex flex-wrap gap-2">
              {isImmediate && <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400 bg-red-500/10 font-bold uppercase">ASAP</Badge>}
            </div>
          </div>
          <div className="p-4 text-center border-t border-white/5 bg-violet-500/5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-violet-400">
              {submittedData?.matched_operators_count === 0 ? "Status: Manual Review Needed" : "Status: Matching Operators"}
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            className="flex-1 h-10 rounded-md font-semibold border-neutral-200 hover:bg-white"
            onClick={handleReset}
          >
            Submit Another
          </Button>
          <Button
            className="flex-1 h-10 rounded-md font-semibold bg-neutral-900 text-white hover:bg-black shadow-sm"
            onClick={() => router.push("/trips")}
          >
            View My Trips
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Row 1: Category & Basic Info */}
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
        <div className="col-span-2 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">Event Category</label>
          <Select value={eventCategory} onValueChange={setEventCategory}>
            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent className="rounded-md border-neutral-200 shadow-lg">
              <SelectItem value="wedding" className="text-sm font-medium">Wedding</SelectItem>
              <SelectItem value="corporate" className="text-sm font-medium">Corporate Event</SelectItem>
              <SelectItem value="party" className="text-sm font-medium">Private Party</SelectItem>
              <SelectItem value="other" className="text-sm font-medium">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-1 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">Guests</label>
          <Input
            type="number"
            placeholder="0"
            min="1"
            value={guestCount}
            onChange={(e) => setGuestCount(e.target.value)}
            className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400"
          />
        </div>
        <div className="col-span-1 sm:col-span-1 md:col-span-3 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">Vehicle Preference</label>
          <Select value={vehicleStyle} onValueChange={setVehicleStyle}>
            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent className="rounded-md border-neutral-200 shadow-lg">
              <SelectItem value="school-bus" className="text-sm font-medium">School Bus (Budget Hack)</SelectItem>
              <SelectItem value="shuttle" className="text-sm font-medium">Executive Shuttle/Sprinter</SelectItem>
              <SelectItem value="coach" className="text-sm font-medium">Motor Coach (55+ Pax)</SelectItem>
              <SelectItem value="limo" className="text-sm font-medium">Limousine / Luxury Van</SelectItem>
              <SelectItem value="party-bus" className="text-sm font-medium">Party Bus</SelectItem>
              <SelectItem value="vintage" className="text-sm font-medium">Vintage / Classic</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: Locations */}
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
        <div className="col-span-1 min-[400px]:col-span-2 sm:col-span-3 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">Pickup (e.g. Hotel)</label>
          <LocationInput
            placeholder="Hotel or starting point..."
            value={hotelZip}
            onSelect={(addr, lat, lng) => {
              setHotelZip(addr);
              setHotelZipLat(lat ?? null);
              setHotelZipLng(lng ?? null);
            }}
            className="h-10 rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150"
          />
        </div>
        <div className="col-span-1 min-[400px]:col-span-2 sm:col-span-3 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">Venue Location</label>
          <LocationInput
            placeholder="Event venue..."
            value={venueZip}
            onSelect={(addr, lat, lng) => {
              setVenueZip(addr);
              setVenueZipLat(lat ?? null);
              setVenueZipLng(lng ?? null);
            }}
            className="h-10 rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150"
          />
        </div>
      </div>

      {/* Row 3a: Logistics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">Shuttle Mode</label>
          <Select value={shuttleMode} onValueChange={setShuttleMode}>
            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent className="rounded-md border-neutral-200 shadow-lg">
              <SelectItem value="single-trip" className="text-sm font-medium">Single Trip (Drop & Leave)</SelectItem>
              <SelectItem value="continuous" className="text-sm font-medium">Continuous Loop (2-3 hrs)</SelectItem>
              <SelectItem value="end-of-night" className="text-sm font-medium">End-of-Night Return Trip</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Section: Schedule */}
      <AnimatePresence>
        {effectiveWeddingSteps >= 2 && (
          <motion.div
            key="wedding-step2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">Itinerary Type</label>
                <Select value={itineraryType} onValueChange={setItineraryType}>
                  <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-md border-neutral-200 shadow-lg">
                    <SelectItem value="hotel-to-venue" className="text-sm font-medium">Hotel → Venue</SelectItem>
                    <SelectItem value="venue-to-hotel" className="text-sm font-medium">Venue → Hotel</SelectItem>
                    <SelectItem value="shuttle-service" className="text-sm font-medium">Shuttle Loop</SelectItem>
                    <SelectItem value="full-day" className="text-sm font-medium">Full Day Charter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(itineraryType === "shuttle-service" || itineraryType === "full-day") && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-500 ml-1">Return Time</label>
                  <Input
                    type="time"
                    value={weddingReturnTime}
                    onChange={(e) => setWeddingReturnTime(e.target.value)}
                    className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">Event Date</label>
                <Input
                  type="date"
                  value={isImmediate ? new Date().toISOString().split("T")[0] : eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  disabled={isImmediate}
                  className={cn(
                    "h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium",
                    isImmediate && "opacity-50 cursor-not-allowed bg-white shadow-none border-neutral-100"
                  )}
                />
              </div>
            </div>

            {/* Row 3b: Departs + Ceremony */}
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="col-span-1 space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">Departs</label>
                <Input
                  type="time"
                  value={isImmediate ? new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  disabled={isImmediate}
                  className={cn(
                    "h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium",
                    isImmediate && "opacity-50 cursor-not-allowed bg-white shadow-none border-neutral-100"
                  )}
                />
              </div>
              <div className="col-span-1 space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">Ceremony</label>
                <Input
                  type="time"
                  value={isImmediate ? new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : eventStartTime}
                  onChange={(e) => setEventStartTime(e.target.value)}
                  disabled={isImmediate}
                  className={cn(
                    "h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium",
                    isImmediate && "opacity-50 cursor-not-allowed bg-white shadow-none border-neutral-100"
                  )}
                />
              </div>
            </div>

            {/* Coordinator & Extras */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">Planner Name</label>
                <Input
                  placeholder="Name..."
                  value={dayOfContactName}
                  onChange={(e) => setDayOfContactName(e.target.value)}
                  className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400"
                />
              </div>
              <div className="col-span-1 space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">Contact</label>
                <Input
                  placeholder="555-000-0000"
                  value={dayOfContactPhone}
                  onChange={(e) => setDayOfContactPhone(e.target.value)}
                  className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">Duration/Type</label>
                <Select value={eventDurationType} onValueChange={setEventDurationType}>
                  <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-md border-neutral-200 shadow-lg">
                    <SelectItem value="single-day" className="text-sm font-medium">Single Day</SelectItem>
                    <SelectItem value="multi-day" className="text-sm font-medium">Multi-Day Event</SelectItem>
                    <SelectItem value="weekend" className="text-sm font-medium">Full Weekend</SelectItem>
                    <SelectItem value="custom" className="text-sm font-medium">Custom Dates</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 5: Amenities Toggles */}
            <div className="flex flex-wrap gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={alcoholAllowed}
                  onChange={(e) => setAlcoholAllowed(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-0"
                />
                <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">Alcohol OK</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={refreshmentsProvided}
                  onChange={(e) => setRefreshmentsProvided(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-0"
                />
                <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">Refreshments</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={avNeeds}
                  onChange={(e) => setAvNeeds(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-0"
                />
                <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">Bluetooth/AUX</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={specialDecor}
                  onChange={(e) => setSpecialDecor(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-0"
                />
                <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">Decorations</span>
              </label>
              <label className={cn(
                "flex items-center gap-2 cursor-pointer group px-3 py-1.5 rounded-md border transition-colors duration-150",
                isImmediate ? "bg-violet-50 border-violet-200" : "border-neutral-200 hover:bg-white"
              )}>
                <input
                  type="checkbox"
                  checked={isImmediate}
                  onChange={(e) => setIsImmediate(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500"
                />
                <span className={cn(
                  "text-sm font-semibold transition-colors",
                  isImmediate ? "text-violet-700" : "text-neutral-500 group-hover:text-neutral-900"
                )}>ASAP / Immediate Request</span>
              </label>
            </div>

            {/* Row 4: Note */}
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-medium text-neutral-500 ml-1">
                Additional Note
                <span className="ml-1 text-[10px] font-normal text-neutral-400 italic">(optional)</span>
              </label>
              <Input
                type="text"
                placeholder="Any special requirements or instructions..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit Section */}
      <div className="mt-10">
        {/* Error Display */}
        {(submitError || Object.keys(validationErrors).length > 0) && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-900 mb-1">
                  {submitError || "Please fix the following errors:"}
                </p>
                {Object.keys(validationErrors).length > 0 && (
                  <ul className="text-sm text-red-700 space-y-0.5 ml-4 list-disc">
                    {Object.entries(validationErrors).slice(0, 3).map(([key, message]) => (
                      <li key={key}>{message}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          size="lg"
          className="w-full h-10 rounded-md text-white transition-colors duration-150 shadow-sm font-semibold text-base bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex items-center justify-center gap-3">
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                Check Shuttle Prices ($1.99)
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </span>
        </Button>
      </div>
    </div>
  );
}
