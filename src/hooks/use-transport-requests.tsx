"use client";

import { useState } from "react";

export interface TransportRequest {
    id: string;
    service_type: string;
    pickup_fuzzy_location: string;
    dropoff_fuzzy_location: string;
    pickup_exact_address: string;
    dropoff_exact_address: string;
    pickup_coords?: { lat: number; lng: number };
    trip_distance_miles?: number | null;
    estimated_duration_mins?: number | null;
    scheduled_date: string;
    scheduled_time?: string;
    created_at: string;
    status?: string;
    metadata?: Record<string, unknown>;
}

function getInitialRequests(): TransportRequest[] {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem('transport_requests');
    return stored ? JSON.parse(stored) : [];
}

export function useTransportRequests() {
    const [requests, setRequests] = useState<TransportRequest[]>(getInitialRequests);

    const createRequest = (request: TransportRequest) => {
        const newRequests = [request, ...requests];
        setRequests(newRequests);
        if (typeof window !== 'undefined') {
            localStorage.setItem('transport_requests', JSON.stringify(newRequests));
        }
    };

    return {
        requests,
        createRequest
    };
}
