"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

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

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [notifications, setNotifications] = useState<Notification[]>([]);

    // Initialize with some mock notifications for the demo
    useEffect(() => {
        const mockNotifs: Notification[] = [
            {
                id: "1",
                title: "Welcome to Businto!",
                message: "Your operator dashboard is ready. Explore features like network monitoring.",
                type: "info",
                timestamp: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
                read: false,
            },
            {
                id: "2",
                title: "New Quote Sent",
                message: "Alpha Transit sent a quote for the Everett school run.",
                type: "success",
                timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
                read: false,
            }
        ];
        setNotifications(mockNotifs);

        // Simulate occasional incoming notifications for demo effect
        const interval = setInterval(() => {
            const triggers = [
                { title: "Operator Active", message: "Legacy Limo just joined the active network.", type: "info" as const },
                { title: "Price Updated", message: "Boston Coach updated their zone pricing for NH.", type: "warning" as const },
                { title: "New Request", message: "A new care-ride request was posted in Cambridge.", type: "success" as const }
            ];

            const randomTrigger = triggers[Math.floor(Math.random() * triggers.length)];

            // Only add 30% of the time to not overwhelm
            if (Math.random() > 0.7) {
                addNotification(randomTrigger);
            }
        }, 45000); // Check every 45s

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const addNotification = (notif: Omit<Notification, "id" | "timestamp" | "read">) => {
        const newNotif: Notification = {
            ...notif,
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date(),
            read: false,
        };
        setNotifications((prev) => [newNotif, ...prev].slice(0, 20)); // Keep only latest 20
    };

    const markAsRead = (id: string) => {
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
    };

    const markAllAsRead = () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    };

    const clearAll = () => {
        setNotifications([]);
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
