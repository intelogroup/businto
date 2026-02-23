"use client";

import React, { useState, useEffect } from "react";
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
import { motion, useScroll, useTransform, useSpring, useMotionValue } from "framer-motion";
import { AIChatPanel } from "@/components/dashboard/ai-chat-panel";
import { useAuth } from "@/hooks/use-auth";

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

export function Hero() {
  const { user } = useAuth();
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
  const [schoolName, setSchoolName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [scheduleType, setScheduleType] = useState("round-trip");
  const [amTime, setAmTime] = useState("07:45");
  const [pmTime, setPmTime] = useState("15:00");
  const [startDate, setStartDate] = useState("");
  const [studentCount, setStudentCount] = useState("");
  const [requiresCori, setRequiresCori] = useState(true);
  const [schoolDurationType, setSchoolDurationType] = useState("daily");
  const [schoolDurationValue, setSchoolDurationValue] = useState("");
  const [schoolCustomDates, setSchoolCustomDates] = useState<Date[]>([]);

  // Medical fields
  const [pickupLocation, setPickupLocation] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState("");
  const [mobilityLevel, setMobilityLevel] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [isPt1, setIsPt1] = useState(false);
  const [serviceLevel, setServiceLevel] = useState("curb-to-curb");
  const [tripType, setTripType] = useState("one-way");
  const [medicalDurationType, setMedicalDurationType] = useState("one-time");
  const [medicalDurationValue, setMedicalDurationValue] = useState("");
  const [medicalCustomDates, setMedicalCustomDates] = useState<Date[]>([]);

  // Event fields
  const [guestCount, setGuestCount] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [hotelZip, setHotelZip] = useState("");
  const [venueZip, setVenueZip] = useState("");
  const [vehicleStyle, setVehicleStyle] = useState("");
  const [itineraryType, setItineraryType] = useState("hotel-to-venue");
  const [pickupTime, setPickupTime] = useState("");
  const [eventDurationType, setEventDurationType] = useState("single-day");
  const [eventDurationDays, setEventDurationDays] = useState("");
  const [eventCustomDates, setEventCustomDates] = useState<Date[]>([]);

  // Shared fields
  const [note, setNote] = useState("");

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
          if (parsed.studentCount) setStudentCount(parsed.studentCount);
          if (parsed.schoolDurationType) setSchoolDurationType(parsed.schoolDurationType);

          // Restore medical fields
          if (parsed.pickupLocation) setPickupLocation(parsed.pickupLocation);
          if (parsed.dropoffLocation) setDropoffLocation(parsed.dropoffLocation);
          if (parsed.mobilityLevel) setMobilityLevel(parsed.mobilityLevel);
          if (parsed.appointmentDate) setAppointmentDate(parsed.appointmentDate);
          if (parsed.appointmentTime) setAppointmentTime(parsed.appointmentTime);
          if (parsed.serviceLevel) setServiceLevel(parsed.serviceLevel);
          if (parsed.tripType) setTripType(parsed.tripType);

          // Restore wedding fields
          if (parsed.guestCount) setGuestCount(parsed.guestCount);
          if (parsed.eventDate) setEventDate(parsed.eventDate);
          if (parsed.hotelZip) setHotelZip(parsed.hotelZip);
          if (parsed.venueZip) setVenueZip(parsed.venueZip);
          if (parsed.vehicleStyle) setVehicleStyle(parsed.vehicleStyle);
          if (parsed.itineraryType) setItineraryType(parsed.itineraryType);
          if (parsed.pickupTime) setPickupTime(parsed.pickupTime);
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
        pickupZip, schoolName, gradeLevel, scheduleType, amTime, pmTime, startDate, studentCount, schoolDurationType,
        // Medical fields
        pickupLocation, dropoffLocation, mobilityLevel, appointmentDate, appointmentTime, serviceLevel, tripType,
        // Wedding fields
        guestCount, eventDate, hotelZip, venueZip, vehicleStyle, itineraryType, pickupTime
      };
      sessionStorage.setItem('businto_form_draft', JSON.stringify(draft));
    }
  }, [activeTab, pickupZip, schoolName, gradeLevel, scheduleType, amTime, pmTime, startDate, studentCount, schoolDurationType,
    pickupLocation, dropoffLocation, mobilityLevel, appointmentDate, appointmentTime, serviceLevel, tripType,
    guestCount, eventDate, hotelZip, venueZip, vehicleStyle, itineraryType, pickupTime, isSubmitted]);

  const handleSubmit = async () => {
    // Reset errors
    setValidationErrors({});
    setSubmitError(null);

    // Build request data based on service type
    let requestData: any;

    if (activeTab === 'school') {
      const schoolMetadata = {
        school_name: schoolName,
        grade_level: gradeLevel,
        student_count: parseInt(studentCount) || 1,
        schedule_type: scheduleType,
        am_pickup_time: amTime,
        pm_pickup_time: pmTime,
        duration_type: schoolDurationType,
        note: note || undefined,
        // Private fields - will be split out
        parent_name: user?.name,
        parent_email: user?.email,
      };

      const { metadata_safe, metadata_private } = splitMetadataByServiceType('school', schoolMetadata);

      requestData = {
        service_type: 'school' as const,
        pickup_address: pickupZip,
        dropoff_address: schoolName,
        pickup_fuzzy: pickupZip,
        dropoff_fuzzy: schoolName,
        start_date: startDate,
        start_time: amTime,
        is_recurring: schoolDurationType !== 'custom',
        recurrence_pattern: schoolDurationType === 'daily' ? 'weekdays' : schoolDurationType,
        metadata: schoolMetadata, // For backward compatibility
        metadata_safe,
        metadata_private,
      };
    } else if (activeTab === 'medical') {
      const medicalMetadata = {
        mobility_level: mobilityLevel,
        service_level: serviceLevel,
        trip_type: tripType,
        appointment_time: appointmentTime,
        note: note || undefined,
        // Private fields - will be split out
        patient_name: user?.name || 'Patient',
        contact_email: user?.email,
      };

      const { metadata_safe, metadata_private } = splitMetadataByServiceType('medical', medicalMetadata);

      requestData = {
        service_type: 'medical' as const,
        pickup_address: pickupLocation,
        dropoff_address: dropoffLocation,
        pickup_fuzzy: pickupLocation,
        dropoff_fuzzy: dropoffLocation,
        start_date: appointmentDate,
        start_time: appointmentTime,
        is_recurring: medicalDurationType !== 'one-time',
        recurrence_pattern: medicalDurationType,
        metadata: medicalMetadata, // For backward compatibility
        metadata_safe,
        metadata_private,
      };
    } else {
      // wedding
      const weddingMetadata = {
        guest_count: parseInt(guestCount) || 1,
        vehicle_style: vehicleStyle,
        itinerary_type: itineraryType,
        pickup_time: pickupTime,
        note: note || undefined,
        // Private fields - will be split out
        contact_name: user?.name || 'Event Coordinator',
        contact_phone: '555-0000', // Phone not available in user object
        contact_email: user?.email || 'event@example.com',
      };

      const { metadata_safe, metadata_private } = splitMetadataByServiceType('wedding', weddingMetadata);

      requestData = {
        service_type: 'wedding' as const,
        pickup_address: hotelZip,
        dropoff_address: venueZip,
        pickup_fuzzy: hotelZip,
        dropoff_fuzzy: venueZip,
        start_date: eventDate,
        start_time: pickupTime,
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
        return { text: "Find School Bus", color: "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20" };
      case "medical":
        return { text: "Find Care Ride", color: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20" };
      case "wedding":
        return { text: "Check Shuttle Prices", color: "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20" };
      default:
        return { text: "Check Availability", color: "bg-neutral-950 hover:bg-black shadow-black/20" };
    }
  };

  const cta = getCTA();

  return (
    <section
      className="relative pt-24 pb-32 px-4 overflow-hidden bg-white selection:bg-orange-100 selection:text-orange-900"
    >

      <div className="container mx-auto max-w-7xl relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          {/* Left Column - Content */}
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000 ease-out">

            {!user && (
              <>
                <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-neutral-900 mb-6 leading-[1.1] font-[family-name:var(--font-dm-sans)]">
                  Smarter routing for private rides.
                </h1>
                <p className="text-base md:text-lg text-neutral-500 mb-10 leading-relaxed font-medium max-w-lg">
                  School runs, medical transports, and full-day charters managed by one intelligent platform.
                </p>
              </>
            )}

            <div className="mb-14 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300 fill-mode-both">
              <div className="bg-white rounded-lg p-7 md:p-10 shadow-sm ring-1 ring-black/[0.02] relative transition-colors duration-150">

                <ServiceSwitcher activeTab={activeTab} onTabChange={setActiveTab} />

                <div className="mt-12 min-h-[120px] transition-all duration-300">
                  {activeTab === "school" && (
                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-500">
                      {/* Row 1: Locations */}
                      <div className="flex flex-wrap gap-4">
                        <div className="flex-1 min-w-[160px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Pickup Address</label>
                          <LocationInput
                            placeholder="Your home address..."
                            value={pickupZip}
                            onSelect={(addr) => setPickupZip(addr)}
                            className="h-9 rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-4 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                        <div className="flex-1 min-w-[160px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Target School</label>
                          <LocationInput
                            placeholder="Search for school..."
                            value={schoolName}
                            onSelect={(addr) => setSchoolName(addr)}
                            className="h-9 rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-4 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                        <div className="w-[120px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Grade Level</label>
                          <Select value={gradeLevel} onValueChange={setGradeLevel}>
                            <SelectTrigger className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus:ring-0 px-3 text-sm text-neutral-900 font-medium overflow-hidden transition-colors duration-150 focus:bg-white focus:border-neutral-300">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-lg border-neutral-100 shadow-sm p-2">
                              <SelectItem value="k" className="rounded-md py-3 px-4">Kindergarten</SelectItem>
                              <SelectItem value="elem" className="rounded-md py-3 px-4">Elementary (1-5)</SelectItem>
                              <SelectItem value="middle" className="rounded-md py-3 px-4">Middle (6-8)</SelectItem>
                              <SelectItem value="high" className="rounded-md py-3 px-4">High (9-12)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* Row 2: Schedule & Service Details */}
                      <div className="flex flex-wrap gap-4">
                        <div className="w-[120px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Schedule</label>
                          <Select value={scheduleType} onValueChange={setScheduleType}>
                            <SelectTrigger className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus:ring-0 px-3 text-sm text-neutral-900 font-medium overflow-hidden transition-colors duration-150 focus:bg-white focus:border-neutral-300">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-lg border-neutral-100 shadow-sm p-2">
                              <SelectItem value="round-trip" className="rounded-md py-3 px-4">Round Trip</SelectItem>
                              <SelectItem value="am-only" className="rounded-md py-3 px-4">AM Only</SelectItem>
                              <SelectItem value="pm-only" className="rounded-md py-3 px-4">PM Only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-[80px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Students</label>
                          <Input
                            type="number"
                            placeholder="1"
                            min="1"
                            value={studentCount}
                            onChange={(e) => setStudentCount(e.target.value)}
                            className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                        <div className="w-[140px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Service Type</label>
                          <Select value={schoolDurationType} onValueChange={setSchoolDurationType}>
                            <SelectTrigger className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus:ring-0 px-3 text-sm text-neutral-900 font-medium overflow-hidden transition-colors duration-150 focus:bg-white focus:border-neutral-300">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-lg border-neutral-100 shadow-sm p-2">
                              <SelectItem value="daily" className="rounded-md py-3 px-4">Daily (Weekdays)</SelectItem>
                              <SelectItem value="weekly" className="rounded-md py-3 px-4">Weekly</SelectItem>
                              <SelectItem value="monthly" className="rounded-md py-3 px-4">Monthly</SelectItem>
                              <SelectItem value="semester" className="rounded-md py-3 px-4">Full Semester</SelectItem>
                              <SelectItem value="custom" className="rounded-md py-3 px-4">Custom Dates</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {schoolDurationType !== "custom" && schoolDurationType !== "semester" && (
                          <div className="w-[100px] space-y-2">
                            <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">
                              {schoolDurationType === "daily" ? "# of Days" : schoolDurationType === "weekly" ? "# of Weeks" : "# of Months"}
                            </label>
                            <Input
                              type="number"
                              placeholder="Enter"
                              min="1"
                              value={schoolDurationValue}
                              onChange={(e) => setSchoolDurationValue(e.target.value)}
                              className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                            />
                          </div>
                        )}
                      </div>
                      {/* Row 3: Times & Dates */}
                      <div className="flex flex-wrap gap-4">
                        <div className="w-[110px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">AM Pickup</label>
                          <Input
                            type="time"
                            value={amTime}
                            onChange={(e) => setAmTime(e.target.value)}
                            className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                        <div className="w-[110px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">PM Pickup</label>
                          <Input
                            type="time"
                            value={pmTime}
                            onChange={(e) => setPmTime(e.target.value)}
                            className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                        <div className="w-[140px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Start Date</label>
                          <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                        {schoolDurationType === "custom" && (
                          <div className="w-[150px] space-y-2">
                            <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Pick Dates</label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="h-9 w-full rounded-lg bg-white border border-neutral-200 focus:ring-0 px-3 text-sm text-neutral-900 font-medium justify-start transition-colors duration-150 hover:bg-white"
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {schoolCustomDates.length > 0 ? `${schoolCustomDates.length} dates` : "Select"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <DayPicker
                                  mode="multiple"
                                  selected={schoolCustomDates}
                                  onSelect={(dates) => setSchoolCustomDates(dates || [])}
                                  className="p-3"
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        )}
                      </div>
                      {/* Row 4: Note */}
                      <div className="flex flex-wrap gap-4">
                        <div className="flex-1 space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Additional Note (Optional)</label>
                          <Input
                            type="text"
                            placeholder="Any special requirements or instructions..."
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-4 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "medical" && (
                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-500">
                      {/* Row 1: Locations */}
                      <div className="flex flex-wrap gap-4">
                        <div className="flex-1 min-w-[200px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Pickup Location</label>
                          <LocationInput
                            placeholder="Home address..."
                            value={pickupLocation}
                            onSelect={(addr) => setPickupLocation(addr)}
                            className="h-9 rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-4 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                        <div className="flex-1 min-w-[200px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Dropoff Location</label>
                          <LocationInput
                            placeholder="Hospital or clinic..."
                            value={dropoffLocation}
                            onSelect={(addr) => setDropoffLocation(addr)}
                            className="h-9 rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-4 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                      </div>
                      {/* Row 2: Mobility & Service Details */}
                      <div className="flex flex-wrap gap-4">
                        <div className="w-[110px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Access Type</label>
                          <Select value={mobilityLevel} onValueChange={setMobilityLevel}>
                            <SelectTrigger className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus:ring-0 px-3 text-sm text-neutral-900 font-medium overflow-hidden transition-colors duration-150 focus:bg-white focus:border-neutral-300">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-lg border-neutral-100 shadow-sm p-2">
                              <SelectItem value="ambulatory" className="rounded-md py-3 px-4 font-bold">Ambulatory</SelectItem>
                              <SelectItem value="wheelchair" className="rounded-md py-3 px-4 font-bold">Wheelchair</SelectItem>
                              <SelectItem value="stretcher" className="rounded-md py-3 px-4 font-bold">Stretcher</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-[120px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Service Level</label>
                          <Select value={serviceLevel} onValueChange={setServiceLevel}>
                            <SelectTrigger className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus:ring-0 px-3 text-sm text-neutral-900 font-medium overflow-hidden transition-colors duration-150 focus:bg-white focus:border-neutral-300">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-lg border-neutral-100 shadow-sm p-2">
                              <SelectItem value="curb-to-curb" className="rounded-md py-3 px-4 font-bold">Curb-to-Curb</SelectItem>
                              <SelectItem value="door-to-door" className="rounded-md py-3 px-4 font-bold">Door-to-Door</SelectItem>
                              <SelectItem value="door-through-door" className="rounded-md py-3 px-4 font-bold">Door-Through-Door</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-[100px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Trip Type</label>
                          <Select value={tripType} onValueChange={setTripType}>
                            <SelectTrigger className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus:ring-0 px-3 text-sm text-neutral-900 font-medium overflow-hidden transition-colors duration-150 focus:bg-white focus:border-neutral-300">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-lg border-neutral-100 shadow-sm p-2">
                              <SelectItem value="one-way" className="rounded-md py-3 px-4 font-bold">One-Way</SelectItem>
                              <SelectItem value="round-trip" className="rounded-md py-3 px-4 font-bold">Round Trip</SelectItem>
                              <SelectItem value="wait-and-return" className="rounded-md py-3 px-4 font-bold">Wait & Return</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-[110px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Service Type</label>
                          <Select value={medicalDurationType} onValueChange={setMedicalDurationType}>
                            <SelectTrigger className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus:ring-0 px-3 text-sm text-neutral-900 font-medium overflow-hidden transition-colors duration-150 focus:bg-white focus:border-neutral-300">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-lg border-neutral-100 shadow-sm p-2">
                              <SelectItem value="one-time" className="rounded-md py-3 px-4 font-bold">One-Time</SelectItem>
                              <SelectItem value="recurring" className="rounded-md py-3 px-4 font-bold">Recurring</SelectItem>
                              <SelectItem value="weekly" className="rounded-md py-3 px-4 font-bold">Weekly</SelectItem>
                              <SelectItem value="custom" className="rounded-md py-3 px-4 font-bold">Custom Dates</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* Row 3: Times & Dates */}
                      <div className="flex flex-wrap gap-4">
                        <div className="w-[110px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Appt Time</label>
                          <Input
                            type="time"
                            value={appointmentTime}
                            onChange={(e) => setAppointmentTime(e.target.value)}
                            className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                        {medicalDurationType !== "one-time" && medicalDurationType !== "custom" && (
                          <div className="w-[100px] space-y-2">
                            <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">
                              {medicalDurationType === "recurring" ? "# of Trips" : "# of Weeks"}
                            </label>
                            <Input
                              type="number"
                              placeholder="Enter"
                              min="1"
                              value={medicalDurationValue}
                              onChange={(e) => setMedicalDurationValue(e.target.value)}
                              className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                            />
                          </div>
                        )}
                        <div className="w-[140px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Appt Date</label>
                          <Input
                            type="date"
                            value={appointmentDate}
                            onChange={(e) => setAppointmentDate(e.target.value)}
                            className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                        {medicalDurationType === "custom" && (
                          <div className="w-[150px] space-y-2">
                            <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Pick Dates</label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="h-9 w-full rounded-lg bg-white border border-neutral-200 focus:ring-0 px-3 text-sm text-neutral-900 font-medium justify-start transition-colors duration-150 hover:bg-white"
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
                      {/* Row 4: Note */}
                      <div className="flex flex-wrap gap-4">
                        <div className="flex-1 space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Additional Note (Optional)</label>
                          <Input
                            type="text"
                            placeholder="Any special requirements or instructions..."
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-4 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "wedding" && (
                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-500">
                      {/* Row 1: Locations */}
                      <div className="flex flex-wrap gap-4">
                        <div className="flex-1 min-w-[200px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Hotel / Pickup</label>
                          <LocationInput
                            placeholder="Hotel or starting point..."
                            value={hotelZip}
                            onSelect={(addr) => setHotelZip(addr)}
                            className="h-9 rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-4 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                        <div className="flex-1 min-w-[200px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Venue Location</label>
                          <LocationInput
                            placeholder="Event venue..."
                            value={venueZip}
                            onSelect={(addr) => setVenueZip(addr)}
                            className="h-9 rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-4 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                      </div>
                      {/* Row 2: Event Details */}
                      <div className="flex flex-wrap gap-4">
                        <div className="w-[80px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Guests</label>
                          <Input
                            type="number"
                            placeholder="0"
                            min="1"
                            value={guestCount}
                            onChange={(e) => setGuestCount(e.target.value)}
                            className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                        <div className="w-[110px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Vehicle Style</label>
                          <Select value={vehicleStyle} onValueChange={setVehicleStyle}>
                            <SelectTrigger className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus:ring-0 px-3 text-sm text-neutral-900 font-medium overflow-hidden transition-colors duration-150 focus:bg-white focus:border-neutral-300">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-lg border-neutral-100 shadow-sm p-2">
                              <SelectItem value="shuttle" className="rounded-md py-3 px-4 font-bold">Shuttle Bus</SelectItem>
                              <SelectItem value="coach" className="rounded-md py-3 px-4 font-bold">Motor Coach</SelectItem>
                              <SelectItem value="limo" className="rounded-md py-3 px-4 font-bold">Limousine</SelectItem>
                              <SelectItem value="party-bus" className="rounded-md py-3 px-4 font-bold">Party Bus</SelectItem>
                              <SelectItem value="vintage" className="rounded-md py-3 px-4 font-bold">Vintage/Classic</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-[130px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Itinerary</label>
                          <Select value={itineraryType} onValueChange={setItineraryType}>
                            <SelectTrigger className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus:ring-0 px-3 text-sm text-neutral-900 font-medium overflow-hidden transition-colors duration-150 focus:bg-white focus:border-neutral-300">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-lg border-neutral-100 shadow-sm p-2">
                              <SelectItem value="hotel-to-venue" className="rounded-md py-3 px-4 font-bold">Hotel to Venue</SelectItem>
                              <SelectItem value="venue-to-hotel" className="rounded-md py-3 px-4 font-bold">Venue to Hotel</SelectItem>
                              <SelectItem value="shuttle-service" className="rounded-md py-3 px-4 font-bold">Shuttle Service</SelectItem>
                              <SelectItem value="full-day" className="rounded-md py-3 px-4 font-bold">Full Day Charter</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-[110px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Event Type</label>
                          <Select value={eventDurationType} onValueChange={setEventDurationType}>
                            <SelectTrigger className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus:ring-0 px-3 text-sm text-neutral-900 font-medium overflow-hidden transition-colors duration-150 focus:bg-white focus:border-neutral-300">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-lg border-neutral-100 shadow-sm p-2">
                              <SelectItem value="single-day" className="rounded-md py-3 px-4 font-bold">Single Day</SelectItem>
                              <SelectItem value="multi-day" className="rounded-md py-3 px-4 font-bold">Multi-Day Event</SelectItem>
                              <SelectItem value="weekend" className="rounded-md py-3 px-4 font-bold">Full Weekend</SelectItem>
                              <SelectItem value="custom" className="rounded-md py-3 px-4 font-bold">Custom Dates</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* Row 3: Times & Dates */}
                      <div className="flex flex-wrap gap-4">
                        <div className="w-[110px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Pickup Time</label>
                          <Input
                            type="time"
                            value={pickupTime}
                            onChange={(e) => setPickupTime(e.target.value)}
                            className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                        {eventDurationType === "multi-day" && (
                          <div className="w-[100px] space-y-2">
                            <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1"># of Days</label>
                            <Input
                              type="number"
                              placeholder="Enter"
                              min="2"
                              value={eventDurationDays}
                              onChange={(e) => setEventDurationDays(e.target.value)}
                              className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-3 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                            />
                          </div>
                        )}
                        <div className="w-[140px] space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Event Date</label>
                          <Input
                            type="date"
                            value={eventDate}
                            onChange={(e) => setEventDate(e.target.value)}
                            className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-3 text-sm text-neutral-900 font-medium transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                        {eventDurationType === "custom" && (
                          <div className="w-[150px] space-y-2">
                            <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Pick Dates</label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="h-9 w-full rounded-lg bg-white border border-neutral-200 focus:ring-0 px-3 text-sm text-neutral-900 font-medium justify-start transition-colors duration-150 hover:bg-white"
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {eventCustomDates.length > 0 ? `${eventCustomDates.length} dates` : "Select"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <DayPicker
                                  mode="multiple"
                                  selected={eventCustomDates}
                                  onSelect={(dates) => setEventCustomDates(dates || [])}
                                  className="p-3"
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        )}
                      </div>
                      {/* Row 4: Note */}
                      <div className="flex flex-wrap gap-4">
                        <div className="flex-1 space-y-2">
                          <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.15em] ml-1">Additional Note (Optional)</label>
                          <Input
                            type="text"
                            placeholder="Any special requirements or instructions..."
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="h-9 w-full rounded-lg bg-neutral-50 border border-neutral-200 focus-visible:ring-0 px-4 text-sm text-neutral-900 font-medium placeholder:text-neutral-400 transition-colors duration-150 focus:bg-white focus:border-neutral-300"
                          />
                        </div>
                      </div>
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
                      className={`w-full h-10 rounded-md text-white transition-colors duration-150 shadow-sm font-semibold text-base relative overflow-hidden ${cta.color} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <span className="relative z-10 flex items-center justify-center gap-3">
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
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
                      <div className="bg-neutral-900 rounded-lg overflow-hidden text-white shadow-sm relative">
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                          {activeTab === 'school' && <Bus className="w-32 h-32" />}
                          {activeTab === 'medical' && <HeartPulse className="w-32 h-32" />}
                          {activeTab === 'wedding' && <Gem className="w-32 h-32" />}
                        </div>
                        <div className="p-8 space-y-6 relative z-10">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <div className={cn(
                                "text-[10px] font-black uppercase tracking-[0.2em]",
                                activeTab === 'school' && "text-amber-500",
                                activeTab === 'medical' && "text-sky-400",
                                activeTab === 'wedding' && "text-indigo-400"
                              )}>
                                Request #{submittedData?.id?.slice(0, 6)}
                              </div>
                              <h3 className="text-2xl font-semibold tracking-tight">Trip Submitted!</h3>
                            </div>
                            <div className="h-12 w-12 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/20">
                              <CheckCircle2 className="h-6 w-6 text-white" />
                            </div>
                          </div>
                          <p className="text-neutral-400 text-sm">
                            Broadcasting to 50+ local operators. You'll be notified when quotes arrive.
                          </p>
                        </div>
                        <div className={cn(
                          "p-4 text-center border-t",
                          activeTab === 'school' && "bg-amber-500/10 border-amber-500/20",
                          activeTab === 'medical' && "bg-sky-500/10 border-sky-500/20",
                          activeTab === 'wedding' && "bg-indigo-500/10 border-indigo-500/20"
                        )}>
                          <div className={cn(
                            "text-[10px] font-black uppercase tracking-[0.3em]",
                            activeTab === 'school' && "text-amber-400",
                            activeTab === 'medical' && "text-sky-400",
                            activeTab === 'wedding' && "text-indigo-400"
                          )}>
                            Status: Matching Operators
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          className="flex-1 h-10 rounded-md font-semibold"
                          onClick={() => setIsSubmitted(false)}
                        >
                          Submit Another
                        </Button>
                        <Button
                          className="flex-1 h-10 rounded-md font-semibold bg-black text-white"
                          onClick={() => window.dispatchEvent(new CustomEvent('open-trips-sidebar'))}
                        >
                          View Trips
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - AI Dispatch Interface */}
          <div className="relative animate-in fade-in slide-in-from-right-8 duration-1000 delay-400 ease-out lg:pl-10">
            <div className="relative z-10 h-[640px]">
              <AIChatPanel />
            </div>
          </div>
        </div>

        {/* Recent Trips Section - Only for logged-in users */}
        {user && recentTrips.length > 0 && (
          <div className="mt-16 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">Recent Trips</h2>
              <a href="/trips" className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors">
                View all <ArrowRight className="inline-block w-4 h-4 ml-1" />
              </a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recentTrips.map((trip) => (
                <Card key={trip.id} className="p-5 hover:shadow-lg transition-shadow duration-200">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center",
                        trip.service_type === 'school' && "bg-amber-100 text-amber-600",
                        trip.service_type === 'medical' && "bg-sky-100 text-sky-600",
                        trip.service_type === 'wedding' && "bg-indigo-100 text-indigo-600"
                      )}>
                        {trip.service_type === 'school' ? <Bus className="h-4 w-4" /> :
                          trip.service_type === 'medical' ? <HeartPulse className="h-4 w-4" /> :
                            <Plane className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="font-mono text-xs text-neutral-500">#{trip.id.slice(0, 8)}</div>
                        <Badge variant="outline" className={cn(
                          "text-xs",
                          trip.service_type === 'school' && "bg-amber-50 text-amber-700",
                          trip.service_type === 'medical' && "bg-sky-50 text-sky-700",
                          trip.service_type === 'wedding' && "bg-indigo-50 text-indigo-700"
                        )}>
                          {trip.service_type === 'school' ? 'School Run' :
                            trip.service_type === 'medical' ? 'Care Ride' : 'Event Shuttle'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="mb-3">
                    <Badge className={cn(
                      "text-xs",
                      trip.status === 'pending' && "bg-yellow-500",
                      trip.status === 'matched' && "bg-purple-500",
                      trip.status === 'booked' && "bg-green-500",
                      trip.status === 'completed' && "bg-neutral-500"
                    )}>
                      {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
                    </Badge>
                  </div>

                  {/* Location */}
                  <div className="space-y-2 mb-3">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 text-neutral-400 mt-0.5 flex-shrink-0" />
                      <div className="text-xs">
                        <div className="font-medium text-neutral-900 line-clamp-1">{trip.pickup_address || 'Not specified'}</div>
                        {trip.dropoff_address && (
                          <>
                            <div className="text-neutral-400 my-0.5">→</div>
                            <div className="font-medium text-neutral-900 line-clamp-1">{trip.dropoff_address}</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Date & Time */}
                  <div className="flex items-center gap-3 text-xs text-neutral-600 pt-3 border-t border-neutral-100">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(trip.start_date || trip.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    {trip.start_time && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {trip.start_time.slice(0, 5)}
                      </div>
                    )}
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