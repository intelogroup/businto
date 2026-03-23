"use client";

import { useState, useEffect, useCallback } from "react";
import { Navbar } from "@/components/navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Search, MapPin, Loader2, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Operator {
  id: string;
  company_name: string;
  specialties: string[];
  service_areas: string[] | string;
  service_radius_miles: number;
  rating: number | null;
  total_reviews: number;
  is_verified: boolean;
  is_partner: boolean;
}

const SPECIALTY_LABELS: Record<string, string> = {
  school: "School Transport",
  medical: "Medical Transport",
  wedding: "Wedding / Events",
  corporate: "Corporate",
};

const SPECIALTY_COLORS: Record<string, string> = {
  school: "bg-blue-50 text-blue-700",
  medical: "bg-emerald-50 text-emerald-700",
  wedding: "bg-pink-50 text-pink-700",
  corporate: "bg-violet-50 text-violet-700",
};

export default function OperatorDirectoryPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [specialty, setSpecialty] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchOperators = useCallback(async (loc: string, spec: string, pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: "12" });
      if (loc) params.set("location", loc);
      if (spec && spec !== "all") params.set("specialty", spec);

      const res = await fetch(`/api/operators/directory?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setOperators(json.operators || []);
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 1);
    } catch (e) {
      console.error("Operator directory fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchOperators("", "all", 1);
  }, [fetchOperators]);

  // Debounced re-fetch on filter change
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      fetchOperators(locationInput, specialty, 1);
    }, 350);
    return () => clearTimeout(t);
  }, [locationInput, specialty, fetchOperators]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchOperators(locationInput, specialty, newPage);
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-neutral-900">Operator Directory</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Browse verified transport operators by specialty and location before submitting a request.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            <Input
              placeholder="Filter by service area (e.g. Chicago, Dallas)…"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              className="pl-9 h-10 text-sm"
            />
          </div>
          <Select
            value={specialty}
            onValueChange={(v) => {
              setSpecialty(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-52 h-10 text-sm">
              <SelectValue placeholder="All specialties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Specialties</SelectItem>
              {Object.entries(SPECIALTY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Results count */}
        <p className="text-xs text-neutral-400 mb-5 font-medium">
          {loading ? "Loading…" : `${total} operator${total !== 1 ? "s" : ""} found`}
        </p>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={22} className="animate-spin text-neutral-400" />
          </div>
        ) : operators.length === 0 ? (
          <div className="text-center py-20 text-neutral-400 text-sm">
            No verified operators match your search. Try a different location or specialty.
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${specialty}-${locationInput}-${page}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {operators.map((op) => (
                <OperatorCard key={op.id} operator={op} />
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
              className="text-xs h-8 px-3"
            >
              Previous
            </Button>
            <span className="text-xs text-neutral-500">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => handlePageChange(page + 1)}
              className="text-xs h-8 px-3"
            >
              Next
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

function OperatorCard({ operator }: { operator: Operator }) {
  const rating = operator.rating != null ? Number(operator.rating).toFixed(1) : null;
  const serviceAreas = Array.isArray(operator.service_areas)
    ? operator.service_areas
    : operator.service_areas
    ? [operator.service_areas]
    : [];

  return (
    <Card className="border border-neutral-100 shadow-sm bg-white rounded-lg hover:shadow-md transition-shadow">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold text-neutral-900 truncate">
              {operator.company_name}
            </CardTitle>
            {operator.is_partner && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 mt-0.5">
                <ShieldCheck size={10} /> Partner
              </span>
            )}
          </div>
          {rating && (
            <div className="flex items-center gap-1 shrink-0">
              <Star size={12} className="text-amber-400 fill-amber-400" />
              <span className="text-xs font-semibold text-neutral-700">{rating}</span>
              <span className="text-[10px] text-neutral-400">({operator.total_reviews})</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-2 space-y-3">
        {/* Specialties */}
        {operator.specialties?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {operator.specialties.map((s) => (
              <span
                key={s}
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  SPECIALTY_COLORS[s] || "bg-neutral-100 text-neutral-600"
                }`}
              >
                {SPECIALTY_LABELS[s] || s}
              </span>
            ))}
          </div>
        )}

        {/* Service areas */}
        {serviceAreas.length > 0 && (
          <div className="flex items-start gap-1.5 text-xs text-neutral-500">
            <MapPin size={11} className="mt-0.5 shrink-0 text-neutral-400" />
            <span className="line-clamp-2">{serviceAreas.join(", ")}</span>
          </div>
        )}

        {/* Radius */}
        {operator.service_radius_miles > 0 && (
          <p className="text-[11px] text-neutral-400">
            Service radius: {operator.service_radius_miles} mi
          </p>
        )}
      </CardContent>
    </Card>
  );
}
