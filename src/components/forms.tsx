"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Activity, MapPin, Search, CheckCircle2, Bus, HeartPulse, Gem, Users, CalendarIcon, X, Loader2, AlertCircle, Calendar, Clock, Plane } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { validateTransportRequest } from "@/lib/validation";
import { splitMetadataByServiceType } from "@/lib/metadata-helpers";

import { ServiceSwitcher } from "./service-switcher";
import { LocationInput } from "./location-input";
import { motion, AnimatePresence, useScroll, useTransform, useSpring, useMotionValue } from "framer-motion";
import { AIChatPanel } from "@/components/dashboard/ai-chat-panel";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";

const OPERATORS = [
  "Alpha Transit", "Boston Coach", "SafeWay Vans", "CareRide Express",
  "New England Charter", "Legacy Limo", "Scholastic Bus", "Metro Shuttle",
  "Silver Lining NEMT", "Event Shuttle Travels", "Elite Executive"
];

const INITIAL_REQUESTS = [
  { city: "Everett, MA", service: "School Run", time: "2 mins ago", status: "Matching", icon: Bus, color: "text-amber-500 bg-amber-50" },
  { city: "Salem, NH", service: "Care Ride", time: "5 mins ago", status: "Quoted", icon: HeartPulse, color: "text-green-500 bg-green-50" },
  { city: "Boston, MA", service: "Event Shuttle", time: "8 mins ago", status: "In-Progress", icon: Gem, color: "text-indigo-500 bg-indigo-50" },
  { city: "Cambridge, MA", service: "School Run", time: "12 mins ago", status: "Matching", icon: Bus, color: "text-amber-500 bg-amber-50" },
];

