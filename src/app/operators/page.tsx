import { InfoLayout } from "@/components/ui/info-layout";
import { Bus, Map, ShieldCheck, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OperatorsPage() {
  const benefits = [
    {
      icon: <BarChart3 className="w-6 h-6 text-indigo-600" />,
      title: "Consistent Volume",
      description: "Access a steady stream of school, medical, and event transport requests in your service area."
    },
    {
      icon: <Map className="w-6 h-6 text-green-600" />,
      title: "Optimized Routing",
      description: "Our platform helps you fill dead-legs and optimize your daily schedules for maximum efficiency."
    },
    {
      icon: <ShieldCheck className="w-6 h-6 text-amber-600" />,
      title: "Reliable Payments",
      description: "Get paid on time with our automated billing system and transparent fee structures."
    },
    {
      icon: <Bus className="w-6 h-6 text-blue-600" />,
      title: "Fleet Management",
      description: "Tools designed specifically for private operators to manage vehicles and driver assignments."
    }
  ];

  return (
    <InfoLayout 
      title="Operator Network" 
      subtitle="Grow your business with the most intelligent routing network in private logistics."
    >
      <div className="space-y-12 text-neutral-600">
        <section className="prose prose-neutral max-w-none">
          <p className="text-lg">
            Businto is not a transportation provider; we are a technology partner. We connect high-quality 
            private operators with specialized transport needs. By joining our network, you gain access to 
            advanced dispatching tools and a growing client base of schools, healthcare facilities, and event planners.
          </p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {benefits.map((benefit, index) => (
            <div key={index} className="p-8 border border-neutral-100 rounded-lg bg-white shadow-sm space-y-4">
              <div className="p-2 bg-white w-fit rounded-md">
                {benefit.icon}
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">{benefit.title}</h3>
              <p className="text-sm leading-relaxed">{benefit.description}</p>
            </div>
          ))}
        </div>

        <section className="bg-neutral-900 text-white p-10 rounded-lg flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1 space-y-4">
            <h2 className="text-2xl font-semibold">Join the 1,200+ network.</h2>
            <p className="text-neutral-400 text-sm">
              We are looking for reliable operators with a commitment to safety and professional service. 
              Our vetting process takes approximately 3-5 business days.
            </p>
          </div>
          <Button className="bg-white text-black hover:bg-white h-12 px-8 rounded-md font-bold shrink-0">
            Apply to Join
          </Button>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-neutral-900">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="text-3xl font-bold text-neutral-200">01</div>
              <h4 className="font-semibold text-neutral-900">Vetting</h4>
              <p className="text-sm">Submit your credentials, insurance, and safety records for review by our compliance team.</p>
            </div>
            <div className="space-y-2">
              <div className="text-3xl font-bold text-neutral-200">02</div>
              <h4 className="font-semibold text-neutral-900">Onboarding</h4>
              <p className="text-sm">Integrate your fleet with our platform and set your service areas and availability.</p>
            </div>
            <div className="space-y-2">
              <div className="text-3xl font-bold text-neutral-200">03</div>
              <h4 className="font-semibold text-neutral-900">Dispatch</h4>
              <p className="text-sm">Start receiving optimized trip requests that match your vehicle types and location.</p>
            </div>
          </div>
        </section>
      </div>
    </InfoLayout>
  );
}
