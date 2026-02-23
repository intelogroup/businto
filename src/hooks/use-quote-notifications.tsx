"use client";

import { useEffect, useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNotifications } from "./use-notifications";
import { Quote } from "@/types/quotes";

interface QuoteNotificationOptions {
  userId?: string;
  enabled?: boolean;
}

export function useQuoteNotifications({ userId, enabled = true }: QuoteNotificationOptions = {}) {
  const { addNotification } = useNotifications();
  const [newQuoteCount, setNewQuoteCount] = useState(0);

  const handleNewQuote = useCallback((quote: Quote, tripId: string) => {
    // Add in-app notification
    addNotification({
      title: "New Quote Received!",
      message: `${quote.operatorName} sent you a quote for $${quote.totalPrice}`,
      type: "success",
      link: `/trips/${tripId}`
    });

    // Play sound notification (optional)
    if (typeof window !== 'undefined' && 'Audio' in window) {
      try {
        const audio = new Audio('/notification.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => {
          // Ignore errors if audio can't play
        });
      } catch (error) {
        // Audio not supported
      }
    }

    // Browser push notification (if permission granted)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('New Quote Received', {
          body: `${quote.operatorName} sent you a quote for $${quote.totalPrice}`,
          icon: '/logo.png',
          badge: '/badge.png',
          tag: quote.id,
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }

    setNewQuoteCount(prev => prev + 1);
  }, [addNotification]);

  useEffect(() => {
    if (!enabled || !userId) return;

    // Subscribe to real-time quote updates
    // In a real implementation with Supabase:
    /*
    const channel = supabase
      .channel('quotes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'quotes',
          filter: `trip_request_id=in.(SELECT id FROM trip_requests WHERE user_id=eq.${userId})`
        },
        (payload) => {
          const newQuote = payload.new as Quote;
          handleNewQuote(newQuote, newQuote.tripRequestId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    */

    // For demo purposes, simulate receiving quotes
    const simulateQuotes = () => {
      const mockOperators = [
        { name: "Quick Transit", price: 62 },
        { name: "Premium Rides", price: 75 },
        { name: "EcoWay Transport", price: 58 },
      ];

      const randomOperator = mockOperators[Math.floor(Math.random() * mockOperators.length)];

      const mockQuote: Quote = {
        id: `quote-${Date.now()}`,
        tripRequestId: 'demo-trip',
        operatorId: 'demo-operator',
        operatorName: randomOperator.name,
        operatorRating: 4.5 + Math.random() * 0.5,
        operatorReviewCount: Math.floor(50 + Math.random() * 100),
        totalPrice: randomOperator.price,
        baseFare: 45,
        distanceCharge: randomOperator.price - 45,
        additionalFees: [],
        vehicleType: "Mercedes Sprinter",
        vehicleYear: 2022,
        vehicleCapacity: 14,
        coriCertified: true,
        insuranceVerified: true,
        wheelchairAccessible: true,
        responseTime: Math.floor(3 + Math.random() * 10),
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      };

      // Only trigger occasionally to not overwhelm
      if (Math.random() > 0.7) {
        handleNewQuote(mockQuote, 'demo-trip');
      }
    };

    // Simulate quotes every 30 seconds
    const interval = setInterval(simulateQuotes, 30000);

    return () => clearInterval(interval);
  }, [enabled, userId, handleNewQuote]);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }, []);

  return {
    newQuoteCount,
    requestNotificationPermission,
  };
}
