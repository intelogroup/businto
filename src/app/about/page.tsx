import { InfoLayout } from "@/components/ui/info-layout";
import { ShieldCheck, Bus, HeartPulse, Gem, Zap, Compass, Users, MapPin } from "lucide-react";

export default function AboutPage() {
  return (
    <InfoLayout 
      title="About Businto" 
      subtitle="Building the infrastructure for specialized transportation."
    >
      <div className="space-y-16 text-neutral-600">
        {/* Mission Section */}
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-100 text-neutral-900 text-xs font-bold uppercase tracking-widest">
            <Zap className="w-3 h-3" /> Our Mission
          </div>
          <h2 className="text-3xl font-semibold text-neutral-900 tracking-tight leading-tight">
            We are on a mission to simplify specialized transportation through intelligence and trust.
          </h2>
          <p className="text-lg leading-relaxed">
            Whether it's a daily school run, a critical medical appointment, or a high-stakes corporate event, 
            we believe that logistics should be seamless, transparent, and reliable. Businto is more than a 
            platform; it's a commitment to moving people safely and efficiently.
          </p>
        </section>

        {/* Story Section */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-neutral-900 tracking-tight">The Problem We Saw</h2>
            <p className="leading-relaxed">
              The private transportation industry has long been fragmented and opaque. Schools struggle 
              to find reliable operators, patients face uncertainty with medical transport, and event 
              planners spend hours coordinating shuttles via email and phone.
            </p>
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-neutral-900 tracking-tight">The Businto Solution</h2>
            <p className="leading-relaxed">
              Businto bridges this gap with an intelligent brokerage model that connects vetted operators 
              with those who need them most. We've built a "one-way gate" for security, ensuring PII is 
              protected until the moment a ride is confirmed.
            </p>
          </div>
        </section>

        {/* Core Values */}
        <section className="space-y-10">
          <h2 className="text-2xl font-semibold text-neutral-900 tracking-tight">Our Core Pillars</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="p-6 rounded-lg border border-neutral-100 bg-neutral-50/50 space-y-3">
              <ShieldCheck className="w-6 h-6 text-green-600" />
              <h3 className="font-semibold text-neutral-900 text-lg">Uncompromising Safety</h3>
              <p className="text-sm leading-relaxed">
                Every operator in our network undergoes a rigorous verification process. We don't just 
                check licenses; we verify service history and safety standards.
              </p>
            </div>
            <div className="p-6 rounded-lg border border-neutral-100 bg-neutral-50/50 space-y-3">
              <Compass className="w-6 h-6 text-indigo-600" />
              <h3 className="font-semibold text-neutral-900 text-lg">Intelligent Routing</h3>
              <p className="text-sm leading-relaxed">
                We leverage advanced algorithms to match riders with the most efficient operators, 
                reducing deadhead miles and environmental impact.
              </p>
            </div>
            <div className="p-6 rounded-lg border border-neutral-100 bg-neutral-50/50 space-y-3">
              <Users className="w-6 h-6 text-amber-600" />
              <h3 className="font-semibold text-neutral-900 text-lg">Community Centric</h3>
              <p className="text-sm leading-relaxed">
                We empower local small businesses (operators) by giving them the technology 
                they need to compete with global giants.
              </p>
            </div>
            <div className="p-6 rounded-lg border border-neutral-100 bg-neutral-50/50 space-y-3">
              <Gem className="w-6 h-6 text-neutral-900" />
              <h3 className="font-semibold text-neutral-900 text-lg">Premium Service</h3>
              <p className="text-sm leading-relaxed">
                From luxury shuttles to specialized medical vans, we maintain a standard of 
                excellence that reflects the importance of every journey.
              </p>
            </div>
          </div>
        </section>

        {/* Specialized Services */}
        <section className="space-y-8 pt-8 border-t border-neutral-100">
          <h2 className="text-2xl font-semibold text-neutral-900 tracking-tight text-center">Specialized Expertise</h2>
          <div className="flex flex-wrap justify-center gap-6">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-200 text-neutral-700 font-medium bg-white">
              <Bus className="w-4 h-4" /> School Commute
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-200 text-neutral-700 font-medium bg-white">
              <HeartPulse className="w-4 h-4" /> Medical Transport
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-200 text-neutral-700 font-medium bg-white">
              <Gem className="w-4 h-4" /> Corporate Events
            </div>
          </div>
        </section>

        {/* Contact/Location */}
        <section className="bg-neutral-950 text-white p-10 rounded-lg relative overflow-hidden">
          <div className="relative z-10 space-y-4 max-w-lg">
            <div className="flex items-center gap-2 text-indigo-400 font-bold uppercase tracking-widest text-xs">
              <MapPin className="w-3 h-3" /> Headquarters
            </div>
            <h2 className="text-3xl font-semibold tracking-tight">Based in Boston</h2>
            <p className="text-neutral-400 text-lg leading-relaxed font-medium">
              Businto is proud to be built in the heart of Boston, MA, serving as a hub for 
              transportation innovation across the Northeast and beyond.
            </p>
          </div>
          {/* Decorative glow */}
          <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-indigo-600/20 rounded-full blur-[80px]" />
        </section>
      </div>
    </InfoLayout>
  );
}
