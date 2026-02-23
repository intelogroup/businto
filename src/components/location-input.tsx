"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MapPin } from "lucide-react";

interface LocationInputProps {
    value: string;
    onSelect: (address: string, lat?: number, lng?: number, metadata?: any) => void;
    placeholder?: string;
    className?: string;
    id?: string;
}

export function LocationInput({
    value,
    onSelect,
    placeholder = "Search for an address...",
    className,
    id,
}: LocationInputProps) {
    const [inputValue, setInputValue] = useState(value);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setInputValue(newValue);
        // For dev mode, just pass the text value without coordinates
        onSelect(newValue);
    };

    return (
        <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none z-10" />
            <Input
                id={id}
                value={inputValue}
                onChange={handleChange}
                placeholder={placeholder}
                className={cn(className, "pl-10")}
            />
        </div>
    );
}
