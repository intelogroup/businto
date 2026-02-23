"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './use-auth';

export interface Message {
  id: string;
  created_at: string;
  request_id?: string;
  booking_id?: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  is_read: boolean;
  sender?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
  recipient?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
}

interface UseMessagesOptions {
  requestId?: string;
  bookingId?: string;
}

export function useMessages(options: UseMessagesOptions = {}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!user) {
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (options.requestId) params.append('request_id', options.requestId);
      if (options.bookingId) params.append('booking_id', options.bookingId);
      params.append('user_id', user.id);

      const response = await fetch(`/api/messages?${params}`);
      const data = await response.json();

      if (response.ok) {
        setMessages(data.messages || []);
        setError(null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch messages');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user, options.requestId, options.bookingId]);

  const sendMessage = async (recipientId: string, content: string) => {
    if (!user) {
      throw new Error('Must be logged in to send a message');
    }

    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: options.requestId,
        booking_id: options.bookingId,
        sender_id: user.id,
        recipient_id: recipientId,
        content
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to send message');
    }

    await fetchMessages();
    return data.message;
  };

  const markAsRead = async (messageIds: string[]) => {
    const response = await fetch('/api/messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_ids: messageIds, is_read: true })
    });

    if (response.ok) {
      await fetchMessages();
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to real-time message updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('messages_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${user.id}`
        },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchMessages]);

  return {
    messages,
    loading,
    error,
    sendMessage,
    markAsRead,
    refresh: fetchMessages
  };
}
