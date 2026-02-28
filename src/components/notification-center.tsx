"use client";

import { useState } from "react";
import { Bell, Check, Trash2, Info, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import { useNotifications, Notification } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRouter } from "next/navigation";

export function NotificationCenter() {
    const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);

    const getIcon = (type: Notification["type"]) => {
        switch (type) {
            case "success": return <CheckCircle2 className="text-emerald-500" size={16} />;
            case "warning": return <AlertTriangle className="text-amber-500" size={16} />;
            case "error": return <XCircle className="text-red-500" size={16} />;
            default: return <Info className="text-indigo-500" size={16} />;
        }
    };

    return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-10 w-10 rounded-xl hover:bg-neutral-100/50 transition-all"
                >
                    <Bell size={20} className="text-neutral-500" />
                    {unreadCount > 0 && (
                        <span className="absolute top-2 right-2 flex h-4 w-4 shrink-0 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white ring-2 ring-white animate-in zoom-in duration-300">
                            {unreadCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-[380px] mt-2 p-0 rounded-[24px] border-neutral-100 shadow-2xl shadow-black/10 bg-white/95 backdrop-blur-xl overflow-hidden"
            >
                <div className="p-5 border-b border-neutral-50 flex items-center justify-between bg-neutral-50/30">
                    <DropdownMenuLabel className="p-0 text-base font-black text-neutral-950 tracking-tight">
                        Notifications
                        {unreadCount > 0 && (
                            <span className="ml-2 text-xs font-bold text-neutral-400 uppercase tracking-widest">
                                ({unreadCount} new)
                            </span>
                        )}
                    </DropdownMenuLabel>
                    <div className="flex gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAllAsRead()}
                            className="h-8 px-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:text-black hover:bg-white rounded-lg transition-all"
                        >
                            <Check className="mr-1.5" size={12} />
                            Read all
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => clearAll()}
                            className="h-8 px-2 text-[10px] font-bold uppercase tracking-widest text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                            <Trash2 className="mr-1.5" size={12} />
                            Clear
                        </Button>
                    </div>
                </div>

                <ScrollArea className="h-[400px]">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-20 px-10 text-center">
                            <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mb-4">
                                <Bell size={24} className="text-neutral-200" />
                            </div>
                            <p className="text-sm font-bold text-neutral-900 mb-1">No notifications yet</p>
                            <p className="text-xs text-neutral-400 font-medium leading-relaxed">
                                When important updates happen on the network, they'll appear here.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-neutral-50">
                            {notifications.map((notif) => (
                                <div
                                    key={notif.id}
                                    onClick={() => {
                                        markAsRead(notif.id);
                                        if (notif.link) {
                                            router.push(notif.link);
                                            setIsOpen(false);
                                        }
                                    }}
                                    className={cn(
                                        "p-5 transition-all cursor-pointer group flex gap-4",
                                        !notif.read ? "bg-indigo-50/30" : "hover:bg-neutral-50"
                                    )}
                                >
                                    <div className={cn(
                                        "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                                        notif.type === "success" ? "bg-emerald-50" :
                                            notif.type === "warning" ? "bg-amber-50" :
                                                notif.type === "error" ? "bg-red-50" : "bg-indigo-50"
                                    )}>
                                        {getIcon(notif.type)}
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className={cn(
                                                "text-sm font-bold leading-none",
                                                !notif.read ? "text-neutral-950" : "text-neutral-600"
                                            )}>{notif.title}</p>
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-widest shrink-0">
                                                <Clock size={10} />
                                                {formatDistanceToNow(notif.timestamp, { addSuffix: true })}
                                            </div>
                                        </div>
                                        <p className="text-[13px] text-neutral-500 font-medium leading-normal line-clamp-2">
                                            {notif.message}
                                        </p>
                                        {!notif.read && (
                                            <div className="pt-1">
                                                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">
                                                    <Check size={10} />
                                                    New Alert
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                <div className="p-4 border-t border-neutral-50 bg-neutral-50/10 text-center">
                    <Button variant="ghost" className="w-full h-10 text-[11px] font-black uppercase tracking-[0.2em] text-neutral-400 hover:text-black rounded-xl">
                        View Full History
                    </Button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
