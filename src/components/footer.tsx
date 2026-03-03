import { Bus, HeartPulse, Gem, ShieldCheck, Mail, ArrowUpRight, Globe, Instagram, Twitter, Linkedin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Footer() {
  return (
    <footer className="relative bg-neutral-950 text-white overflow-hidden">
      {/* Background Hype */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/2" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-24 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 mb-20">
          <div className="space-y-10">
            <div className="space-y-6">
              <h2 className="text-4xl md:text-5xl font-semibold tracking-tighter leading-none">
                The future of <br />
                <span className="text-neutral-500 italic">private logistics.</span>
              </h2>
              <p className="text-xl text-neutral-400 font-medium max-w-md">
                Empowering schools, caregivers, and luxury planners with intelligent routing and verified operator networks.
              </p>
            </div>

            <div className="flex flex-wrap gap-12">
              <div className="space-y-2">
                <div className="text-3xl font-semibold text-white">1,200+</div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Verified Operators</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-semibold text-white">50k+</div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Rides Managed</div>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-semibold text-white">99.8%</div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">On-Time Success</div>
              </div>
            </div>
          </div>

          <div className="bg-neutral-900 rounded-lg p-10 border border-white/5 space-y-8">
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold tracking-tight">Call for ride operators to join the network!</h3>
              <p className="text-neutral-400 font-medium">Get the latest operator insights and regional route availability.</p>
            </div>
            <div className="flex gap-3">
              <Input
                placeholder="Enter your email"
                className="h-10 bg-white/5 border-white/10 rounded-md focus-visible:ring-indigo-500/50 focus-visible:ring-offset-0 text-white placeholder:text-neutral-500 font-bold"
              />
              <Button className="h-10 px-8 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm">
                Join
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500 font-bold">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              We only send 1 high-value report per month.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 border-t border-white/5 pt-20">
          <div className="space-y-6">
            <div className="text-sm font-semibold uppercase tracking-widest text-white">Services</div>
            <ul className="space-y-4 text-neutral-400 font-semibold">
              <li><a href="#" className="hover:text-amber-500 transition-colors flex items-center gap-2">School Commute <Bus className="w-3.5 h-3.5" /></a></li>
              <li><a href="#" className="hover:text-green-500 transition-colors flex items-center gap-2">Medical Transport <HeartPulse className="w-3.5 h-3.5" /></a></li>
              <li><a href="#" className="hover:text-indigo-500 transition-colors flex items-center gap-2">Event Shuttles <Gem className="w-3.5 h-3.5" /></a></li>
              <li><a href="#" className="hover:text-white transition-colors">Corporate Events</a></li>
            </ul>
          </div>
          <div className="space-y-6">
            <div className="text-sm font-semibold uppercase tracking-widest text-white">Company</div>
            <ul className="space-y-4 text-neutral-400 font-semibold">
              <li><a href="/about" className="hover:text-white transition-colors duration-150">About Us</a></li>
              <li><a href="/safety" className="hover:text-white transition-colors duration-150">Safety Standard</a></li>
              <li><a href="/operators" className="hover:text-white transition-colors duration-150">Operator Network</a></li>
              <li><a href="/contact" className="hover:text-white transition-colors duration-150">Contact</a></li>
            </ul>
          </div>
          <div className="space-y-6">
            <div className="text-sm font-semibold uppercase tracking-widest text-white">Resources</div>
            <ul className="space-y-4 text-neutral-400 font-semibold">
              <li><a href="#" className="hover:text-white transition-colors duration-150">Fuzzy Billing FAQ</a></li>
              <li><a href="#" className="hover:text-white transition-colors duration-150">Route Optimization</a></li>
              <li><a href="/pricing" className="hover:text-white transition-colors duration-150">Pricing Guide</a></li>
              <li><a href="#" className="hover:text-white transition-colors duration-150">Case Studies</a></li>
            </ul>
          </div>
          <div className="space-y-6">
            <div className="text-sm font-semibold uppercase tracking-widest text-white">Contact</div>
            <ul className="space-y-4 text-neutral-400 font-semibold">
              <li className="flex items-center gap-2"><Mail className="w-4 h-4" /> support@businto.com</li>
              <li className="flex items-center gap-2"><Globe className="w-4 h-4" /> HQ: Boston, MA</li>
              <li className="flex gap-4 pt-4">
                <a href="#" className="p-2.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors duration-150"><Twitter className="w-4 h-4" /></a>
                <a href="#" className="p-2.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors duration-150"><Instagram className="w-4 h-4" /></a>
                <a href="#" className="p-2.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors duration-150"><Linkedin className="w-4 h-4" /></a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-24 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
            <span>© 2026 BUSINTO LOGISTICS</span>
            <span><a href="/privacy" className="hover:text-white transition-colors">PRIVACY POLICY</a></span>
            <span><a href="/terms" className="hover:text-white transition-colors">TERMS OF SERVICE</a></span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 text-[10px] font-semibold uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Network Status: Optimal
          </div>
        </div>
      </div>
    </footer>
  );
}