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

    // No simulation in production
    return () => { };
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
