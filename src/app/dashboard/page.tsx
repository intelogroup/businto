"use client";
import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ServiceSwitcher } from "@/components/service-switcher";
import { LocationInput } from "@/components/location-input";
import { DayPicker } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { validateTransportRequest } from '@/lib/validation';
import { splitMetadataByServiceType } from '@/lib/metadata-helpers';

import { useAuth } from "@/hooks/use-auth";
import { useTransportRequests } from "@/hooks/use-transport-requests";
import { useNotifications } from "@/hooks/use-notifications";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    ArrowRight,
    HeartPulse,
    Gem,
    CalendarIcon,
    Loader2,
    MapPin,
    Calendar,
    Clock,
    Bus,
    Heart,
    Plane
} from "lucide-react";
import { AIChatPanel } from "@/components/dashboard/ai-chat-panel";

function DashboardContent() {
    const { user } = useAuth();
    const { createRequest } = useTransportRequests();
    const { addNotification } = useNotifications();
    const searchParams = useSearchParams();
    const serviceParam = searchParams.get('service');
    const [activeTab, setActiveTab] = useState("school");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Auto-select service from URL parameter
    useEffect(() => {
        if (serviceParam && ['school', 'medical', 'wedding'].includes(serviceParam)) {
            setActiveTab(serviceParam);
        }
    }, [serviceParam]);

    // School fields
    const [pickupZip, setPickupZip] = useState("");
    const [schoolName, setSchoolName] = useState("");
    const [gradeLevel, setGradeLevel] = useState("middle");
    const [scheduleType, setScheduleType] = useState("round-trip");
    const [amTime, setAmTime] = useState("07:45");
    const [pmTime, setPmTime] = useState("15:00");
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [studentCount, setStudentCount] = useState("");
    const [schoolDurationType, setSchoolDurationType] = useState("daily");
    const [schoolDurationValue, setSchoolDurationValue] = useState("");
    const [schoolCustomDates, setSchoolCustomDates] = useState<Date[]>([]);

    // Medical fields
    const [pickupLocation, setPickupLocation] = useState("");
    const [dropoffLocation, setDropoffLocation] = useState("");
    const [wheelchairType, setWheelchairType] = useState("");
    const [appointmentTime, setAppointmentTime] = useState("");
    const [appointmentDate, setAppointmentDate] = useState("");
    const [serviceLevel, setServiceLevel] = useState("curb-to-curb");
    const [tripType, setTripType] = useState("round-trip");
    const [medicalDurationType, setMedicalDurationType] = useState("one-time");
    const [medicalDurationValue, setMedicalDurationValue] = useState("");
    const [medicalCustomDates, setMedicalCustomDates] = useState<Date[]>([]);

    // Event fields
    const [guestCount, setGuestCount] = useState("");
    const [eventDate, setEventDate] = useState("");
    const [hotelZip, setHotelZip] = useState("");
    const [venueZip, setVenueZip] = useState("");
    const [vehicleStyle, setVehicleStyle] = useState("");
    const [itineraryType, setItineraryType] = useState("transfer");
    const [pickupTime, setPickupTime] = useState("");
    const [eventDurationType, setEventDurationType] = useState("single-day");
    const [eventDurationDays, setEventDurationDays] = useState("");
    const [eventCustomDates, setEventCustomDates] = useState<Date[]>([]);
    const [recentTrips, setRecentTrips] = useState<any[]>([]);

    // Fetch recent trips
    useEffect(() => {
        const fetchRecentTrips = async () => {
            try {
                const response = await fetch('/api/requests');
                if (response.ok) {
                    const result = await response.json();
                    const trips = Array.isArray(result) ? result : (result.requests || []);
                    setRecentTrips(trips.slice(0, 6)); // Show 6 most recent
                }
            } catch (error) {
                console.error('Error fetching recent trips:', error);
            }
        };
        fetchRecentTrips();
    }, []);

    const handleSubmit = async () => {
        if (isSubmitting) return;

        try {
            setIsSubmitting(true);

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
                    // Private fields from user context
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
                    metadata: schoolMetadata,
                    metadata_safe,
                    metadata_private,
                };
            } else if (activeTab === 'medical') {
                const medicalMetadata = {
                    mobility_level: wheelchairType || 'ambulatory',
                    service_level: serviceLevel,
                    trip_type: tripType,
                    appointment_time: appointmentTime,
                    // Private fields from user context
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
                    metadata: medicalMetadata,
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
                    // Private fields from user context
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
                    metadata: weddingMetadata,
                    metadata_safe,
                    metadata_private,
                };
            }

            // Validate using Zod
            console.log('Submitting request:', requestData);
            const validation = validateTransportRequest(requestData);

            if (!validation.success) {
                const errorMessages = Object.values(validation.errors).slice(0, 3).join(', ');
                addNotification({
                    title: "Validation Error",
                    message: errorMessages || "Please fill in all required fields correctly",
                    type: "error"
                });
                return;
            }

            await createRequest(validation.data as any);
            addNotification({ title: "Request Submitted!", message: "Operators are being notified. Quotes will appear below.", type: "success" });

            // Dispatch event for tracking panel to refresh
            window.dispatchEvent(new CustomEvent('new-transport-request'));
        } catch (error: any) {
            addNotification({ title: "Error", message: error.message || "Failed to submit request", type: "error" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const getCTA = () => {
        switch (activeTab) {
            case "school":
                return { text: isSubmitting ? "Submitting..." : "Find School Bus", color: "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20" };
            case "medical":
                return { text: isSubmitting ? "Submitting..." : "Find Care Ride", color: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20" };
            case "wedding":
                return { text: isSubmitting ? "Submitting..." : "Check Shuttle Prices", color: "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20" };
            default:
                return { text: isSubmitting ? "Submitting..." : "Check Availability", color: "bg-neutral-950 hover:bg-black shadow-black/20" };
        }
    };

    const cta = getCTA();

    return (
        <div className="min-h-screen bg-[#F9FAFB]">
            <Navbar />

            <main className="pt-20 sm:pt-24 pb-12 sm:pb-20 container mx-auto max-w-[1600px] px-4 sm:px-8 md:px-12 lg:px-16 font-sans">


                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Main Content - Service Cards */}
                    <div className="bg-white rounded-xl p-4 sm:p-5 shadow-sm ring-1 ring-black/[0.03] flex flex-col h-auto lg:max-h-[550px]">
                        <ServiceSwitcher activeTab={activeTab} onTabChange={setActiveTab} />

                        <div className="mt-3 flex-1 flex flex-col">
                            {activeTab === "school" && (
                                <div className="grid grid-cols-4 gap-x-3 gap-y-3 flex-1 content-start">
                                    <div className="col-span-2 space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Pickup Address</label>
                                        <LocationInput placeholder="Home address..." value={pickupZip} onSelect={(addr) => setPickupZip(addr)} className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm" />
                                    </div>
                                    <div className="col-span-2 space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">School</label>
                                        <LocationInput placeholder="Search school..." value={schoolName} onSelect={(addr) => setSchoolName(addr)} className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Grade Level</label>
                                        <Select value={gradeLevel} onValueChange={setGradeLevel}>
                                            <SelectTrigger className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="k">Kindergarten</SelectItem>
                                                <SelectItem value="elem">Elementary</SelectItem>
                                                <SelectItem value="middle">Middle School</SelectItem>
                                                <SelectItem value="high">High School</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Schedule Type</label>
                                        <Select value={scheduleType} onValueChange={setScheduleType}>
                                            <SelectTrigger className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="round-trip">Round Trip</SelectItem>
                                                <SelectItem value="am-only">AM Only</SelectItem>
                                                <SelectItem value="pm-only">PM Only</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">AM Pickup Time</label>
                                        <Input type="time" value={amTime} onChange={(e) => setAmTime(e.target.value)} className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">PM Pickup Time</label>
                                        <Input type="time" value={pmTime} onChange={(e) => setPmTime(e.target.value)} className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Students</label>
                                        <Input type="number" placeholder="1" min="1" value={studentCount} onChange={(e) => setStudentCount(e.target.value)} className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Start Date</label>
                                        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm" />
                                    </div>
                                </div>
                            )}

                            {activeTab === "medical" && (
                                <div className="grid grid-cols-4 gap-x-3 gap-y-3 flex-1 content-start">
                                    <div className="col-span-2 space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Pickup Location</label>
                                        <LocationInput placeholder="Home address..." value={pickupLocation} onSelect={(addr) => setPickupLocation(addr)} className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm" />
                                    </div>
                                    <div className="col-span-2 space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Destination</label>
                                        <LocationInput placeholder="Hospital/clinic..." value={dropoffLocation} onSelect={(addr) => setDropoffLocation(addr)} className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Access Type</label>
                                        <Select value={wheelchairType} onValueChange={setWheelchairType}>
                                            <SelectTrigger className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ambulatory">Ambulatory</SelectItem>
                                                <SelectItem value="standard">Wheelchair</SelectItem>
                                                <SelectItem value="oversized">Power Chair</SelectItem>
                                                <SelectItem value="stretcher">Stretcher</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Service Level</label>
                                        <Select value={serviceLevel} onValueChange={setServiceLevel}>
                                            <SelectTrigger className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="curb-to-curb">Curb-to-Curb</SelectItem>
                                                <SelectItem value="door-to-door">Door-to-Door</SelectItem>
                                                <SelectItem value="door-through-door">Door-Through</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Trip Type</label>
                                        <Select value={tripType} onValueChange={setTripType}>
                                            <SelectTrigger className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="one-way">One-Way</SelectItem>
                                                <SelectItem value="round-trip">Round Trip</SelectItem>
                                                <SelectItem value="wait-and-return">Wait & Return</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Appointment Time</label>
                                        <Input type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Frequency</label>
                                        <Select value={medicalDurationType} onValueChange={setMedicalDurationType}>
                                            <SelectTrigger className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="one-time">One-Time</SelectItem>
                                                <SelectItem value="recurring">Recurring</SelectItem>
                                                <SelectItem value="weekly">Weekly</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Appointment Date</label>
                                        <Input type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm" />
                                    </div>
                                </div>
                            )}

                            {activeTab === "wedding" && (
                                <div className="grid grid-cols-4 gap-x-3 gap-y-3 flex-1 content-start">
                                    <div className="col-span-2 space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Hotel / Pickup</label>
                                        <LocationInput placeholder="Hotel..." value={hotelZip} onSelect={(addr) => setHotelZip(addr)} className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm" />
                                    </div>
                                    <div className="col-span-2 space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Venue</label>
                                        <LocationInput placeholder="Venue..." value={venueZip} onSelect={(addr) => setVenueZip(addr)} className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Guest Count</label>
                                        <Input type="number" placeholder="50" min="1" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Vehicle Style</label>
                                        <Select value={vehicleStyle} onValueChange={setVehicleStyle}>
                                            <SelectTrigger className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="shuttle">Shuttle</SelectItem>
                                                <SelectItem value="coach">Coach</SelectItem>
                                                <SelectItem value="limo">Limo</SelectItem>
                                                <SelectItem value="party-bus">Party Bus</SelectItem>
                                                <SelectItem value="vintage">Vintage</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Itinerary</label>
                                        <Select value={itineraryType} onValueChange={setItineraryType}>
                                            <SelectTrigger className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="transfer">Transfer Only</SelectItem>
                                                <SelectItem value="shuttle-service">Shuttle Service</SelectItem>
                                                <SelectItem value="full-day">Full Day</SelectItem>
                                                <SelectItem value="multi-stop">Multi-Stop</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Pickup Time</label>
                                        <Input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Event Type</label>
                                        <Select value={eventDurationType} onValueChange={setEventDurationType}>
                                            <SelectTrigger className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="single-day">Single Day</SelectItem>
                                                <SelectItem value="multi-day">Multi-Day</SelectItem>
                                                <SelectItem value="weekend">Weekend</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-neutral-500">Event Date</label>
                                        <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="h-9 rounded-md bg-white border-neutral-200 px-3 text-sm" />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mt-auto pt-3">
                            <Button
                                size="lg"
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className={`w-full h-11 rounded-lg text-white font-semibold shadow-sm ${cta.color}`}
                            >
                                {cta.text}
                                {isSubmitting ? (
                                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                                ) : (
                                    <ArrowRight className="h-4 w-4 ml-2" />
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Sidebar Content - AI Chat Panel */}
                    <div className="h-[300px] sm:h-[400px] lg:max-h-[550px]">
                        <AIChatPanel />
                    </div>
                </div>

                {/* Recent Trips Section */}
                {recentTrips.length > 0 && (
                    <div className="mt-8">
                        <h2 className="text-2xl font-bold text-neutral-900 mb-4">Recent Trips</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {recentTrips.map((trip) => (
                                <Card key={trip.id} className="p-5 hover:shadow-lg transition-shadow duration-200">
                                    {/* Header */}
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${trip.service_type === 'school' ? 'bg-amber-100 text-amber-600' :
                                                trip.service_type === 'medical' ? 'bg-green-100 text-green-600' :
                                                    'bg-indigo-100 text-indigo-600'
                                                }`}>
                                                {trip.service_type === 'school' ? <Bus className="h-4 w-4" /> :
                                                    trip.service_type === 'medical' ? <Heart className="h-4 w-4" /> :
                                                        <Plane className="h-4 w-4" />}
                                            </div>
                                            <div>
                                                <div className="font-mono text-xs text-neutral-500">#{trip.id.slice(0, 8)}</div>
                                                <Badge variant="outline" className={`text-xs ${trip.service_type === 'school' ? 'bg-amber-50 text-amber-700' :
                                                    trip.service_type === 'medical' ? 'bg-green-50 text-green-700' :
                                                        'bg-indigo-50 text-indigo-700'
                                                    }`}>
                                                    {trip.service_type === 'school' ? 'School Run' :
                                                        trip.service_type === 'medical' ? 'Care Ride' : 'Event Shuttle'}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Status */}
                                    <div className="mb-3">
                                        <Badge className={`text-xs ${trip.status === 'pending' ? 'bg-yellow-500' :
                                            trip.status === 'matched' ? 'bg-purple-500' :
                                                trip.status === 'booked' ? 'bg-green-500' :
                                                    'bg-neutral-500'
                                            }`}>
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
            </main>
        </div>
    );
}

export default function DashboardPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#F9FAFB]" />}>
            <DashboardContent />
        </Suspense>
    );
}