export function Forms({ hideRecentTrips = false }: { hideRecentTrips?: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("school");
  const [feedIndex, setFeedIndex] = useState(0);
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [recentTrips, setRecentTrips] = useState<any[]>([]);

  // Interactive Background
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }


  useEffect(() => {
    const interval = setInterval(() => {
      setFeedIndex((prev) => (prev + 1) % requests.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [requests.length]);

  // Fetch recent trips for logged-in users
  useEffect(() => {
    if (user) {
      const fetchRecentTrips = async () => {
        try {
          const response = await fetch('/api/requests');
          if (response.ok) {
            const result = await response.json();
            const trips = Array.isArray(result) ? result : (result.requests || []);
            setRecentTrips(trips.slice(0, 3)); // Show 3 most recent
          }
        } catch (error) {
          console.error('Error fetching recent trips:', error);
        }
      };
      fetchRecentTrips();
    }
  }, [user]);

  // School fields
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
  // School - Student Details
  const [studentAge, setStudentAge] = useState("");
  const [specialNeeds, setSpecialNeeds] = useState(false);
  const [boosterSeat, setBoosterSeat] = useState("none");
  // School - Route Schedule
  const [schoolRecurring, setSchoolRecurring] = useState("");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [schoolStartTime, setSchoolStartTime] = useState("");
  const [schoolDismissalTime, setSchoolDismissalTime] = useState("");
  const [earlyDismissalNotes, setEarlyDismissalNotes] = useState("");
  // School - Guardian & Security
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [authorizedPickups, setAuthorizedPickups] = useState("");
  const [noAdultRelease, setNoAdultRelease] = useState(false);
  const [safeWord, setSafeWord] = useState("");
  // School - Locations

  // Medical fields
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
  const [isPt1, setIsPt1] = useState(false);
  const [serviceLevel, setServiceLevel] = useState("");
  const [tripType, setTripType] = useState("");
  const [medicalDurationType, setMedicalDurationType] = useState("");
  const [medicalDurationValue, setMedicalDurationValue] = useState("");
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

  // Event fields
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
  const [eventDurationDays, setEventDurationDays] = useState("");
  const [eventCustomDates, setEventCustomDates] = useState<Date[]>([]);

  // Event Enhancements
  const [eventCategory, setEventCategory] = useState("");
  const [shuttleMode, setShuttleMode] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [alcoholAllowed, setAlcoholAllowed] = useState(false);
  const [refreshmentsProvided, setRefreshmentsProvided] = useState(false);
  const [avNeeds, setAvNeeds] = useState(false);
  const [specialDecor, setSpecialDecor] = useState(false);
  const [dayOfContactName, setDayOfContactName] = useState("");
  const [dayOfContactPhone, setDayOfContactPhone] = useState("");

  // Shared fields
  const [note, setNote] = useState("");
  const [isImmediate, setIsImmediate] = useState(false);

  // Form state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load draft from sessionStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const draft = sessionStorage.getItem('businto_form_draft');
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          if (parsed.activeTab) setActiveTab(parsed.activeTab);

          // Restore school fields
          if (parsed.pickupZip) setPickupZip(parsed.pickupZip);
          if (parsed.schoolName) setSchoolName(parsed.schoolName);
          if (parsed.gradeLevel) setGradeLevel(parsed.gradeLevel);
          if (parsed.scheduleType) setScheduleType(parsed.scheduleType);
          if (parsed.amTime) setAmTime(parsed.amTime);
          if (parsed.pmTime) setPmTime(parsed.pmTime);
          if (parsed.startDate) setStartDate(parsed.startDate);
          if (parsed.endDate) setEndDate(parsed.endDate);
          if (parsed.studentCount) setStudentCount(parsed.studentCount);

          // Restore medical fields
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

          // Restore wedding fields
          if (parsed.guestCount) setGuestCount(parsed.guestCount);
          if (parsed.eventDate) setEventDate(parsed.eventDate);
          if (parsed.hotelZip) setHotelZip(parsed.hotelZip);
          if (parsed.venueZip) setVenueZip(parsed.venueZip);
          if (parsed.vehicleStyle) setVehicleStyle(parsed.vehicleStyle);
          if (parsed.itineraryType) setItineraryType(parsed.itineraryType);
          if (parsed.pickupTime) setPickupTime(parsed.pickupTime);
          if (parsed.weddingReturnTime) setWeddingReturnTime(parsed.weddingReturnTime);

          // Restore event enhancement fields
          if (parsed.eventCategory) setEventCategory(parsed.eventCategory);
          if (parsed.shuttleMode) setShuttleMode(parsed.shuttleMode);
          if (parsed.eventStartTime) setEventStartTime(parsed.eventStartTime);
          if (parsed.alcoholAllowed !== undefined) setAlcoholAllowed(parsed.alcoholAllowed);
          if (parsed.refreshmentsProvided !== undefined) setRefreshmentsProvided(parsed.refreshmentsProvided);
          if (parsed.avNeeds !== undefined) setAvNeeds(parsed.avNeeds);
          if (parsed.specialDecor !== undefined) setSpecialDecor(parsed.specialDecor);
          if (parsed.dayOfContactName) setDayOfContactName(parsed.dayOfContactName);
          if (parsed.dayOfContactPhone) setDayOfContactPhone(parsed.dayOfContactPhone);
        } catch (e) {
          console.error('Failed to restore form draft:', e);
        }
      }
    }
  }, []);

  // Save draft to sessionStorage whenever form changes
  useEffect(() => {
    if (typeof window !== 'undefined' && !isSubmitted) {
      const draft = {
        activeTab,
        // School fields
        pickupZip, schoolName, gradeLevel, scheduleType, amTime, pmTime, startDate, endDate, studentCount,
        studentAge, specialNeeds, boosterSeat,
        schoolRecurring, selectedDays, schoolStartTime, schoolDismissalTime, earlyDismissalNotes,
        guardianName, guardianPhone, authorizedPickups, noAdultRelease, safeWord,
        // Medical fields
        medicalContactName, medicalContactPhone, pickupLocation, dropoffLocation, mobilityLevel, appointmentDate, appointmentTime, serviceLevel, tripType,
        oxygenUse, isBariatric, facilityDetails, stairFactor, returnStatus, medicalReturnTime, additionalPassengers, serviceAnimal,
        // Wedding/Event fields
        guestCount, eventDate, hotelZip, venueZip, vehicleStyle, itineraryType, pickupTime, weddingReturnTime,
        eventDurationType, eventDurationDays, eventCustomDates: eventCustomDates.map(d => d.toISOString()),
        eventCategory, shuttleMode, eventStartTime, alcoholAllowed, refreshmentsProvided, avNeeds, specialDecor,
        dayOfContactName, dayOfContactPhone,
        // Shared fields
        note, isImmediate,
      };
      sessionStorage.setItem('businto_form_draft', JSON.stringify(draft));
    }
  }, [activeTab, pickupZip, schoolName, gradeLevel, scheduleType, amTime, pmTime, startDate, endDate, studentCount,
    studentAge, specialNeeds, boosterSeat,
    schoolRecurring, selectedDays, schoolStartTime, schoolDismissalTime, earlyDismissalNotes,
    guardianName, guardianPhone, authorizedPickups, noAdultRelease, safeWord,
    medicalContactName, medicalContactPhone, pickupLocation, dropoffLocation, mobilityLevel, appointmentDate, appointmentTime, isPt1, serviceLevel, tripType,
    medicalDurationType, medicalDurationValue, medicalCustomDates, medicalStartDate, medicalEndDate, oxygenUse, isBariatric, facilityDetails, stairFactor, returnStatus, medicalReturnTime, additionalPassengers, serviceAnimal,
    guestCount, eventDate, hotelZip, venueZip, vehicleStyle, itineraryType, pickupTime, weddingReturnTime,
    eventDurationType, eventDurationDays, eventCustomDates,
    eventCategory, shuttleMode, eventStartTime, alcoholAllowed, refreshmentsProvided, avNeeds, specialDecor,
    dayOfContactName, dayOfContactPhone,
    note, isImmediate, isSubmitted]);

  // ── Progressive form disclosure ──────────────────────────────────────────
  const schoolVisibleSteps = useMemo(() => {
    const step2 = pickupZip.trim().length > 0 && schoolName.trim().length > 0
      && gradeLevel.length > 0 && studentCount.length > 0
      && schoolRecurring.length > 0 && scheduleType.length > 0;
    return step2 ? 2 : 1;
  }, [pickupZip, schoolName, gradeLevel, studentCount, schoolRecurring, scheduleType]);

  const medicalVisibleSteps = useMemo(() => {
    const step2 = pickupLocation.trim().length > 0 && dropoffLocation.trim().length > 0
      && mobilityLevel.length > 0 && serviceLevel.length > 0;
    return step2 ? 2 : 1;
  }, [pickupLocation, dropoffLocation, mobilityLevel, serviceLevel]);

  const weddingVisibleSteps = useMemo(() => {
    const step2 = eventCategory.length > 0 && guestCount.length > 0 && vehicleStyle.length > 0
      && hotelZip.trim().length > 0 && venueZip.trim().length > 0 && shuttleMode.length > 0;
    return step2 ? 2 : 1;
  }, [eventCategory, guestCount, vehicleStyle, hotelZip, venueZip, shuttleMode]);

  // isImmediate skips straight to full form
  const effectiveSchoolSteps = isImmediate ? 2 : schoolVisibleSteps;
  const effectiveMedicalSteps = isImmediate ? 2 : medicalVisibleSteps;
  const effectiveWeddingSteps = isImmediate ? 2 : weddingVisibleSteps;

  const currentStepCount = activeTab === 'school' ? effectiveSchoolSteps
    : activeTab === 'medical' ? effectiveMedicalSteps : effectiveWeddingSteps;
  const totalSteps = 2;
  const stepBarColor = activeTab === 'school' ? 'bg-amber-500'
    : activeTab === 'medical' ? 'bg-emerald-600' : 'bg-indigo-600';
  // ─────────────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    // Reset errors
    setValidationErrors({});
    setSubmitError(null);

    // Require auth
    if (!user) {
      router.push('/login?next=/');
      return;
    }

    // Build request data based on service type
    let requestData: any;

    if (activeTab === 'school') {
      const schoolMetadata = {
        // Safe — operator-visible
        school_name: schoolName,
        grade_level: gradeLevel || undefined,
        student_count: studentCount ? parseInt(studentCount) : undefined,
        student_age: parseInt(studentAge) || undefined,
        schedule_type: scheduleType,
        school_recurring: schoolRecurring,
        selected_days: selectedDays.length > 0 ? selectedDays.join(',') : undefined,
        school_start_time: schoolStartTime || undefined,
        school_dismissal_time: schoolDismissalTime || undefined,
        early_dismissal_notes: earlyDismissalNotes || undefined,
        am_pickup_time: (scheduleType === 'round-trip' || scheduleType === 'am-only') ? amTime : undefined,
        pm_pickup_time: (scheduleType === 'round-trip' || scheduleType === 'pm-only') ? pmTime : undefined,
        special_needs: specialNeeds,
        booster_seat: boosterSeat !== 'none' ? boosterSeat : undefined,
        no_adult_release: noAdultRelease,
        is_immediate: isImmediate,
        note: note || undefined,
        // Private — PII, split into metadata_private by splitSchoolMetadata
        parent_name: user?.name || undefined,
        parent_email: user?.email || undefined,
        guardian_name: guardianName || undefined,    // classified as private
        guardian_phone: guardianPhone || undefined,  // classified as private
        authorized_pickups: authorizedPickups || undefined, // classified as private
        safe_word: safeWord || undefined,             // classified as private
      };

      const { metadata_safe, metadata_private } = splitMetadataByServiceType('school', schoolMetadata);

      requestData = {
        service_type: 'school' as const,
        is_immediate: isImmediate,
        pickup_address: pickupZip,
        dropoff_address: schoolName,
        pickup_fuzzy: pickupZip,
        dropoff_fuzzy: schoolName,
        pickup_lat: pickupZipLat ?? undefined,
        pickup_lng: pickupZipLng ?? undefined,
        dropoff_lat: schoolNameLat ?? undefined,
        dropoff_lng: schoolNameLng ?? undefined,
        start_date: isImmediate ? new Date().toISOString().split('T')[0] : startDate,
        start_time: isImmediate ? new Date().toLocaleTimeString('en-GB').slice(0, 5) : ((scheduleType === 'round-trip' || scheduleType === 'am-only') ? amTime : pmTime),
        is_recurring: schoolRecurring === 'recurring',
        recurrence_pattern: schoolRecurring === 'recurring' ? 'weekdays' : 'one-time',
        metadata: schoolMetadata, // For backward compatibility
        metadata_safe,
        metadata_private,
      };
    } else if (activeTab === 'medical') {
      const isRecurringMedical = medicalDurationType === 'recurring';
      const medicalMetadata = {
        mobility_level: mobilityLevel,
        service_level: serviceLevel,
        trip_type: tripType,
        appointment_time: appointmentTime,
        oxygen_use: oxygenUse,
        is_bariatric: isBariatric,
        facility_details: facilityDetails || undefined,
        stair_factor: stairFactor,
        return_status: tripType === 'round-trip' ? returnStatus : undefined,
        return_time: tripType === 'round-trip' ? medicalReturnTime : undefined,
        additional_passengers: additionalPassengers ? parseInt(additionalPassengers) : undefined,
        service_animal: serviceAnimal,
        medical_start_date: isRecurringMedical ? medicalStartDate : appointmentDate,
        medical_end_date: isRecurringMedical ? medicalEndDate || undefined : undefined,
        is_immediate: isImmediate,
        note: note || undefined,
        // Private fields - will be split out
        patient_name: user?.name || 'Patient',
        contact_name: medicalContactName || user?.name || undefined,
        contact_phone: medicalContactPhone || undefined,
        contact_email: user?.email,
      };

      const { metadata_safe, metadata_private } = splitMetadataByServiceType('medical', medicalMetadata);

      requestData = {
        service_type: 'medical' as const,
        is_immediate: isImmediate,
        pickup_address: pickupLocation,
        dropoff_address: dropoffLocation,
        pickup_fuzzy: pickupLocation,
        dropoff_fuzzy: dropoffLocation,
        pickup_lat: pickupLocationLat ?? undefined,
        pickup_lng: pickupLocationLng ?? undefined,
        dropoff_lat: dropoffLocationLat ?? undefined,
        dropoff_lng: dropoffLocationLng ?? undefined,
        start_date: isImmediate ? new Date().toISOString().split('T')[0] : (isRecurringMedical ? medicalStartDate : appointmentDate),
        end_date: isRecurringMedical ? medicalEndDate || undefined : undefined,
        start_time: isImmediate ? new Date().toLocaleTimeString('en-GB').slice(0, 5) : appointmentTime,
        is_recurring: isRecurringMedical,
        recurrence_pattern: medicalDurationType,
        metadata: medicalMetadata, // For backward compatibility
        metadata_safe,
        metadata_private,
      };
    } else {
      // wedding / event
      const weddingMetadata = {
        // Safe — operator-visible
        event_category: eventCategory,
        guest_count: guestCount ? parseInt(guestCount) : undefined,
        vehicle_style: vehicleStyle,
        itinerary_type: itineraryType,
        shuttle_mode: shuttleMode,
        event_duration_type: eventDurationType || undefined,
        pickup_time: pickupTime,
        return_time: (itineraryType === 'shuttle-service' || itineraryType === 'full-day') ? weddingReturnTime : undefined,
        event_start_time: eventStartTime || undefined,
        alcohol_allowed: alcoholAllowed,
        refreshments_provided: refreshmentsProvided,
        av_needs: avNeeds,
        special_decor: specialDecor,
        is_immediate: isImmediate,
        note: note || undefined,
        // Private — PII, split into metadata_private by splitWeddingMetadata
        contact_name: user?.name || 'Event Coordinator',
        contact_phone: dayOfContactPhone || '555-000-0000',
        contact_email: user?.email || 'event@example.com',
        day_of_contact_name: dayOfContactName || undefined,
        day_of_contact_phone: dayOfContactPhone || undefined,
      };

      const { metadata_safe, metadata_private } = splitMetadataByServiceType('wedding', weddingMetadata);

      requestData = {
        service_type: 'wedding' as const,
        is_immediate: isImmediate,
        pickup_address: hotelZip,
        dropoff_address: venueZip,
        pickup_fuzzy: hotelZip,
        dropoff_fuzzy: venueZip,
        pickup_lat: hotelZipLat ?? undefined,
        pickup_lng: hotelZipLng ?? undefined,
        dropoff_lat: venueZipLat ?? undefined,
        dropoff_lng: venueZipLng ?? undefined,
        start_date: isImmediate ? new Date().toISOString().split('T')[0] : eventDate,
        start_time: isImmediate ? new Date().toLocaleTimeString('en-GB').slice(0, 5) : pickupTime,
        is_recurring: false,
        metadata: weddingMetadata, // For backward compatibility
        metadata_safe,
        metadata_private,
      };
    }

    // Validate the request data
    const validation = validateTransportRequest(requestData);

    if (!validation.success) {
      setValidationErrors(validation.errors);
      setSubmitError('Please fix the errors below');
      return;
    }

    // Submit to API
    try {
      setIsSubmitting(true);

      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }


      // Clear draft from sessionStorage after successful submission
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('businto_form_draft');
      }

      setSubmittedData(data.request);
      setIsSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCTA = () => {
    switch (activeTab) {
      case "school":
        return { text: "Find School Bus ($1.99)", color: "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20" };
      case "medical":
        return { text: "Find Care Ride ($1.99)", color: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20" };
      case "wedding":
        return { text: "Check Shuttle Prices ($1.99)", color: "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20" };
      default:
        return { text: "Check Availability ($1.99)", color: "bg-neutral-950 hover:bg-black shadow-black/20" };
    }
  };

  const cta = getCTA();

  return (
    <section
      className="relative pt-24 pb-32 px-4 overflow-hidden bg-background selection:bg-orange-100 selection:text-orange-900"
    >

      <div className="container mx-auto max-w-7xl relative z-10">

        {/* Headline — above the grid so it doesn't offset the form/chat alignment */}
        {!user && (
          <div className="mb-12 md:mb-16 flex flex-col items-center text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-neutral-900 mb-6 leading-tight">
              Professional transport <br />
              management platform.
            </h1>
            <p className="text-lg md:text-xl text-neutral-500 leading-relaxed max-w-2xl">
              Coordinating school runs, medical transports, and specialized charters with a unified, intelligent marketplace.
            </p>
          </div>
        )}

        {/* 2-col grid — form (left) sizes to content, chat (right) independent */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          {/* Left Column - Form card */}
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000 ease-out">

            <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300 fill-mode-both">
              <div className="bg-white rounded-xl p-7 md:p-10 border border-neutral-200 relative">

                <ServiceSwitcher activeTab={activeTab} onTabChange={setActiveTab} />

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
                    <div className="space-y-6">

                      {/* Section: Locations */}
                      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                        <div className="col-span-1 min-[400px]:col-span-2 sm:col-span-2 md:col-span-3 space-y-1.5">
                          <label className="text-xs font-medium text-neutral-500 ml-1">Pickup Address</label>
                          <LocationInput
                            placeholder="Your home address..."
                            value={pickupZip}
                            onSelect={(addr, lat, lng) => { setPickupZip(addr); setPickupZipLat(lat ?? null); setPickupZipLng(lng ?? null); }}
                            className="h-10 rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150"
                          />
                        </div>
                        <div className="col-span-1 min-[400px]:col-span-2 sm:col-span-2 md:col-span-3 space-y-1.5">
                          <label className="text-xs font-medium text-neutral-500 ml-1">School Name & Campus</label>
                          <LocationInput
                            placeholder="e.g. Malden Catholic, Main Entrance..."
                            value={schoolName}
                            onSelect={(addr, lat, lng) => { setSchoolName(addr); setSchoolNameLat(lat ?? null); setSchoolNameLng(lng ?? null); }}
                            className="h-10 rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150"
                          />
                        </div>
                      </div>

                      {/* Section: Student Details */}
                      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                        <div className="col-span-1 sm:col-span-2 md:col-span-2 space-y-1.5">
                          <label className="text-xs font-medium text-neutral-500 ml-1">Grade Level</label>
                          <Select value={gradeLevel} onValueChange={setGradeLevel}>
                            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
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
                            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
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
                              if (v === 'one-time') {
                                setEndDate('');
                                setSelectedDays(['M', 'T', 'W', 'Th', 'F']);
                              }
                            }}
                          >
                            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
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
                            value={isImmediate ? new Date().toISOString().split('T')[0] : startDate}
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
                            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
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
                      <motion.div key="school-step2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3, ease: "easeOut" }}>
                      {/* Times */}
                      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                        {(scheduleType === 'round-trip' || scheduleType === 'am-only') && (
                          <div className="col-span-1 sm:col-span-2 md:col-span-3 space-y-1.5">
                            <label className="text-xs font-medium text-neutral-500 ml-1">Bell Time</label>
                            <Input
                              type="time"
                              value={isImmediate ? new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : (schoolStartTime || amTime)}
                              onChange={(e) => { setSchoolStartTime(e.target.value); setAmTime(e.target.value); }}
                              disabled={isImmediate}
                              className={cn(
                                "h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium",
                                isImmediate && "opacity-50 cursor-not-allowed bg-white shadow-none border-neutral-100"
                              )}
                            />
                          </div>
                        )}
                        {(scheduleType === 'round-trip' || scheduleType === 'pm-only') && (
                          <div className="col-span-1 sm:col-span-2 md:col-span-3 space-y-1.5">
                            <label className="text-xs font-medium text-neutral-500 ml-1">Dismissal Time</label>
                            <Input
                              type="time"
                              value={isImmediate ? new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : (schoolDismissalTime || pmTime)}
                              onChange={(e) => { setSchoolDismissalTime(e.target.value); setPmTime(e.target.value); }}
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
                      {schoolRecurring === 'recurring' && (
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-neutral-500 ml-1">Days of the Week</label>
                          <div className="flex gap-2">
                            {(['M', 'T', 'W', 'Th', 'F'] as const).map((day) => (
                              <button
                                key={day}
                                type="button"
                                onClick={() => setSelectedDays(prev =>
                                  prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
                                )}
                                className={`h-9 w-9 rounded-md text-[10px] font-bold border transition-colors duration-150 duration-150 ${selectedDays.includes(day)
                                  ? 'bg-neutral-900 border-neutral-900 text-white'
                                  : 'bg-white border-neutral-200 text-neutral-400 hover:border-neutral-300'
                                  }`}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* End date + early dismissal notes */}
                      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                        {schoolRecurring === 'recurring' && (
                          <div className="col-span-1 sm:col-span-1 md:col-span-2 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
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
                        )}
                      </div>
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
                          placeholder={`"Child is shy, please wait at the front porch."`}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400"
                        />
                      </div>
                      </motion.div>
                      )}
                      </AnimatePresence>

                    </div>
                  )}


                  {activeTab === "medical" && (
                    <div className="space-y-6">
                      {/* Row 1: Locations */}
                      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                        <div className="col-span-1 min-[400px]:col-span-2 sm:col-span-3 space-y-1.5">
                          <label className="text-xs font-medium text-neutral-500 ml-1">Pickup Location</label>
                          <LocationInput
                            placeholder="Home, hospice, etc..."
                            value={pickupLocation}
                            onSelect={(addr, lat, lng) => { setPickupLocation(addr); setPickupLocationLat(lat ?? null); setPickupLocationLng(lng ?? null); }}
                            className="h-10 rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150"
                          />
                        </div>
                        <div className="col-span-1 min-[400px]:col-span-2 sm:col-span-3 space-y-1.5">
                          <label className="text-xs font-medium text-neutral-500 ml-1">Dropoff Location</label>
                          <LocationInput
                            placeholder="Hospital or clinic..."
                            value={dropoffLocation}
                            onSelect={(addr, lat, lng) => { setDropoffLocation(addr); setDropoffLocationLat(lat ?? null); setDropoffLocationLng(lng ?? null); }}
                            className="h-10 rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150"
                          />
                        </div>
                      </div>
                      {/* Row 2: Mobility & Service Details */}
                      <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-4">
                        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                        <div className="col-span-1 sm:col-span-1 md:col-span-2 space-y-1.5">
                          <label className="text-xs font-medium text-neutral-500 ml-1">Access Type</label>
                          <Select value={mobilityLevel} onValueChange={setMobilityLevel}>
                            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
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
                            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
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
                      <motion.div key="medical-step2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3, ease: "easeOut" }}>
                      {/* Trip Details */}
                      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="col-span-1 space-y-1.5">
                          <label className="text-xs font-medium text-neutral-500 ml-1">Trip Type</label>
                          <Select value={tripType} onValueChange={setTripType}>
                            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-md border-neutral-200 shadow-lg">
                              <SelectItem value="one-way" className="text-sm font-medium">One-Way</SelectItem>
                              <SelectItem value="round-trip" className="text-sm font-medium">Round Trip</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {tripType === 'round-trip' && (
                          <>
                            <div className="col-span-1 space-y-1.5">
                              <label className="text-xs font-medium text-neutral-500 ml-1">Return Status</label>
                              <Select value={returnStatus} onValueChange={setReturnStatus}>
                                <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent className="rounded-md border-neutral-200 shadow-lg">
                                  <SelectItem value="fixed" className="text-sm font-medium">Fixed Time</SelectItem>
                                  <SelectItem value="will-call" className="text-sm font-medium">Will-Call</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {returnStatus === 'fixed' && (
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
                            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
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
                              if (v === 'one-time') {
                                setMedicalStartDate('');
                                setMedicalEndDate('');
                              } else {
                                setAppointmentDate('');
                              }
                            }}
                          >
                            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
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
                            value={isImmediate ? new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : appointmentTime}
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
                                value={isImmediate ? new Date().toISOString().split('T')[0] : medicalStartDate}
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
                              value={isImmediate ? new Date().toISOString().split('T')[0] : appointmentDate}
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
                                  className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium justify-start transition-colors duration-150 hover:bg-white"
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
                          <label className="text-xs font-medium text-neutral-500 ml-1">
                            Requester Name
                          </label>
                          <Input
                            type="text"
                            placeholder="Your Name"
                            value={medicalContactName}
                            onChange={(e) => setMedicalContactName(e.target.value)}
                            className="h-10 w-full rounded-md px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400"
                          />
                        </div>
                        <div className="col-span-1 space-y-1.5">
                          <label className="text-xs font-medium text-neutral-500 ml-1">
                            Phone Number
                          </label>
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
                    </div>
                  )}

                  {activeTab === "wedding" && (
                    <div className="space-y-6">
                      {/* Row 1: Category & Basic Info */}
                      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                        <div className="col-span-2 space-y-1.5">
                          <label className="text-xs font-medium text-neutral-500 ml-1">Event Category</label>
                          <Select value={eventCategory} onValueChange={setEventCategory}>
                            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
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
                            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
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
                            onSelect={(addr, lat, lng) => { setHotelZip(addr); setHotelZipLat(lat ?? null); setHotelZipLng(lng ?? null); }}
                            className="h-10 rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150"
                          />
                        </div>
                        <div className="col-span-1 min-[400px]:col-span-2 sm:col-span-3 space-y-1.5">
                          <label className="text-xs font-medium text-neutral-500 ml-1">Venue Location</label>
                          <LocationInput
                            placeholder="Event venue..."
                            value={venueZip}
                            onSelect={(addr, lat, lng) => { setVenueZip(addr); setVenueZipLat(lat ?? null); setVenueZipLng(lng ?? null); }}
                            className="h-10 rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150"
                          />
                        </div>
                      </div>

                      {/* Row 3a: Logistics */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-neutral-500 ml-1">Shuttle Mode</label>
                          <Select value={shuttleMode} onValueChange={setShuttleMode}>
                            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
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
                      <motion.div key="wedding-step2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3, ease: "easeOut" }}>
                      <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-neutral-500 ml-1">Itinerary Type</label>
                          <Select value={itineraryType} onValueChange={setItineraryType}>
                            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
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
                        {(itineraryType === 'shuttle-service' || itineraryType === 'full-day') && (
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
                            value={isImmediate ? new Date().toISOString().split('T')[0] : eventDate}
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
                            value={isImmediate ? new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : pickupTime}
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
                            value={isImmediate ? new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : eventStartTime}
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
                            <SelectTrigger className="h-10 w-full rounded-md bg-white border border-neutral-200  px-3 text-sm text-neutral-900 font-medium transition-colors duration-150">
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
                          <input type="checkbox" checked={alcoholAllowed} onChange={(e) => setAlcoholAllowed(e.target.checked)} className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-0" />
                          <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">Alcohol OK</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input type="checkbox" checked={refreshmentsProvided} onChange={(e) => setRefreshmentsProvided(e.target.checked)} className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-0" />
                          <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">Refreshments</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input type="checkbox" checked={avNeeds} onChange={(e) => setAvNeeds(e.target.checked)} className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-0" />
                          <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">Bluetooth/AUX</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input type="checkbox" checked={specialDecor} onChange={(e) => setSpecialDecor(e.target.checked)} className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-0" />
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
                    </div>
                  )}
                </div>

                <div className="mt-10">
                  {/* Error Display */}
                  {(submitError || Object.keys(validationErrors).length > 0) && (
                    <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-red-900 mb-1">
                            {submitError || 'Please fix the following errors:'}
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

                  {!isSubmitted ? (
                    <Button
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      size="lg"
                      className={`w-full h-10 rounded-md text-white transition-colors duration-150 shadow-sm font-semibold text-base ${cta.color} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <span className="flex items-center justify-center gap-3">
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            {cta.text}
                            <ArrowRight className="h-5 w-5" />
                          </>
                        )}
                      </span>
                    </Button>
                  ) : (
                    <div className="space-y-6">
                      <div className="bg-neutral-900 rounded-lg overflow-hidden text-white shadow-lg relative">
                        <div className="p-8 space-y-6 relative z-10">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <div className={cn(
                                "text-[10px] font-bold uppercase tracking-wider",
                                activeTab === 'school' && "text-amber-500",
                                activeTab === 'medical' && "text-sky-400",
                                activeTab === 'wedding' && "text-violet-400"
                              )}>
                                Request ID: {submittedData?.id?.slice(0, 8).toUpperCase()}
                              </div>
                              <h3 className="text-2xl font-semibold tracking-tight">
                                {submittedData?.matched_operators_count === 0 ? "Under Review" : "Trip Submitted!"}
                              </h3>
                            </div>
                            <div className={cn(
                              "h-12 w-12 rounded-full flex items-center justify-center shadow-sm",
                              submittedData?.matched_operators_count === 0
                                ? "bg-amber-500"
                                : "bg-green-600"
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
                            {activeTab === 'medical' && (
                              <>
                                {mobilityLevel && <Badge variant="outline" className="text-[10px] border-sky-500/30 text-sky-400 bg-sky-500/10 font-medium capitalize">{mobilityLevel}</Badge>}
                                {oxygenUse && <Badge variant="outline" className="text-[10px] border-sky-500/30 text-sky-400 bg-sky-500/10 font-medium">Oxygen</Badge>}
                                {isBariatric && <Badge variant="outline" className="text-[10px] border-sky-500/30 text-sky-400 bg-sky-500/10 font-medium">Bariatric</Badge>}
                              </>
                            )}
                            {activeTab === 'school' && (
                              <>
                                {specialNeeds && <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10 font-medium">Special Needs</Badge>}
                                {noAdultRelease && <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10 font-medium">No-Adult Release</Badge>}
                              </>
                            )}
                            {isImmediate && <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400 bg-red-500/10 font-bold uppercase">ASAP</Badge>}
                          </div>
                        </div>
                        <div className={cn(
                          "p-4 text-center border-t border-white/5",
                          activeTab === 'school' && "bg-amber-500/5",
                          activeTab === 'medical' && "bg-sky-500/5",
                          activeTab === 'wedding' && "bg-violet-500/5"
                        )}>
                          <div className={cn(
                            "text-[10px] font-bold uppercase tracking-widest",
                            activeTab === 'school' && "text-amber-400",
                            activeTab === 'medical' && "text-sky-400",
                            activeTab === 'wedding' && "text-violet-400"
                          )}>
                            {submittedData?.matched_operators_count === 0 ? "Status: Manual Review Needed" : "Status: Matching Operators"}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                          variant="outline"
                          className="flex-1 h-10 rounded-md font-semibold border-neutral-200 hover:bg-white"
                          onClick={() => setIsSubmitted(false)}
                        >
                          Submit Another
                        </Button>
                        <Button
                          className="flex-1 h-10 rounded-md font-semibold bg-neutral-900 text-white hover:bg-black shadow-sm"
                          onClick={() => router.push('/trips')}
                        >
                          View My Trips
                        </Button>
                      </div>
                    </div>
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
                    {/* Left: icon + type */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded flex items-center justify-center shrink-0",
                        trip.service_type === 'school' && "bg-amber-100 text-amber-600",
                        trip.service_type === 'medical' && "bg-sky-100 text-sky-600",
                        trip.service_type === 'wedding' && "bg-violet-100 text-violet-600"
                      )}>
                        {trip.service_type === 'school' ? <Bus className="h-4 w-4" /> :
                          trip.service_type === 'medical' ? <HeartPulse className="h-4 w-4" /> :
                            <Plane className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-neutral-900 truncate">
                          {trip.service_type === 'school' ? 'School Run' :
                            trip.service_type === 'medical' ? 'Care Ride' : 'Event Shuttle'}
                        </div>
                        <div className="text-[10px] text-neutral-400 font-mono">#{trip.id.slice(0, 8).toUpperCase()}</div>
                      </div>
                    </div>

                    {/* Right: status badge */}
                    <Badge variant="outline" className={cn(
                      "text-[10px] h-5 px-1.5 font-bold uppercase",
                      trip.status === 'pending' && "border-amber-200 text-amber-600 bg-amber-50",
                      trip.status === 'booked' && "border-green-200 text-green-600 bg-green-50",
                      trip.status === 'completed' && "border-neutral-200 text-neutral-500 bg-white"
                    )}>
                      {trip.status}
                    </Badge>
                  </div>

                  {/* Location row */}
                  <div className="space-y-1.5 pt-3 border-t border-neutral-100">
                    <div className="flex items-center gap-2 text-[11px] text-neutral-600">
                      <Calendar className="h-3 w-3 text-neutral-400" />
                      <span>{new Date(trip.start_date || trip.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
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
    </section >
  );
}