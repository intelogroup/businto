import { InfoLayout } from "@/components/ui/info-layout";

export default function PrivacyPage() {
  return (
    <InfoLayout 
      title="Privacy Policy" 
      subtitle="Last updated: February 27, 2026"
    >
      <div className="space-y-8 text-neutral-600 prose prose-neutral max-w-none">
        <p>
          At Businto, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, 
          and safeguard your information when you use our platform.
        </p>

        <section>
          <h2 className="text-xl font-semibold text-neutral-900">1. Information We Collect</h2>
          <p>
            We collect information that you provide directly to us when you create an account, request a ride, 
            or communicate with our support team. This includes:
          </p>
          <ul>
            <li>Name, email address, and phone number</li>
            <li>Location data for routing and matching</li>
            <li>Payment information processed through our secure partners</li>
            <li>Trip details and specialized transport requirements</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-neutral-900">2. How We Use Your Information</h2>
          <p>
            We use the information we collect to provide, maintain, and improve our services, including:
          </p>
          <ul>
            <li>Matching riders with vetted operators</li>
            <li>Optimizing routes and itineraries</li>
            <li>Processing payments and billing</li>
            <li>Sending service-related notifications</li>
            <li>Ensuring safety and compliance across our network</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-neutral-900">3. Information Sharing</h2>
          <p>
            We share relevant information with operators in our network to facilitate your requested trips. 
            We do not sell your personal data to third parties.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-neutral-900">4. Data Security</h2>
          <p>
            We implement industry-standard security measures to protect your information, including encryption 
            for sensitive data and secure server environments.
          </p>
        </section>

        <section className="bg-white p-6 rounded-lg border border-neutral-100">
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">Contact Us About Privacy</h3>
          <p className="text-sm">
            If you have questions about this policy or our data practices, please contact us at privacy@businto.com.
          </p>
        </section>
      </div>
    </InfoLayout>
  );
}
