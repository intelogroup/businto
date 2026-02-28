import { InfoLayout } from "@/components/ui/info-layout";

export default function TermsPage() {
  return (
    <InfoLayout 
      title="Terms of Service" 
      subtitle="Last updated: February 27, 2026"
    >
      <div className="space-y-8 text-neutral-600 prose prose-neutral max-w-none">
        <p>
          Welcome to Businto. By accessing our platform, you agree to comply with and be bound by the 
          following terms and conditions.
        </p>

        <section>
          <h2 className="text-xl font-semibold text-neutral-900">1. Acceptance of Terms</h2>
          <p>
            By using Businto, you agree to these Terms of Service and our Privacy Policy. If you do not agree 
            to these terms, please do not use our services.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-neutral-900">2. Service Description</h2>
          <p>
            Businto provides a technology platform that connects users with third-party transportation operators. 
            Businto is not a transportation carrier and does not provide transportation services directly.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-neutral-900">3. User Responsibilities</h2>
          <p>
            Users are responsible for providing accurate information for all requests and for complying with 
            the safety protocols of the matched operator.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-neutral-900">4. Payments and Billing</h2>
          <p>
            You agree to pay all fees associated with your requests. Fees are non-refundable unless otherwise 
            specified by the matched operator or required by law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-neutral-900">5. Limitation of Liability</h2>
          <p>
            Businto is not liable for the actions, errors, or omissions of third-party operators. Our liability 
            is limited to the maximum extent permitted by applicable law.
          </p>
        </section>

        <section className="bg-neutral-50 p-6 rounded-lg border border-neutral-100">
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">Legal Inquiries</h3>
          <p className="text-sm">
            For legal notices or formal inquiries, please contact legal@businto.com.
          </p>
        </section>
      </div>
    </InfoLayout>
  );
}
