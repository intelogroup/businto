"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";

export interface Notification {
    id: string;
    title: string;
    message: string;
    type: "info" | "success" | "warning" | "error";
    timestamp: Date;
    read: boolean;
    link?: string;
}

interface NotificationContextType {
    notifications: Notification[];
    unreadCount: number;
    addNotification: (notification: Omit<Notification, "id" | "timestamp" | "read">) => void;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const mapNotificationType = (dbType: string): Notification['type'] => {
    switch (dbType) {
        case 'quote_received':
        case 'booking_confirmed':
            return 'success';
        case 'alert':
        case 'warning':
            return 'warning';
        case 'error':
            return 'error';
        default:
            return 'info';
    }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const { user } = useAuth();
    const supabase = createClient();

    const fetchNotifications = useCallback(async () => {
        if (!user?.id) return;

        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            const formattedNotifications: Notification[] = data.map((n: any) => ({
                id: n.id,
                title: n.title,
                message: n.message,
                type: mapNotificationType(n.type),
                timestamp: new Date(n.created_at),
                read: n.is_read,
                link: n.data?.link,
            }));

            setNotifications(formattedNotifications);
        } catch (err) {
            console.error('Error fetching notifications:', err);
        }
    }, [user?.id, supabase]);

    useEffect(() => {
        if (!user?.id) {
            setNotifications([]);
            return;
        }

        fetchNotifications();

        // Subscribe to real-time changes
        const channel = supabase
            .channel('public:notifications')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    // Refresh all notifications when a change occurs to maintain correct order and state
                    fetchNotifications();

                    // If it's an insert, we could optionally play a sound or show browser push notif here
                    if (payload.eventType === 'INSERT') {
                        if (typeof window !== 'undefined' && 'Audio' in window) {
                            try {
                                const audio = new Audio('/notification.mp3');
                                audio.volume = 0.5;
                                audio.play().catch(() => { });
                            } catch (e) { }
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id, fetchNotifications, supabase]);

    const addNotification = (notif: Omit<Notification, "id" | "timestamp" | "read">) => {
        // This remains for local-only notifications if needed, 
        // but typically you should insert into the DB instead.
        const newNotif: Notification = {
            ...notif,
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date(),
            read: false,
        };
        setNotifications((prev) => [newNotif, ...prev].slice(0, 50));
    };

    const markAsRead = async (id: string) => {
        // Optimistic UI update
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );

        try {
            await supabase
                .from('notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('id', id);
        } catch (err) {
            console.error('Error marking notification as read:', err);
        }
    };

    const markAllAsRead = async () => {
        const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
        if (unreadIds.length === 0) return;

        // Optimistic update
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

        try {
            await supabase
                .from('notifications')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .in('id', unreadIds);
        } catch (err) {
            console.error('Error marking all as read:', err);
        }
    };

    const clearAll = async () => {
        // Optimistic update
        setNotifications([]);

        if (!user?.id) return;

        try {
            await supabase
                .from('notifications')
                .delete()
                .eq('user_id', user.id);
        } catch (err) {
            console.error('Error clearing notifications:', err);
        }
    };

    const unreadCount = notifications.filter((n) => !n.read).length;

    return (
        <NotificationContext.Provider
            value={{
                notifications,
                unreadCount,
                addNotification,
                markAsRead,
                markAllAsRead,
                clearAll,
            }}
        >
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error("useNotifications must be used within a NotificationProvider");
    }
    return context;
}
