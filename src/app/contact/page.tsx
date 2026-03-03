import { InfoLayout } from "@/components/ui/info-layout";
import { Mail, Phone, MapPin, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ContactPage() {
  return (
    <InfoLayout 
      title="Contact Us" 
      subtitle="How can we help optimize your transportation network?"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
        <div className="space-y-10">
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold text-neutral-900">Get in Touch</h2>
            <p className="text-neutral-600">
              Whether you're looking for a ride, wanting to join our operator network, 
              or have a general inquiry, our team is here to help.
            </p>
          </div>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-white rounded-md">
                <Mail className="w-5 h-5 text-neutral-600" />
              </div>
              <div>
                <h4 className="font-semibold text-neutral-900">Email</h4>
                <p className="text-sm text-neutral-500">support@businto.com</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="p-2 bg-white rounded-md">
                <Phone className="w-5 h-5 text-neutral-600" />
              </div>
              <div>
                <h4 className="font-semibold text-neutral-900">Phone</h4>
                <p className="text-sm text-neutral-500">1-800-BUSINTO</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="p-2 bg-white rounded-md">
                <MapPin className="w-5 h-5 text-neutral-600" />
              </div>
              <div>
                <h4 className="font-semibold text-neutral-900">Headquarters</h4>
                <p className="text-sm text-neutral-500">Boston, MA</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-lg border border-neutral-100 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-neutral-900">Send a Message</h3>
            <p className="text-xs text-neutral-500 font-medium uppercase tracking-widest">Expected response: &lt; 24 hours</p>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Full Name</label>
              <Input placeholder="Your Name" className="h-10 bg-white border-neutral-200" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Email Address</label>
              <Input placeholder="email@example.com" className="h-10 bg-white border-neutral-200" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Message</label>
              <textarea 
                className="w-full min-h-[120px] p-4 rounded-md border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" 
                placeholder="How can we help?"
              />
            </div>
            <Button className="w-full h-10 bg-neutral-950 text-white font-semibold rounded-md">
              Send Message
            </Button>
          </div>
        </div>
      </div>
    </InfoLayout>
  );
}
