import { InfoLayout } from "@/components/ui/info-layout";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PricingPage() {
  const tiers = [
    {
      name: "School Run",
      price: "From $12/trip",
      description: "Consistent daily commutes for students with verified drivers.",
      features: [
        "Dedicated daily driver",
        "Real-time tracking for parents",
        "Background-checked operators",
        "Flexible monthly billing"
      ]
    },
    {
      name: "Care Ride",
      price: "From $45/trip",
      description: "Specialized medical transport for patients and caregivers.",
      features: [
        "HIPAA-compliant data handling",
        "Ambulatory & Wheelchair options",
        "Door-to-door assistance",
        "Insurance-ready invoicing"
      ]
    },
    {
      name: "Event Shuttle",
      price: "Custom Quote",
      description: "High-capacity transport for weddings and corporate events.",
      features: [
        "Professional dispatch team",
        "Fleet of 50+ operators",
        "Custom itinerary planning",
        "On-site coordination"
      ]
    }
  ];

  return (
    <InfoLayout 
      title="Pricing Guide" 
      subtitle="Transparent, predictable pricing for every type of journey."
    >
      <div className="space-y-12">
        <section className="prose prose-neutral max-w-none text-neutral-600">
          <p>
            Businto uses a dynamic routing model to ensure you get the best possible rate from our network of 
            vetted operators. While specific costs depend on distance and vehicle type, we provide 
            transparent base rates for our core service categories.
          </p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map((tier, index) => (
            <div key={index} className="p-8 border border-neutral-100 rounded-lg bg-white shadow-sm flex flex-col">
              <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-400 mb-2">{tier.name}</h3>
              <div className="text-2xl font-semibold text-neutral-900 mb-4">{tier.price}</div>
              <p className="text-sm text-neutral-500 mb-6 flex-grow">{tier.description}</p>
              <ul className="space-y-3 mb-8">
                {tier.features.map((feature, fIndex) => (
                  <li key={fIndex} className="flex items-start gap-2 text-xs text-neutral-600">
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button className="w-full bg-neutral-950 text-white rounded-md h-10 text-xs font-semibold uppercase tracking-widest">
                Get Started
              </Button>
            </div>
          ))}
        </div>

        <section className="bg-white border border-neutral-100 p-8 rounded-lg text-center space-y-4">
          <h2 className="text-xl font-semibold text-neutral-900">Need a custom enterprise solution?</h2>
          <p className="text-neutral-500 text-sm max-w-xl mx-auto">
            We offer tailored pricing and API integrations for hospitals, school districts, and 
            large-scale event management companies.
          </p>
          <Button variant="outline" className="h-10 px-8 rounded-md font-semibold border-neutral-200">
            Contact Sales
          </Button>
        </section>
      </div>
    </InfoLayout>
  );
}
