"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './use-auth';

export interface TransportRequest {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  service_type: 'school' | 'medical' | 'wedding';
  pickup_fuzzy: string;
  dropoff_fuzzy: string;
  pickup_address: string;
  dropoff_address: string;
  start_date: string;
  start_time?: string;
  end_date?: string;
  is_recurring: boolean;
  recurrence_pattern?: string;
  metadata: Record<string, unknown>;
  status: 'pending' | 'quoted' | 'booked' | 'in_progress' | 'completed' | 'cancelled';
  expires_at: string;
  quotes?: Quote[];
}

export interface Quote {
  id: string;
  created_at: string;
  request_id: string;
  operator_id: string;
  total_price: number;
  base_fare?: number;
  distance_charge?: number;
  additional_fees?: { name: string; amount: number }[];
  vehicle_type: string;
  vehicle_year?: number;
  vehicle_capacity?: number;
  vehicle_photo_url?: string;
  wheelchair_accessible: boolean;
  note?: string;
  response_time_mins?: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expires_at: string;
  operator?: {
    id: string;
    full_name: string;
    company_name?: string;
    avatar_url?: string;
  };
}

export function useTransportRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<TransportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!user) {
      setRequests([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/requests?user_id=${user.id}`);
      const data = await response.json();

      if (response.ok) {
        setRequests(data.requests || []);
        setError(null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch requests');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const createRequest = async (requestData: {
    service_type: 'school' | 'medical' | 'wedding';
    pickup_address: string;
    dropoff_address: string;
    pickup_fuzzy?: string;
    dropoff_fuzzy?: string;
    start_date: string;
    start_time?: string;
    end_date?: string;
    is_recurring?: boolean;
    recurrence_pattern?: string;
    metadata?: Record<string, unknown>;
  }) => {
    if (!user) {
      throw new Error('Must be logged in to create a request');
    }

    const response = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...requestData,
        user_id: user.id
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create request');
    }

    // Refresh the list
    await fetchRequests();

    return data.request;
  };

  const acceptQuote = async (quoteId: string, requestId: string) => {
    const response = await fetch('/api/quotes/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId,
        tripRequestId: requestId,
        userId: user?.id
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to accept quote');
    }

    await fetchRequests();
    return data;
  };

  const declineQuote = async (quoteId: string) => {
    const response = await fetch('/api/quotes/decline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to decline quote');
    }

    await fetchRequests();
    return data;
  };

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('transport_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transport_requests',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          fetchRequests();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'quotes'
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchRequests]);

  return {
    requests,
    loading,
    error,
    createRequest,
    acceptQuote,
    declineQuote,
    refresh: fetchRequests
  };
}
