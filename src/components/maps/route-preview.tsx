"use client";

import { useState, useEffect } from "react";
import { MapPin, Clock, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";

interface RoutePreviewProps {
  origin: string;
  destination: string;
  className?: string;
}

interface RouteData {
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  origin_address?: string;
  destination_address?: string;
}

export function RoutePreview({ origin, destination, className }: RoutePreviewProps) {
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!origin || !destination) {
      setRouteData(null);
      return;
    }

    const fetchRoute = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/maps/distance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin, destination })
        });

        const data = await response.json();

        if (response.ok) {
          setRouteData(data);
        } else {
          setError(data.error || "Failed to calculate route");
        }
      } catch (err) {
        setError("Failed to calculate route");
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchRoute, 500);
    return () => clearTimeout(debounce);
  }, [origin, destination]);

  if (!origin && !destination) {
    return null;
  }

  return (
    <div className={cn("bg-white rounded-lg p-4", className)}>
      {/* Route Visual */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex flex-col items-center">
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <div className="w-0.5 h-8 bg-neutral-200 my-1" />
          <div className="h-3 w-3 rounded-full bg-red-500" />
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <p className="text-xs text-neutral-400 mb-0.5">Pickup</p>
            <p className="text-sm font-medium text-neutral-900 truncate">
              {origin || "Enter pickup location"}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-400 mb-0.5">Destination</p>
            <p className="text-sm font-medium text-neutral-900 truncate">
              {destination || "Enter destination"}
            </p>
          </div>
        </div>
      </div>

      {/* Route Stats */}
      {loading ? (
        <div className="flex items-center justify-center py-2">
          <div className="animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <p className="text-xs text-red-500 text-center py-2">{error}</p>
      ) : routeData ? (
        <div className="flex items-center justify-between pt-3 border-t border-neutral-200">
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-neutral-400" />
            <span className="text-sm font-semibold text-neutral-900">
              {routeData.distance.text}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-neutral-400" />
            <span className="text-sm font-semibold text-neutral-900">
              {routeData.duration.text}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
