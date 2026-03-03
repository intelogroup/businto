"use client";

import { cn } from "@/lib/utils";
import { BusFront, HeartPulse, Gem, LucideIcon } from "lucide-react";

interface ServiceTab {
    id: string;
    label: string;
    icon: LucideIcon;
    color: string;
}

const tabs: ServiceTab[] = [
    { id: "medical", label: "Care Ride", icon: HeartPulse, color: "#10B981" },
    { id: "school", label: "School Run", icon: BusFront, color: "#F59E0B" },
    { id: "wedding", label: "Event Shuttle", icon: Gem, color: "#6366F1" },
];

interface ServiceSwitcherProps {
    activeTab: string;
    onTabChange: (id: string) => void;
}

export function ServiceSwitcher({ activeTab, onTabChange }: ServiceSwitcherProps) {
    return (
        <div className="bg-neutral-100 border border-neutral-200 p-1 rounded-lg flex w-full gap-1">
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md transition-colors duration-150",
                            isActive
                                ? "bg-white border border-neutral-200 text-neutral-900"
                                : "text-neutral-400 border border-transparent"
                        )}
                    >
                        <Icon
                            className={cn("w-4 h-4 transition-colors", isActive ? "text-neutral-900" : "text-neutral-400")}
                        />
                        <span className={cn(
                            "text-sm font-semibold whitespace-nowrap",
                            isActive ? "text-neutral-900" : "text-neutral-400"
                        )}>
                            {tab.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
