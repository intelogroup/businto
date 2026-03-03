import { InfoLayout } from "@/components/ui/info-layout";
import { Check, ShieldCheck, Zap, Headset, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function PricingPage() {
  const marketplaceFeatures = [
    {
      icon: <ShieldCheck className="w-5 h-5 text-sky-600" />,
      title: "Verified Operators",
      description: "Every operator in our network undergoes rigorous CORI checks and insurance verification."
    },
    {
      icon: <Zap className="w-5 h-5 text-amber-600" />,
      title: "Rapid Quoting",
      description: "Our intelligent routing engine broadcasts your request to matching operators for fast responses."
    },
    {
      icon: <Headset className="w-5 h-5 text-emerald-600" />,
      title: "Dispatch Support",
      description: "24/7 access to our specialized dispatch team for coordination and emergency changes."
    }
  ];

  return (
    <InfoLayout 
      title="Pricing" 
      subtitle="Simple, transparent marketplace economics."
    >
      <div className="space-y-16">
        {/* Main Fee Section */}
        <section className="relative p-10 border border-neutral-200 rounded-2xl bg-white shadow-sm overflow-hidden">
          <div className="absolute top-0 right-0 p-4">
            <CreditCard className="w-24 h-24 text-neutral-50/50 -rotate-12 translate-x-8 -translate-y-8" />
          </div>
          
          <div className="relative z-10 max-w-2xl">
            <h2 className="text-sm font-bold uppercase tracking-widest text-sky-600 mb-4">Marketplace Fee</h2>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-5xl font-semibold text-neutral-900">$1.99</span>
              <span className="text-neutral-500 font-medium text-lg">per request</span>
            </div>
            <p className="text-lg text-neutral-600 leading-relaxed mb-8">
              To maintain a secure, high-quality network of specialized transport operators, we charge a 
              nominal routing fee for every trip request submitted.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8 border-t border-neutral-100">
              {marketplaceFeatures.map((feature, i) => (
                <div key={i} className="space-y-3">
                  <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center">
                    {feature.icon}
                  </div>
                  <h3 className="font-semibold text-neutral-900 text-sm">{feature.title}</h3>
                  <p className="text-xs text-neutral-500 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it Works / Split Model */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center px-4">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900 mb-6">Transparent Economics</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-bold mt-1">1</div>
                <div>
                  <h4 className="font-semibold text-neutral-900 mb-1">Submit Your Request</h4>
                  <p className="text-sm text-neutral-500">Provide your route details and specific requirements. We charge a $1.99 fee to process and broadcast your request.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-bold mt-1">2</div>
                <div>
                  <h4 className="font-semibold text-neutral-900 mb-1">Receive Competitive Quotes</h4>
                  <p className="text-sm text-neutral-500">Local, vetted operators review your request and submit their best rates directly to your dashboard.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-bold mt-1">3</div>
                <div>
                  <h4 className="font-semibold text-neutral-900 mb-1">Pay the Operator Directly</h4>
                  <p className="text-sm text-neutral-500">Once you accept a quote, you coordinate payment for the actual trip cost directly with the winning operator.</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-8 rounded-2xl border border-neutral-100">
            <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-400 mb-6 text-center">Price Estimations</h3>
            <div className="space-y-4">
              <div className="p-4 bg-white rounded-xl border border-neutral-200 flex justify-between items-center shadow-sm">
                <div>
                  <span className="block text-xs font-bold text-neutral-400 uppercase">School Runs</span>
                  <span className="font-medium text-neutral-900">Consistent Commutes</span>
                </div>
                <div className="text-right">
                  <span className="block text-lg font-semibold text-neutral-900">From $12</span>
                  <span className="text-[10px] text-neutral-400 font-bold uppercase">per trip</span>
                </div>
              </div>
              <div className="p-4 bg-white rounded-xl border border-neutral-200 flex justify-between items-center shadow-sm">
                <div>
                  <span className="block text-xs font-bold text-neutral-400 uppercase">Care Rides</span>
                  <span className="font-medium text-neutral-900">Medical Transport</span>
                </div>
                <div className="text-right">
                  <span className="block text-lg font-semibold text-neutral-900">From $45</span>
                  <span className="text-[10px] text-neutral-400 font-bold uppercase">per trip</span>
                </div>
              </div>
              <div className="p-4 bg-white rounded-xl border border-neutral-200 flex justify-between items-center shadow-sm">
                <div>
                  <span className="block text-xs font-bold text-neutral-400 uppercase">Events</span>
                  <span className="font-medium text-neutral-900">Group Shuttles</span>
                </div>
                <div className="text-right">
                  <span className="block text-lg font-semibold text-neutral-900">Custom</span>
                  <span className="text-[10px] text-neutral-400 font-bold uppercase">by quote</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-center text-neutral-400 mt-6 leading-relaxed">
              * Estimations are based on historical averages. Actual pricing is set independently by operators.
            </p>
          </div>
        </section>

        {/* Enterprise / High Volume */}
        <section className="bg-neutral-900 text-white p-12 rounded-2xl text-center space-y-6">
          <h2 className="text-2xl font-semibold">Managing high-volume transport?</h2>
          <p className="text-neutral-400 text-base max-w-xl mx-auto leading-relaxed">
            We offer specialized billing and platform solutions for hospital networks, school districts, and 
            event coordinators managing 50+ monthly trips.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link href="/contact">
              <Button className="bg-white text-neutral-900 hover:bg-white h-11 px-8 rounded-md font-bold text-sm">
                Contact Enterprise Sales
              </Button>
            </Link>
            <Link href="/operators">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 h-11 px-8 rounded-md font-bold text-sm">
                Register as Operator
              </Button>
            </Link>
          </div>
        </section>
      </div>
    </InfoLayout>
  );
}
