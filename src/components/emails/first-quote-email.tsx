import { Quote, TripRequest } from "@/types/quotes";
import { Star, CheckCircle2, Clock } from "lucide-react";

interface FirstQuoteEmailProps {
  tripRequest: TripRequest;
  quote: Quote;
}

export function FirstQuoteEmail({ tripRequest, quote }: FirstQuoteEmailProps) {
  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-xl overflow-hidden font-sans border border-neutral-200 text-neutral-900 shadow-sm">
      {/* Subject Line Preview */}
      <div className="bg-neutral-100 p-3 text-xs text-neutral-500 border-b border-neutral-200">
        <span className="font-bold text-neutral-700">Subject:</span> 🎉 Your first quote is here! ({tripRequest.service_type === 'school' ? 'School Run' : 'Trip'} - {tripRequest.pickup_date})
      </div>

      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-8">
        <div className="text-center">
          <div className="text-5xl mb-4">🚌</div>
          <h1 className="text-3xl font-black tracking-tight mb-2">You've got quotes!</h1>
          <p className="text-indigo-100">An operator is ready to serve you</p>
        </div>
      </div>

      {/* Request Summary */}
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 border-b border-indigo-100">
        <div className="text-center space-y-2">
          <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
            {tripRequest.service_type === 'school' ? 'School Run' :
             tripRequest.service_type === 'medical' ? 'Care Ride' :
             tripRequest.service_type === 'wedding' ? 'Event Shuttle' : 'Trip Request'}
          </div>
          <div className="font-bold text-lg text-neutral-900">
            {tripRequest.pickup_date && new Date(tripRequest.pickup_date).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </div>
          <div className="text-sm text-neutral-600">
            {tripRequest.pickup_fuzzy_location} → {tripRequest.dropoff_fuzzy_location}
          </div>
          {tripRequest.pickup_time && (
            <div className="text-sm text-neutral-500">
              Pickup at {tripRequest.pickup_time}
            </div>
          )}
        </div>

        {/* Quote Badge */}
        <div className="mt-6 bg-white rounded-2xl p-6 shadow-sm border border-indigo-100 text-center">
          <div className="text-6xl font-black text-indigo-600 mb-2">1</div>
          <div className="text-lg font-bold text-neutral-900">quote received</div>
          <div className="text-sm text-neutral-500 mt-1">More coming in...</div>
        </div>
      </div>

      {/* Quote Preview */}
      <div className="p-6 space-y-4">
        <h2 className="text-xl font-black text-neutral-900 mb-4">Quote Preview</h2>

        <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200">
          {/* Operator Info */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-bold text-xl text-neutral-900">{quote.operatorName}</div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="font-semibold text-sm">{quote.operatorRating.toFixed(1)}</span>
                </div>
                <span className="text-neutral-300">•</span>
                <span className="text-sm text-neutral-500">{quote.operatorReviewCount} reviews</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-indigo-600">${quote.totalPrice}</div>
              <div className="text-xs text-neutral-500">per trip</div>
            </div>
          </div>

          {/* Credentials */}
          <div className="flex items-center gap-3 mb-4">
            {quote.coriCertified && (
              <div className="flex items-center gap-1 text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-full border border-green-200">
                <CheckCircle2 className="w-3 h-3" />
                CORI Certified
              </div>
            )}
            {quote.insuranceVerified && (
              <div className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full border border-blue-200">
                <CheckCircle2 className="w-3 h-3" />
                Insured
              </div>
            )}
          </div>

          {/* Response Time */}
          <div className="flex items-center gap-2 text-sm text-neutral-600 bg-white rounded-lg p-3 border border-neutral-100">
            <Clock className="w-4 h-4 text-indigo-600" />
            <span>Responded in <strong>{quote.responseTime} minutes</strong></span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="p-6 pt-2">
        <button className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98]">
          View Quote Details →
        </button>
        <div className="text-center mt-4">
          <a href="#" className="text-sm font-semibold text-neutral-500 hover:text-indigo-600 transition-colors">
            Wait for more quotes
          </a>
        </div>
      </div>

      {/* Footer Tip */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-6 border-t border-amber-100">
        <div className="flex items-start gap-3">
          <div className="text-2xl">💡</div>
          <div>
            <div className="font-bold text-amber-900 mb-1">Tip</div>
            <div className="text-sm text-amber-800">
              Most operators respond within 15 minutes. We'll notify you as more quotes arrive!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
