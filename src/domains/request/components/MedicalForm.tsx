"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, AlertCircle, Loader2, CheckCircle2, HeartPulse, Calendar as CalendarIcon, MapPin } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { validateTransportRequest } from "@/lib/validation";
import { splitMetadataByServiceType } from "@/lib/metadata-helpers";
import { LocationInput } from "@/components/location-input";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";

interface MedicalFormProps {
  onStepChange?: (step: number) => void;
  isImmediateInitial?: boolean;
}

export function MedicalForm({ onStepChange, isImmediateInitial = false }: MedicalFormProps) {
  const { user } = useAuth();
  const router = useRouter();

  // State
  const [medicalContactName, setMedicalContactName] = useState("");
  const [medicalContactPhone, setMedicalContactPhone] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [pickupLocationLat, setPickupLocationLat] = useState<number | null>(null);
  const [pickupLocationLng, setPickupLocationLng] = useState<number | null>(null);
  const [dropoffLocation, setDropoffLocation] = useState("");
  const [dropoffLocationLat, setDropoffLocationLat] = useState<number | null>(null);
  const [dropoffLocationLng, setDropoffLocationLng] = useState<number | null>(null);
  const [mobilityLevel, setMobilityLevel] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [serviceLevel, setServiceLevel] = useState("");
  const [tripType, setTripType] = useState("");
  const [medicalDurationType, setMedicalDurationType] = useState("");
  const [medicalCustomDates, setMedicalCustomDates] = useState<Date[]>([]);
  const [medicalStartDate, setMedicalStartDate] = useState("");
  const [medicalEndDate, setMedicalEndDate] = useState("");
  const [oxygenUse, setOxygenUse] = useState(false);
  const [isBariatric, setIsBariatric] = useState(false);
  const [facilityDetails, setFacilityDetails] = useState("");
  const [stairFactor, setStairFactor] = useState("none");
  const [returnStatus, setReturnStatus] = useState("");
  const [medicalReturnTime, setMedicalReturnTime] = useState("");
  const [additionalPassengers, setAdditionalPassengers] = useState("");
  const [serviceAnimal, setServiceAnimal] = useState(false);
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
          if (parsed.activeTab === "medical") {
            if (parsed.pickupLocation) setPickupLocation(parsed.pickupLocation);
            if (parsed.dropoffLocation) setDropoffLocation(parsed.dropoffLocation);
            if (parsed.mobilityLevel) setMobilityLevel(parsed.mobilityLevel);
            if (parsed.appointmentDate) setAppointmentDate(parsed.appointmentDate);
            if (parsed.appointmentTime) setAppointmentTime(parsed.appointmentTime);
            if (parsed.serviceLevel) setServiceLevel(parsed.serviceLevel);
            if (parsed.tripType) setTripType(parsed.tripType);
            if (parsed.oxygenUse !== undefined) setOxygenUse(parsed.oxygenUse);
            if (parsed.isBariatric !== undefined) setIsBariatric(parsed.isBariatric);
            if (parsed.facilityDetails) setFacilityDetails(parsed.facilityDetails);
            if (parsed.stairFactor) setStairFactor(parsed.stairFactor);
            if (parsed.returnStatus) setReturnStatus(parsed.returnStatus);
            if (parsed.medicalReturnTime) setMedicalReturnTime(parsed.medicalReturnTime);
            if (parsed.additionalPassengers) setAdditionalPassengers(parsed.additionalPassengers);
            if (parsed.serviceAnimal !== undefined) setServiceAnimal(parsed.serviceAnimal);
            if (parsed.medicalContactName) setMedicalContactName(parsed.medicalContactName);
            if (parsed.medicalContactPhone) setMedicalContactPhone(parsed.medicalContactPhone);
            if (parsed.note) setNote(parsed.note);
            if (parsed.isImmediate !== undefined) setIsImmediate(parsed.isImmediate);
            if (parsed.medicalStartDate) setMedicalStartDate(parsed.medicalStartDate);
            if (parsed.medicalEndDate) setMedicalEndDate(parsed.medicalEndDate);
            if (parsed.medicalDurationType) setMedicalDurationType(parsed.medicalDurationType);
            if (parsed.eventCustomDates) {
              setMedicalCustomDates(parsed.eventCustomDates.map((d: string) => new Date(d)));
            }
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
        activeTab: "medical",
        pickupLocation,
        dropoffLocation,
        mobilityLevel,
        appointmentDate,
        appointmentTime,
        serviceLevel,
        tripType,
        oxygenUse,
        isBariatric,
        facilityDetails,
        stairFactor,
        returnStatus,
        medicalReturnTime,
        additionalPassengers,
        serviceAnimal,
        medicalContactName,
        medicalContactPhone,
        note,
        isImmediate,
        medicalStartDate,
        medicalEndDate,
        medicalDurationType,
        eventCustomDates: medicalCustomDates.map((d) => d.toISOString()),
      };
      sessionStorage.setItem("businto_form_draft", JSON.stringify(draft));
    }
  }, [
    pickupLocation,
    dropoffLocation,
    mobilityLevel,
    appointmentDate,
    appointmentTime,
    serviceLevel,
    tripType,
    oxygenUse,
    isBariatric,
    facilityDetails,
    stairFactor,
    returnStatus,
    medicalReturnTime,
    additionalPassengers,
    serviceAnimal,
    medicalContactName,
    medicalContactPhone,
    note,
    isImmediate,
    medicalStartDate,
    medicalEndDate,
    medicalDurationType,
    medicalCustomDates,
    isSubmitted,
  ]);

  // Step Progress Calculation
  const medicalVisibleSteps = useMemo(() => {
    const step2 =
      pickupLocation.trim().length > 0 &&
      dropoffLocation.trim().length > 0 &&
      mobilityLevel.length > 0 &&
      serviceLevel.length > 0;
    return step2 ? 2 : 1;
  }, [pickupLocation, dropoffLocation, mobilityLevel, serviceLevel]);

  const effectiveMedicalSteps = isImmediate ? 2 : medicalVisibleSteps;

  useEffect(() => {
    if (onStepChange) {
      onStepChange(effectiveMedicalSteps);
    }
  }, [effectiveMedicalSteps, onStepChange]);

  const handleSubmit = async () => {
    setValidationErrors({});
    setSubmitError(null);

    if (!user) {
      router.push("/login?next=/");
      return;
    }

    const isRecurringMedical = medicalDurationType === "recurring";
    const medicalMetadata = {
      mobility_level: mobilityLevel,
      service_level: serviceLevel,
      trip_type: tripType,
      appointment_time: appointmentTime,
      oxygen_use: oxygenUse,
      is_bariatric: isBariatric,
      facility_details: facilityDetails || undefined,
      stair_factor: stairFactor,
      return_status: tripType === "round-trip" ? returnStatus : undefined,
      return_time: tripType === "round-trip" ? medicalReturnTime : undefined,
      additional_passengers: additionalPassengers ? parseInt(additionalPassengers) : undefined,
      service_animal: serviceAnimal,
      medical_start_date: isRecurringMedical ? medicalStartDate : appointmentDate,
      medical_end_date: isRecurringMedical ? medicalEndDate || undefined : undefined,
      is_immediate: isImmediate,
      note: note || undefined,
      patient_name: user?.name || "Patient",
      contact_name: medicalContactName || user?.name || undefined,
      contact_phone: medicalContactPhone || undefined,
      contact_email: user?.email,
    };

    const { metadata_safe, metadata_private } = splitMetadataByServiceType("medical", medicalMetadata);

    const requestData = {
      service_type: "medical" as const,
      is_immediate: isImmediate,
      pickup_address: pickupLocation,
      dropoff_address: dropoffLocation,
      pickup_fuzzy: pickupLocation,
      dropoff_fuzzy: dropoffLocation,
      pickup_lat: pickupLocationLat ?? undefined,
      pickup_lng: pickupLocationLng ?? undefined,
      dropoff_lat: dropoffLocationLat ?? undefined,
      dropoff_lng: dropoffLocationLng ?? undefined,
      start_date: isImmediate
        ? new Date().toISOString().split("T")[0]
        : isRecurringMedical
        ? medicalStartDate
        : appointmentDate,
      end_date: isRecurringMedical ? medicalEndDate || undefined : undefined,
      start_time: isImmediate ? new Date().toLocaleTimeString("en-GB").slice(0, 5) : appointmentTime,
      is_recurring: isRecurringMedical,
      recurrence_pattern: medicalDurationType,
      metadata: medicalMetadata,
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
    setPickupLocation("");
    setDropoffLocation("");
    setMobilityLevel("");
    setAppointmentDate("");
    setAppointmentTime("");
    setServiceLevel("");
    setTripType("");
    setMedicalDurationType("");
    setMedicalCustomDates([]);
    setMedicalStartDate("");
    setMedicalEndDate("");
    setOxygenUse(false);
    setIsBariatric(false);
    setFacilityDetails("");
    setStairFactor("none");
    setReturnStatus("");
    setMedicalReturnTime("");
    setAdditionalPassengers("");
    setServiceAnimal(false);
    setMedicalContactName("");
    setMedicalContactPhone("");
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
                <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
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
                  We couldn't find operators matching your strict requirements (e.g., Immediate or Stretcher).{" "}
                  <span className="text-white block mt-2 font-medium">Our team has been notified to manually handle this specialized request.</span>
                </>
              ) : (
                "Broadcasting to our network of local operators. You'll receive quotes in your dashboard and via email shortly."
              )}
            </p>

            <div className="flex flex-wrap gap-2">
              {mobilityLevel && <Badge variant="outline" className="text-[10px] border-sky-500/30 text-sky-400 bg-sky-500/10 font-medium capitalize">{mobilityLevel}</Badge>}
              {oxygenUse && <Badge variant="outline" className="text-[10px] border-sky-500/30 text-sky-400 bg-sky-500/10 font-medium">Oxygen</Badge>}
              {isBariatric && <Badge variant="outline" className="text-[10px] border-sky-500/30 text-sky-400 bg-sky-500/10 font-medium">Bariatric</Badge>}
              {isImmediate && <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400 bg-red-500/10 font-bold uppercase">ASAP</Badge>}
            </div>
          </div>
          <div className="p-4 text-center border-t border-white/5 bg-sky-500/5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-sky-400">
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
      {/* Row 1: Locations */}
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
        <div className="col-span-1 min-[400px]:col-span-2 sm:col-span-3 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">Pickup Location</label>
          <LocationInput
            placeholder="Home, hospice, etc..."
            value={pickupLocation}
            onSelect={(addr, lat, lng) => {
              setPickupLocation(addr);
              setPickupLocationLat(lat ?? null);
              setPickupLocationLng(lng ?? null);
            }}
            className="h-10 rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150"
          />
        </div>
        <div className="col-span-1 min-[400px]:col-span-2 sm:col-span-3 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">Dropoff Location</label>
          <LocationInput
            placeholder="Hospital or clinic..."
            value={dropoffLocation}
            onSelect={(addr, lat, lng) => {
              setDropoffLocation(addr);
              setDropoffLocationLat(lat ?? null);
              setDropoffLocationLng(lng ?? null);
            }}
            className="h-10 rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150"
          />
        </div>
      </div>

      {/* Row 2: Mobility & Service Details */}
      <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
          <div className="col-span-1 sm:col-span-1 md:col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-neutral-500 ml-1">Access Type</label>
            <Select value={mobilityLevel} onValueChange={setMobilityLevel}>
              <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent className="rounded-md border-neutral-200 shadow-lg">
                <SelectItem value="ambulatory" className="text-sm font-medium">Ambulatory</SelectItem>
                <SelectItem value="manual-wheelchair" className="text-sm font-medium">Manual Wheelchair</SelectItem>
                <SelectItem value="electric-wheelchair" className="text-sm font-medium">Electric Wheelchair</SelectItem>
                <SelectItem value="stretcher" className="text-sm font-medium">Stretcher</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1 sm:col-span-1 md:col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-neutral-500 ml-1">Service Level</label>
            <Select value={serviceLevel} onValueChange={setServiceLevel}>
              <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent className="rounded-md border-neutral-200 shadow-lg">
                <SelectItem value="curb-to-curb" className="text-sm font-medium">Curb-to-Curb</SelectItem>
                <SelectItem value="door-to-door" className="text-sm font-medium">Door-to-Door</SelectItem>
                <SelectItem value="hand-to-hand" className="text-sm font-medium">Hand-to-Hand</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1 min-[400px]:col-span-2 sm:col-span-2 md:col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-neutral-500 ml-1">Facility (Room/Suite)</label>
            <Input
              placeholder="Room #, Suite, Wing..."
              value={facilityDetails}
              onChange={(e) => setFacilityDetails(e.target.value)}
              className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400"
            />
          </div>
        </div>
      </div>

      {/* Trip Details, Times & Contact */}
      <AnimatePresence>
        {effectiveMedicalSteps >= 2 && (
          <motion.div
            key="medical-step2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="space-y-6"
          >
            {/* Trip Details */}
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="col-span-1 space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">Trip Type</label>
                <Select value={tripType} onValueChange={setTripType}>
                  <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-md border-neutral-200 shadow-lg">
                    <SelectItem value="one-way" className="text-sm font-medium">One-Way</SelectItem>
                    <SelectItem value="round-trip" className="text-sm font-medium">Round Trip</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {tripType === "round-trip" && (
                <>
                  <div className="col-span-1 space-y-1.5">
                    <label className="text-xs font-medium text-neutral-500 ml-1">Return Status</label>
                    <Select value={returnStatus} onValueChange={setReturnStatus}>
                      <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-md border-neutral-200 shadow-lg">
                        <SelectItem value="fixed" className="text-sm font-medium">Fixed Time</SelectItem>
                        <SelectItem value="will-call" className="text-sm font-medium">Will-Call</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {returnStatus === "fixed" && (
                    <div className="col-span-1 space-y-1.5">
                      <label className="text-xs font-medium text-neutral-500 ml-1">Return Time</label>
                      <Input
                        type="time"
                        value={medicalReturnTime}
                        onChange={(e) => setMedicalReturnTime(e.target.value)}
                        className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium"
                      />
                    </div>
                  )}
                </>
              )}
              <div className="col-span-1 space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">Stairs</label>
                <Select value={stairFactor} onValueChange={setStairFactor}>
                  <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-md border-neutral-200 shadow-lg">
                    <SelectItem value="none" className="text-sm font-medium">No Stairs</SelectItem>
                    <SelectItem value="1-5" className="text-sm font-medium">1-5 Stairs</SelectItem>
                    <SelectItem value="flight" className="text-sm font-medium">Full Flight</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">Service Type</label>
                <Select
                  value={medicalDurationType}
                  onValueChange={(v) => {
                    setMedicalDurationType(v);
                    if (v === "one-time") {
                      setMedicalStartDate("");
                      setMedicalEndDate("");
                    } else {
                      setAppointmentDate("");
                    }
                  }}
                >
                  <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-md border-neutral-200 shadow-lg">
                    <SelectItem value="one-time" className="text-sm font-medium">One-Time</SelectItem>
                    <SelectItem value="recurring" className="text-sm font-medium">Recurring</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">Addl. Passeng.</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={additionalPassengers}
                  onChange={(e) => setAdditionalPassengers(e.target.value)}
                  className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400"
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="bg-white border border-neutral-200 rounded-lg px-4 py-3 flex flex-wrap gap-6">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={oxygenUse}
                  onChange={(e) => setOxygenUse(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-0"
                />
                <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">Oxygen Use</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={isBariatric}
                  onChange={(e) => setIsBariatric(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-0"
                />
                <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">Bariatric</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={serviceAnimal}
                  onChange={(e) => setServiceAnimal(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-0"
                />
                <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">Service Animal</span>
              </label>
              <label className={cn(
                "flex items-center gap-2 cursor-pointer group px-3 py-1.5 rounded-md border transition-colors duration-150",
                isImmediate ? "bg-sky-50 border-sky-200" : "border-neutral-200 hover:bg-white"
              )}>
                <input
                  type="checkbox"
                  checked={isImmediate}
                  onChange={(e) => setIsImmediate(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-sky-600 focus:ring-sky-500"
                />
                <span className={cn(
                  "text-sm font-semibold transition-colors",
                  isImmediate ? "text-sky-700" : "text-neutral-500 group-hover:text-neutral-900"
                )}>ASAP / Immediate Request</span>
              </label>
            </div>

            {/* Times & Dates */}
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4 pt-2">
              <div className="col-span-1 sm:col-span-1 md:col-span-1 space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">Appt Time</label>
                <Input
                  type="time"
                  value={isImmediate ? new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                  disabled={isImmediate}
                  className={cn(
                    "h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium",
                    isImmediate && "opacity-50 cursor-not-allowed bg-white shadow-none border-neutral-100"
                  )}
                />
              </div>
              {medicalDurationType === "recurring" ? (
                <>
                  <div className="col-span-1 sm:col-span-1 md:col-span-2 space-y-1.5">
                    <label className="text-xs font-medium text-neutral-500 ml-1">Start Date</label>
                    <Input
                      type="date"
                      value={isImmediate ? new Date().toISOString().split("T")[0] : medicalStartDate}
                      onChange={(e) => setMedicalStartDate(e.target.value)}
                      disabled={isImmediate}
                      className={cn(
                        "h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium",
                        isImmediate && "opacity-50 cursor-not-allowed bg-white shadow-none border-neutral-100"
                      )}
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-1 md:col-span-2 space-y-1.5">
                    <label className="text-xs font-medium text-neutral-500 ml-1">
                      End Date
                      <span className="ml-1 text-[10px] font-normal text-neutral-400 italic">(optional)</span>
                    </label>
                    <Input
                      type="date"
                      value={medicalEndDate}
                      min={medicalStartDate || undefined}
                      onChange={(e) => setMedicalEndDate(e.target.value)}
                      className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium"
                    />
                  </div>
                </>
              ) : (
                <div className="col-span-1 sm:col-span-1 md:col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-neutral-500 ml-1">Appt Date</label>
                  <Input
                    type="date"
                    value={isImmediate ? new Date().toISOString().split("T")[0] : appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    disabled={isImmediate}
                    className={cn(
                      "h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium",
                      isImmediate && "opacity-50 cursor-not-allowed bg-white shadow-none border-neutral-100"
                    )}
                  />
                </div>
              )}
              {medicalDurationType === "custom" && (
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-neutral-500 ml-1">Pick Dates</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-10 w-full rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium justify-start transition-colors duration-150 hover:bg-white"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {medicalCustomDates.length > 0 ? `${medicalCustomDates.length} dates` : "Select"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <DayPicker
                        mode="multiple"
                        selected={medicalCustomDates}
                        onSelect={(dates) => setMedicalCustomDates(dates || [])}
                        className="p-3"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>

            {/* Row 4: Requester Info */}
            <div className="grid grid-cols-2 gap-4 pb-2 pt-4 bg-white border border-neutral-200 rounded-lg p-4">
              <div className="col-span-1 space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">Requester Name</label>
                <Input
                  type="text"
                  placeholder="Your Name"
                  value={medicalContactName}
                  onChange={(e) => setMedicalContactName(e.target.value)}
                  className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400"
                />
              </div>
              <div className="col-span-1 space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">Phone Number</label>
                <Input
                  type="tel"
                  placeholder="555-000-0000"
                  value={medicalContactPhone}
                  onChange={(e) => setMedicalContactPhone(e.target.value)}
                  className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400"
                />
              </div>
            </div>

            {/* Row 5: Note */}
            <div className="space-y-1.5">
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
          className="w-full h-10 rounded-md text-white transition-colors duration-150 shadow-sm font-semibold text-base bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex items-center justify-center gap-3">
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                Find Care Ride ($1.99)
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </span>
        </Button>
      </div>
    </div>
  );
}
