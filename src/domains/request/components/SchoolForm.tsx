"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, AlertCircle, Loader2, CheckCircle2, Bus, Calendar, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { validateTransportRequest } from "@/lib/validation";
import { splitMetadataByServiceType } from "@/lib/metadata-helpers";
import { LocationInput } from "@/components/location-input";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";

interface SchoolFormProps {
  onStepChange?: (step: number) => void;
  isImmediateInitial?: boolean;
}

export function SchoolForm({ onStepChange, isImmediateInitial = false }: SchoolFormProps) {
  const { user } = useAuth();
  const router = useRouter();

  // State
  const [pickupZip, setPickupZip] = useState("");
  const [pickupZipLat, setPickupZipLat] = useState<number | null>(null);
  const [pickupZipLng, setPickupZipLng] = useState<number | null>(null);
  const [schoolName, setSchoolName] = useState("");
  const [schoolNameLat, setSchoolNameLat] = useState<number | null>(null);
  const [schoolNameLng, setSchoolNameLng] = useState<number | null>(null);
  const [gradeLevel, setGradeLevel] = useState("");
  const [scheduleType, setScheduleType] = useState("");
  const [amTime, setAmTime] = useState("");
  const [pmTime, setPmTime] = useState("");
  const [startDate, setStartDate] = useState("");
  const [studentCount, setStudentCount] = useState("");
  const [endDate, setEndDate] = useState("");
  const [studentAge, setStudentAge] = useState("");
  const [specialNeeds, setSpecialNeeds] = useState(false);
  const [boosterSeat, setBoosterSeat] = useState("none");
  const [schoolRecurring, setSchoolRecurring] = useState("");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [schoolStartTime, setSchoolStartTime] = useState("");
  const [schoolDismissalTime, setSchoolDismissalTime] = useState("");
  const [earlyDismissalNotes, setEarlyDismissalNotes] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [authorizedPickups, setAuthorizedPickups] = useState("");
  const [noAdultRelease, setNoAdultRelease] = useState(false);
  const [safeWord, setSafeWord] = useState("");
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
          if (parsed.activeTab === "school" || !parsed.activeTab) {
            if (parsed.pickupZip) setPickupZip(parsed.pickupZip);
            if (parsed.schoolName) setSchoolName(parsed.schoolName);
            if (parsed.gradeLevel) setGradeLevel(parsed.gradeLevel);
            if (parsed.scheduleType) setScheduleType(parsed.scheduleType);
            if (parsed.amTime) setAmTime(parsed.amTime);
            if (parsed.pmTime) setPmTime(parsed.pmTime);
            if (parsed.startDate) setStartDate(parsed.startDate);
            if (parsed.endDate) setEndDate(parsed.endDate);
            if (parsed.studentCount) setStudentCount(parsed.studentCount);
            if (parsed.studentAge) setStudentAge(parsed.studentAge);
            if (parsed.specialNeeds !== undefined) setSpecialNeeds(parsed.specialNeeds);
            if (parsed.boosterSeat) setBoosterSeat(parsed.boosterSeat);
            if (parsed.schoolRecurring) setSchoolRecurring(parsed.schoolRecurring);
            if (parsed.selectedDays) setSelectedDays(parsed.selectedDays);
            if (parsed.schoolStartTime) setSchoolStartTime(parsed.schoolStartTime);
            if (parsed.schoolDismissalTime) setSchoolDismissalTime(parsed.schoolDismissalTime);
            if (parsed.earlyDismissalNotes) setEarlyDismissalNotes(parsed.earlyDismissalNotes);
            if (parsed.guardianName) setGuardianName(parsed.guardianName);
            if (parsed.guardianPhone) setGuardianPhone(parsed.guardianPhone);
            if (parsed.authorizedPickups) setAuthorizedPickups(parsed.authorizedPickups);
            if (parsed.noAdultRelease !== undefined) setNoAdultRelease(parsed.noAdultRelease);
            if (parsed.safeWord) setSafeWord(parsed.safeWord);
            if (parsed.note) setNote(parsed.note);
            if (parsed.isImmediate !== undefined) setIsImmediate(parsed.isImmediate);
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
        activeTab: "school",
        pickupZip,
        schoolName,
        gradeLevel,
        scheduleType,
        amTime,
        pmTime,
        startDate,
        endDate,
        studentCount,
        studentAge,
        specialNeeds,
        boosterSeat,
        schoolRecurring,
        selectedDays,
        schoolStartTime,
        schoolDismissalTime,
        earlyDismissalNotes,
        guardianName,
        guardianPhone,
        authorizedPickups,
        noAdultRelease,
        safeWord,
        note,
        isImmediate,
      };
      sessionStorage.setItem("businto_form_draft", JSON.stringify(draft));
    }
  }, [
    pickupZip,
    schoolName,
    gradeLevel,
    scheduleType,
    amTime,
    pmTime,
    startDate,
    endDate,
    studentCount,
    studentAge,
    specialNeeds,
    boosterSeat,
    schoolRecurring,
    selectedDays,
    schoolStartTime,
    schoolDismissalTime,
    earlyDismissalNotes,
    guardianName,
    guardianPhone,
    authorizedPickups,
    noAdultRelease,
    safeWord,
    note,
    isImmediate,
    isSubmitted,
  ]);

  // Step Progress Calculation
  const schoolVisibleSteps = useMemo(() => {
    const step2 =
      pickupZip.trim().length > 0 &&
      schoolName.trim().length > 0 &&
      gradeLevel.length > 0 &&
      studentCount.length > 0 &&
      schoolRecurring.length > 0 &&
      scheduleType.length > 0;
    return step2 ? 2 : 1;
  }, [pickupZip, schoolName, gradeLevel, studentCount, schoolRecurring, scheduleType]);

  const effectiveSchoolSteps = isImmediate ? 2 : schoolVisibleSteps;

  useEffect(() => {
    if (onStepChange) {
      onStepChange(effectiveSchoolSteps);
    }
  }, [effectiveSchoolSteps, onStepChange]);

  const handleSubmit = async () => {
    setValidationErrors({});
    setSubmitError(null);

    if (!user) {
      router.push("/login?next=/");
      return;
    }

    const schoolMetadata = {
      school_name: schoolName,
      grade_level: gradeLevel || undefined,
      student_count: studentCount ? parseInt(studentCount) : undefined,
      student_age: parseInt(studentAge) || undefined,
      schedule_type: scheduleType,
      school_recurring: schoolRecurring,
      selected_days: selectedDays.length > 0 ? selectedDays.join(",") : undefined,
      school_start_time: schoolStartTime || undefined,
      school_dismissal_time: schoolDismissalTime || undefined,
      am_pickup_time: scheduleType === "round-trip" || scheduleType === "am-only" ? amTime : undefined,
      pm_pickup_time: scheduleType === "round-trip" || scheduleType === "pm-only" ? pmTime : undefined,
      special_needs: specialNeeds,
      booster_seat: boosterSeat !== "none" ? boosterSeat : undefined,
      no_adult_release: noAdultRelease,
      is_immediate: isImmediate,
      note: note || undefined,
      parent_name: user?.name || undefined,
      parent_email: user?.email || undefined,
      guardian_name: guardianName || undefined,
      guardian_phone: guardianPhone || undefined,
      authorized_pickups: authorizedPickups || undefined,
      safe_word: safeWord || undefined,
    };

    const { metadata_safe, metadata_private } = splitMetadataByServiceType("school", schoolMetadata);

    const requestData = {
      service_type: "school" as const,
      is_immediate: isImmediate,
      pickup_address: pickupZip,
      dropoff_address: schoolName,
      pickup_fuzzy: pickupZip,
      dropoff_fuzzy: schoolName,
      pickup_lat: pickupZipLat ?? undefined,
      pickup_lng: pickupZipLng ?? undefined,
      dropoff_lat: schoolNameLat ?? undefined,
      dropoff_lng: schoolNameLng ?? undefined,
      start_date: isImmediate ? new Date().toISOString().split("T")[0] : startDate,
      start_time: isImmediate
        ? new Date().toLocaleTimeString("en-GB").slice(0, 5)
        : scheduleType === "round-trip" || scheduleType === "am-only"
        ? amTime
        : pmTime,
      is_recurring: schoolRecurring === "recurring",
      recurrence_pattern: schoolRecurring === "recurring" ? "weekdays" : "one-time",
      metadata: schoolMetadata,
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
    setPickupZip("");
    setSchoolName("");
    setGradeLevel("");
    setScheduleType("");
    setAmTime("");
    setPmTime("");
    setStartDate("");
    setStudentCount("");
    setEndDate("");
    setStudentAge("");
    setSpecialNeeds(false);
    setBoosterSeat("none");
    setSchoolRecurring("");
    setSelectedDays([]);
    setSchoolStartTime("");
    setSchoolDismissalTime("");
    setEarlyDismissalNotes("");
    setGuardianName("");
    setGuardianPhone("");
    setAuthorizedPickups("");
    setNoAdultRelease(false);
    setSafeWord("");
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
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
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
              {specialNeeds && <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10 font-medium">Special Needs</Badge>}
              {noAdultRelease && <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10 font-medium">No-Adult Release</Badge>}
              {isImmediate && <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400 bg-red-500/10 font-bold uppercase">ASAP</Badge>}
            </div>
          </div>
          <div className="p-4 text-center border-t border-white/5 bg-amber-500/5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
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
      {/* Section: Locations */}
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
        <div className="col-span-1 min-[400px]:col-span-2 sm:col-span-2 md:col-span-3 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">Pickup Address</label>
          <LocationInput
            placeholder="Your home address..."
            value={pickupZip}
            onSelect={(addr, lat, lng) => {
              setPickupZip(addr);
              setPickupZipLat(lat ?? null);
              setPickupZipLng(lng ?? null);
            }}
            className="h-10 rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150"
          />
        </div>
        <div className="col-span-1 min-[400px]:col-span-2 sm:col-span-2 md:col-span-3 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">School Name & Campus</label>
          <LocationInput
            placeholder="e.g. Malden Catholic, Main Entrance..."
            value={schoolName}
            onSelect={(addr, lat, lng) => {
              setSchoolName(addr);
              setSchoolNameLat(lat ?? null);
              setSchoolNameLng(lng ?? null);
            }}
            className="h-10 rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150"
          />
        </div>
      </div>

      {/* Section: Student Details */}
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
        <div className="col-span-1 sm:col-span-2 md:col-span-2 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">Grade Level</label>
          <Select value={gradeLevel} onValueChange={setGradeLevel}>
            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent className="rounded-md border-neutral-200 shadow-lg">
              <SelectItem value="k" className="text-sm font-medium">Kindergarten</SelectItem>
              <SelectItem value="elem" className="text-sm font-medium">Elementary 1–5</SelectItem>
              <SelectItem value="middle" className="text-sm font-medium">Middle 6–8</SelectItem>
              <SelectItem value="high" className="text-sm font-medium">High 9–12</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-1 sm:col-span-1 md:col-span-1 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">Age</label>
          <Input
            type="number"
            placeholder="9"
            min="4"
            max="18"
            value={studentAge}
            onChange={(e) => setStudentAge(e.target.value)}
            className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400"
          />
        </div>
        <div className="col-span-1 sm:col-span-1 md:col-span-1 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">Students</label>
          <Input
            type="number"
            placeholder="1"
            min="1"
            value={studentCount}
            onChange={(e) => setStudentCount(e.target.value)}
            className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400"
          />
        </div>
        <div className="col-span-1 sm:col-span-2 md:col-span-2 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">Car Seat Needed</label>
          <Select value={boosterSeat} onValueChange={setBoosterSeat}>
            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent className="rounded-md border-neutral-200 shadow-lg">
              <SelectItem value="none" className="text-sm font-medium">None</SelectItem>
              <SelectItem value="booster" className="text-sm font-medium">Booster Seat</SelectItem>
              <SelectItem value="forward-facing" className="text-sm font-medium">Forward-Facing Seat</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Section: Schedule */}
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
        <div className="col-span-1 sm:col-span-2 md:col-span-2 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">Frequency</label>
          <Select
            value={schoolRecurring}
            onValueChange={(v) => {
              setSchoolRecurring(v);
              if (v === "one-time") {
                setEndDate("");
                setSelectedDays(["M", "T", "W", "Th", "F"]);
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
        <div className="col-span-1 sm:col-span-2 md:col-span-2 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">Start Date</label>
          <Input
            type="date"
            value={isImmediate ? new Date().toISOString().split("T")[0] : startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={isImmediate}
            className={cn(
              "h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium",
              isImmediate && "opacity-50 cursor-not-allowed bg-white shadow-none border-neutral-100"
            )}
          />
        </div>
        <div className="col-span-1 min-[400px]:col-span-2 sm:col-span-2 md:col-span-2 space-y-1.5">
          <label className="text-xs font-medium text-neutral-500 ml-1">AM/PM</label>
          <Select value={scheduleType} onValueChange={setScheduleType}>
            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent className="rounded-md border-neutral-200 shadow-lg">
              <SelectItem value="round-trip" className="text-sm font-medium">Round Trip</SelectItem>
              <SelectItem value="am-only" className="text-sm font-medium">AM Only</SelectItem>
              <SelectItem value="pm-only" className="text-sm font-medium">PM Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Section: Times & Contact */}
      <AnimatePresence>
        {effectiveSchoolSteps >= 2 && (
          <motion.div
            key="school-step2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="space-y-6"
          >
            {/* Times */}
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
              {(scheduleType === "round-trip" || scheduleType === "am-only") && (
                <div className="col-span-1 sm:col-span-2 md:col-span-3 space-y-1.5">
                  <label className="text-xs font-medium text-neutral-500 ml-1">Bell Time</label>
                  <Input
                    type="time"
                    value={isImmediate ? new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : (schoolStartTime || amTime)}
                    onChange={(e) => {
                      setSchoolStartTime(e.target.value);
                      setAmTime(e.target.value);
                    }}
                    disabled={isImmediate}
                    className={cn(
                      "h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium",
                      isImmediate && "opacity-50 cursor-not-allowed bg-white shadow-none border-neutral-100"
                    )}
                  />
                </div>
              )}
              {(scheduleType === "round-trip" || scheduleType === "pm-only") && (
                <div className="col-span-1 sm:col-span-2 md:col-span-3 space-y-1.5">
                  <label className="text-xs font-medium text-neutral-500 ml-1">Dismissal Time</label>
                  <Input
                    type="time"
                    value={isImmediate ? new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : (schoolDismissalTime || pmTime)}
                    onChange={(e) => {
                      setSchoolDismissalTime(e.target.value);
                      setPmTime(e.target.value);
                    }}
                    disabled={isImmediate}
                    className={cn(
                      "h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium",
                      isImmediate && "opacity-50 cursor-not-allowed bg-white shadow-none border-neutral-100"
                    )}
                  />
                </div>
              )}
            </div>

            {/* Days of Week - only for recurring */}
            {schoolRecurring === "recurring" && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-neutral-500 ml-1">Days of the Week</label>
                <div className="flex gap-2">
                  {(["M", "T", "W", "Th", "F"] as const).map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setSelectedDays((prev) =>
                          prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
                        )
                      }
                      className={`h-9 w-9 rounded-md text-[10px] font-bold border transition-colors duration-150 ${
                        selectedDays.includes(day)
                          ? "bg-neutral-900 border-neutral-900 text-white"
                          : "bg-white border-neutral-200 text-neutral-400 hover:border-neutral-300"
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* End date */}
            {schoolRecurring === "recurring" && (
              <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                <div className="col-span-1 sm:col-span-1 md:col-span-2 space-y-2">
                  <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-[0.2em] mb-1.5 ml-1 flex items-center">
                    End Date
                    <span className="ml-1 text-[8px] font-medium text-neutral-400 normal-case tracking-normal">(optional)</span>
                  </label>
                  <Input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-10 w-full rounded-lg bg-white border border-neutral-200 focus-visible:ring-0 px-3 text-xs text-neutral-900 font-semibold transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                  />
                </div>
              </div>
            )}

            {/* Guardian & Contact */}
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
              <div className="col-span-1 sm:col-span-2 md:col-span-4 space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">
                  Parent's Name
                  <span className="ml-1 text-[10px] font-normal text-neutral-400 italic">(optional)</span>
                </label>
                <Input
                  type="text"
                  placeholder="Full Name"
                  value={authorizedPickups}
                  onChange={(e) => setAuthorizedPickups(e.target.value)}
                  className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400"
                />
              </div>
              <div className="col-span-1 sm:col-span-2 md:col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-neutral-500 ml-1">
                  Phone Number
                  <span className="ml-1 text-[10px] font-normal text-neutral-400 italic">(optional)</span>
                </label>
                <Input
                  type="tel"
                  placeholder="555-000-0000"
                  value={guardianPhone}
                  onChange={(e) => setGuardianPhone(e.target.value)}
                  className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400"
                />
              </div>
            </div>

            {/* Checkboxes Row */}
            <div className="bg-white border border-neutral-200 rounded-lg px-4 py-3 flex flex-wrap gap-6">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={specialNeeds}
                  onChange={(e) => setSpecialNeeds(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-0"
                />
                <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">Special Needs / IEP</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={noAdultRelease}
                  onChange={(e) => setNoAdultRelease(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-0"
                />
                <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">No-Adult Release OK</span>
              </label>
              <label className={cn(
                "flex items-center gap-2 cursor-pointer group px-3 py-1.5 rounded-md border transition-colors duration-150",
                isImmediate ? "bg-amber-50 border-amber-200" : "border-neutral-200 hover:bg-white"
              )}>
                <input
                  type="checkbox"
                  checked={isImmediate}
                  onChange={(e) => setIsImmediate(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-amber-600 focus:ring-amber-500"
                />
                <span className={cn(
                  "text-sm font-semibold transition-colors",
                  isImmediate ? "text-amber-700" : "text-neutral-500 group-hover:text-neutral-900"
                )}>ASAP / Immediate Request</span>
              </label>
            </div>

            {/* Note */}
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-medium text-neutral-500 ml-1">
                Additional Note
                <span className="ml-1 text-[10px] font-normal text-neutral-400 italic">(optional)</span>
              </label>
              <Input
                type="text"
                placeholder={'"Child is shy, please wait at the front porch."'}
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
          className="w-full h-10 rounded-md text-white transition-colors duration-150 shadow-sm font-semibold text-base bg-amber-500 hover:bg-amber-600 shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex items-center justify-center gap-3">
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                Find School Bus ($1.99)
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </span>
        </Button>
      </div>
    </div>
  );
}
