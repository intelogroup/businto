"use client";

import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MapPin, Loader2 } from "lucide-react";

interface LocationInputProps {
    value: string;
    onSelect: (address: string, lat?: number, lng?: number, metadata?: any) => void;
    placeholder?: string;
    className?: string;
    id?: string;
}

interface Prediction {
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
}

export function LocationInput({
    value,
    onSelect,
    placeholder = "Search for an address...",
    className,
    id,
}: LocationInputProps) {
    const [inputValue, setInputValue] = useState(value);
    const [debouncedValue, setDebouncedValue] = useState(value);
    const [predictions, setPredictions] = useState<Prediction[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    // Tracks whether the last change was a user selection — suppresses the next fetch cycle
    const justSelected = useRef(false);

    // Handle click outside to close dropdown
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Debounce input value by 500ms
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(inputValue);
        }, 500);
        return () => clearTimeout(timer);
    }, [inputValue]);

    // Fetch predictions from Nominatim whenever debouncedValue changes
    useEffect(() => {
        // Skip fetch immediately after a selection
        if (justSelected.current) {
            justSelected.current = false;
            return;
        }

        const fetchPredictions = async () => {
            if (!debouncedValue || debouncedValue.length < 3) {
                setPredictions([]);
                setIsOpen(false);
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            try {
                const response = await fetch(
                    `/api/geocode?q=${encodeURIComponent(debouncedValue)}&limit=5&countrycodes=us`
                );
                if (response.ok) {
                    const data = await response.json();
                    setPredictions(data);
                    if (data.length > 0) setIsOpen(true);
                }
            } catch (error) {
                console.error("Error fetching address predictions:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPredictions();
    }, [debouncedValue]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setInputValue(newValue);
        onSelect(newValue); // keep parent in sync with free-form text
        if (newValue.length === 0) {
            setPredictions([]);
            setIsOpen(false);
        }
    };

    const handleSelect = (prediction: Prediction) => {
        justSelected.current = true; // suppress next debounced fetch
        const address = prediction.display_name;
        setInputValue(address);
        setPredictions([]);
        setIsOpen(false);
        onSelect(address, parseFloat(prediction.lat), parseFloat(prediction.lon), prediction);
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none z-10" />
            <Input
                id={id}
                value={inputValue}
                onChange={handleChange}
                onFocus={() => {
                    if (predictions.length > 0) setIsOpen(true);
                }}
                placeholder={placeholder}
                className={cn(className, "pl-10", isLoading && "pr-10")}
                autoComplete="off"
            />
            {isLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                </div>
            )}

            {isOpen && predictions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-lg animate-in fade-in zoom-in-95">
                    {predictions.map((prediction) => (
                        <div
                            key={prediction.place_id}
                            // onMouseDown fires BEFORE the input's onBlur, ensuring the selection lands first
                            onMouseDown={(e) => {
                                e.preventDefault(); // prevent input from losing focus before selection
                                handleSelect(prediction);
                            }}
                            className="relative flex cursor-pointer select-none items-start rounded-md px-3 py-2.5 text-xs outline-none hover:bg-neutral-50 transition-colors"
                        >
                            <MapPin className="mr-2 mt-0.5 h-3.5 w-3.5 text-neutral-400 shrink-0" />
                            <span className="leading-snug text-neutral-700 font-medium">{prediction.display_name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
