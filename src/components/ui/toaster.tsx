"use client";

import React from "react";
import { useNotifications } from "@/hooks/use-notifications";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function Toaster() {
    const { notifications, markAsRead } = useNotifications();

    // Only show unread notifications as toasts
    const activeNotifications = notifications.filter(n => !n.read).slice(0, 3);

    return (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-[380px] pointer-events-none">
            <AnimatePresence mode="popLayout">
                {activeNotifications.map((notif) => (
                    <motion.div
                        key={notif.id}
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                        className={cn(
                            "pointer-events-auto w-full bg-white rounded-2xl shadow-2xl border border-neutral-100 p-4 flex gap-3 items-start",
                            "shadow-black/10 backdrop-blur-xl bg-white/95"
                        )}
                    >
                        <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                            notif.type === "success" ? "bg-emerald-50 text-emerald-500" :
                                notif.type === "warning" ? "bg-amber-50 text-amber-500" :
                                    notif.type === "error" ? "bg-red-50 text-red-500" : "bg-indigo-50 text-indigo-500"
                        )}>
                            {notif.type === "success" && <CheckCircle2 size={20} />}
                            {notif.type === "warning" && <AlertTriangle size={20} />}
                            {notif.type === "error" && <XCircle size={20} />}
                            {notif.type === "info" && <Info size={20} />}
                        </div>

                        <div className="flex-1 min-w-0 pt-0.5">
                            <p className="text-sm font-bold text-neutral-900 leading-tight truncate">
                                {notif.title}
                            </p>
                            <p className="text-xs text-neutral-500 font-medium leading-relaxed mt-0.5 mt-1">
                                {notif.message}
                            </p>
                        </div>

                        <button
                            onClick={() => markAsRead(notif.id)}
                            className="text-neutral-300 hover:text-neutral-500 transition-colors pt-0.5"
                        >
                            <X size={16} />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
