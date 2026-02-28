import { InfoLayout } from "@/components/ui/info-layout";

export default function AboutPage() {
  return (
    <InfoLayout 
      title="About Businto" 
      subtitle="The future of private logistics and specialized transportation."
    >
      <div className="space-y-8 text-neutral-600">
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-neutral-900">Our Mission</h2>
          <p>
            At Businto, we are on a mission to simplify specialized transportation. Whether it's a daily school run, 
            a critical medical appointment, or a high-stakes corporate event, we believe that logistics should 
            be seamless, transparent, and reliable.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-neutral-900">Why We Exist</h2>
          <p>
            The private transportation industry has long been fragmented. Schools struggle to find reliable operators, 
            patients face uncertainty with medical transport, and event planners spend hours coordinating shuttles. 
            Businto bridges this gap with an intelligent platform that connects vetted operators with those who 
            need them most.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-neutral-900">Our Technology</h2>
          <p>
            We leverage advanced routing algorithms and real-time data to optimize every trip. Our platform 
            provides operators with the tools they need to manage their fleets efficiently, while giving 
            customers peace of mind through transparency and consistent service standards.
          </p>
        </section>

        <section className="bg-neutral-50 p-8 rounded-lg border border-neutral-100">
          <h3 className="text-xl font-semibold text-neutral-900 mb-2">Based in Boston</h3>
          <p className="text-sm">
            Businto is headquartered in the heart of Boston, MA, serving as a hub for transportation innovation 
            across the Northeast and beyond.
          </p>
        </section>
      </div>
    </InfoLayout>
  );
}
