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
        <div className="bg-neutral-100 p-1 rounded-lg flex w-full relative">
            {/* Animated Background Slider */}
            <div
                className="absolute top-1 bottom-1 bg-white rounded-md shadow-sm transition-all duration-150 ease-in-out z-0"
                style={{
                    width: `calc(${100 / tabs.length}% - 4px)`,
                    left: `calc(${(tabs.indexOf(tabs.find(t => t.id === activeTab)!) * 100) / tabs.length}% + 2px)`,
                }}
            />

            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        className={cn(
                            "flex-1 relative z-10 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md transition-colors duration-150",
                            isActive ? "text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
                        )}
                    >
                        <Icon
                            className={cn("w-4 h-4 transition-colors", isActive && "text-[var(--active-color)]")}
                            style={{ "--active-color": tab.color } as any}
                        />
                        <span className={cn(
                            "text-sm font-semibold transition-colors duration-150 whitespace-nowrap",
                            isActive ? "opacity-100" : "opacity-80"
                        )}>
                            {tab.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
