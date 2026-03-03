import { InfoLayout } from "@/components/ui/info-layout";
import { ShieldCheck, CheckCircle2, Users, FileCheck } from "lucide-react";

export default function SafetyPage() {
  const standards = [
    {
      icon: <ShieldCheck className="w-6 h-6 text-green-600" />,
      title: "Vetted Operators",
      description: "Every operator in our network undergoes a rigorous multi-step verification process including insurance audits and safety record reviews."
    },
    {
      icon: <Users className="w-6 h-6 text-blue-600" />,
      title: "Driver Standards",
      description: "We enforce strict background checks and training requirements for all drivers operating under the Businto network."
    },
    {
      icon: <FileCheck className="w-6 h-6 text-amber-600" />,
      title: "Compliance Monitoring",
      description: "Our platform continuously monitors operator compliance with local and federal transportation regulations."
    },
    {
      icon: <CheckCircle2 className="w-6 h-6 text-indigo-600" />,
      title: "Vehicle Inspections",
      description: "Operators are required to maintain up-to-date maintenance logs and pass periodic vehicle safety inspections."
    }
  ];

  return (
    <InfoLayout 
      title="Safety Standard" 
      subtitle="Safety is the foundation of everything we build."
    >
      <div className="space-y-12 text-neutral-600">
        <section className="prose prose-neutral max-w-none">
          <p className="text-lg">
            At Businto, we understand that we aren't just moving vehicles; we're moving people. 
            Whether it's a student, a patient, or a wedding guest, their safety is our absolute priority. 
            Our Safety Standard is a comprehensive framework designed to ensure peace of mind for every trip.
          </p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {standards.map((standard, index) => (
            <div key={index} className="p-6 border border-neutral-100 rounded-lg bg-white shadow-sm space-y-4">
              <div className="p-2 bg-white w-fit rounded-md">
                {standard.icon}
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">{standard.title}</h3>
              <p className="text-sm leading-relaxed">{standard.description}</p>
            </div>
          ))}
        </div>

        <section className="bg-neutral-900 text-white p-8 rounded-lg space-y-4">
          <h2 className="text-2xl font-semibold">Our Commitment</h2>
          <p className="text-neutral-400">
            We are committed to continuous improvement. We regularly update our safety protocols to exceed 
            industry standards and leverage new technologies to make specialized transport safer than ever before.
          </p>
        </section>
      </div>
    </InfoLayout>
  );
}
