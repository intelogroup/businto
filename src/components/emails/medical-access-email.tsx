import { BadgeCheck, MapPin, Navigation, FileSpreadsheet, Clock, CalendarDays, ArrowRight } from "lucide-react";

interface MedicalEmailProps {
    data: {
        pickup: string;
        dropoff: string;
        date: string;
        time: string;
        mobility: string;
        distance: number;
        duration: number;
        billingCode: string | null;
        isPt1: boolean;
    }
}

export function MedicalAccessEmail({ data }: MedicalEmailProps) {
    return (
        <div className="w-full max-w-2xl mx-auto bg-white rounded-xl overflow-hidden font-sans border border-neutral-200 text-neutral-900 shadow-sm">
            {/* Subject Line Preview - Not part of body but helpful context */}
            <div className="bg-neutral-100 p-3 text-xs text-neutral-500 border-b border-neutral-200">
                <span className="font-bold text-neutral-700">Subject:</span> 🚑 TRIP REQUEST: {data.mobility} • {data.distance}mi • {data.date}
            </div>

            {/* Header */}
            <div className="bg-[#0f172a] text-white p-6">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center border border-white/10">
                            <img src="/brand-mark.svg" alt="Businto" className="w-8 h-8 brightness-0 invert" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight mb-0.5">New Transport Request</h1>
                            <p className="text-blue-200 text-xs font-medium uppercase tracking-wider">Businto Dispatch Network</p>
                        </div>
                    </div>
                    <div className="bg-blue-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                        Dispatch #{Math.floor(Math.random() * 9000) + 1000}
                    </div>
                </div>
            </div>

            {/* Operator "Value Props" Bar */}
            <div className="bg-blue-50 border-b border-blue-100 p-4 grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                    <div className="bg-white p-2 rounded-lg border border-blue-100 shadow-sm">
                        <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <div className="text-[10px] uppercase font-bold text-blue-400">Billing Code</div>
                        <div className="text-sm font-bold text-blue-900">{data.billingCode || "N/A"}</div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-white p-2 rounded-lg border border-blue-100 shadow-sm">
                        <BadgeCheck className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                        <div className="text-[10px] uppercase font-bold text-emerald-500">Compliance</div>
                        <div className="text-sm font-bold text-emerald-900">
                            {data.isPt1 ? "PT-1 Funded" : "Private Pay"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Trip Details */}
            <div className="p-6 space-y-6">
                {/* Route Visual */}
                <div className="flex items-stretch gap-4">
                    <div className="flex flex-col items-center pt-1">
                        <div className="w-3 h-3 rounded-full bg-neutral-300 ring-4 ring-neutral-100" />
                        <div className="w-0.5 flex-1 bg-neutral-100 my-1" />
                        <div className="w-3 h-3 rounded-full bg-blue-600 ring-4 ring-blue-100" />
                    </div>
                    <div className="flex-1 space-y-6">
                        <div>
                            <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Pickup</div>
                            <div className="font-medium text-lg text-neutral-900">{data.pickup}</div>
                            <div className="flex items-center gap-2 mt-1 text-sm text-neutral-500">
                                <CalendarDays className="w-3.5 h-3.5" /> {data.date}
                                <span className="text-neutral-300">•</span>
                                <Clock className="w-3.5 h-3.5" /> {data.time}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Dropoff</div>
                            <div className="font-medium text-lg text-neutral-900">{data.dropoff}</div>
                            <div className="flex items-center gap-2 mt-1 text-sm text-neutral-500">
                                <Navigation className="w-3.5 h-3.5" /> {data.distance} miles
                                <span className="text-neutral-300">•</span>
                                ~{data.duration} mins
                            </div>
                        </div>
                    </div>
                </div>

                {/* Requirements Grid */}
                <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-100">
                    <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Vehicle Requirements</h3>
                    <div className="grid grid-cols-2 gap-y-2 text-sm">
                        <div className="text-neutral-500">Mobility:</div>
                        <div className="font-bold text-neutral-900 capitalize">{data.mobility}</div>

                        <div className="text-neutral-500">Attendant:</div>
                        <div className="font-bold text-neutral-900">Not Required</div>

                        <div className="text-neutral-500">Service Depth:</div>
                        <div className="font-bold text-neutral-900">Door-to-Door</div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2">
                    <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
                        Claim Job <ArrowRight className="w-5 h-5 opacity-80" />
                    </button>
                    <div className="mt-3 text-center">
                        <button className="text-xs font-bold text-neutral-400 hover:text-red-500 transition-colors">
                            Decline Request
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
