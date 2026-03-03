import { Quote, TripRequest } from "@/types/quotes";
import { Star, CheckCircle2, Clock, TrendingDown, Award } from "lucide-react";

interface MultipleQuotesEmailProps {
  tripRequest: TripRequest;
  quotes: Quote[];
}

export function MultipleQuotesEmail({ tripRequest, quotes }: MultipleQuotesEmailProps) {
  const prices = quotes.map(q => q.totalPrice);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgResponse = Math.round(quotes.reduce((sum, q) => sum + q.responseTime, 0) / quotes.length);

  const topQuotes = quotes.slice(0, 3);
  const remainingCount = quotes.length - 3;

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-lg overflow-hidden font-sans border border-neutral-200 text-neutral-900 shadow-sm">
      {/* Subject Line Preview */}
      <div className="bg-white p-3 text-xs text-neutral-500 border-b border-neutral-200">
        <span className="font-bold text-neutral-700">Subject:</span> {quotes.length} operators want your route! Compare quotes now
      </div>

      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-8">
        <div className="text-center">
          <div className="text-5xl mb-4">📊</div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Your quote comparison is ready</h1>
          <p className="text-indigo-100">{quotes.length} operators competing for your business</p>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 border-b border-indigo-100">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4 text-center shadow-sm border border-indigo-100">
            <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">Quotes</div>
            <div className="text-3xl font-bold text-indigo-900">{quotes.length}</div>
          </div>
          <div className="bg-white rounded-lg p-4 text-center shadow-sm border border-green-100">
            <div className="text-xs font-bold text-green-600 uppercase tracking-wider mb-1">Price Range</div>
            <div className="text-2xl font-bold text-green-900">${minPrice} - ${maxPrice}</div>
          </div>
          <div className="bg-white rounded-lg p-4 text-center shadow-sm border border-amber-100">
            <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">Avg Response</div>
            <div className="text-3xl font-bold text-amber-900">{avgResponse}m</div>
          </div>
        </div>
      </div>

      {/* Top Quotes */}
      <div className="p-6 space-y-4">
        <h2 className="text-xl font-bold text-neutral-900 mb-4">Top Quotes</h2>

        {topQuotes.map((quote, idx) => (
          <div
            key={quote.id}
            className={`bg-white rounded-lg p-5 border-2 ${
              quote.isLowestPrice ? 'border-green-500 bg-green-50' :
              quote.isHighestRated ? 'border-amber-500 bg-amber-50' :
              'border-neutral-200'
            }`}
          >
            {/* Badges */}
            <div className="flex gap-2 mb-3">
              {quote.isLowestPrice && (
                <div className="bg-green-600 text-white text-[10px] font-bold uppercase px-2 py-1 rounded-full flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" />
                  Lowest Price
                </div>
              )}
              {quote.isHighestRated && (
                <div className="bg-amber-600 text-white text-[10px] font-bold uppercase px-2 py-1 rounded-full flex items-center gap-1">
                  <Award className="w-3 h-3" />
                  Top Rated
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-lg text-neutral-900">{quote.operatorName}</div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span className="font-semibold text-sm">{quote.operatorRating.toFixed(1)}</span>
                  </div>
                  {quote.coriCertified && (
                    <>
                      <span className="text-neutral-300">•</span>
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="w-3 h-3" />
                        CORI
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-indigo-600">${quote.totalPrice}</div>
                {quote.discount && (
                  <div className="text-xs text-red-600 font-bold">
                    {quote.discount.percentage}% OFF
                  </div>
                )}
              </div>
            </div>

            {quote.operatorNote && (
              <div className="mt-3 bg-white rounded-lg p-3 border border-neutral-200">
                <div className="text-xs text-neutral-500 italic">"{quote.operatorNote}"</div>
              </div>
            )}
          </div>
        ))}

        {remainingCount > 0 && (
          <div className="text-center py-2 text-sm font-semibold text-neutral-500">
            +{remainingCount} more quote{remainingCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Urgency Timer */}
      <div className="px-6 pb-6">
        <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg p-4 border border-red-200">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-red-600" />
            <div>
              <div className="font-bold text-red-900">Quotes expire soon!</div>
              <div className="text-sm text-red-700">Review and accept within 2 hours</div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="p-6 pt-0">
        <button className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-4 px-6 rounded-lg shadow-lg shadow-indigo-600/30 transition-colors duration-150 active:scale-[0.98]">
          Compare All Quotes →
        </button>
      </div>

      {/* Features */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 border-t border-green-100">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-green-800">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span>All operators CORI certified</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-green-800">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span>Fully insured & licensed</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-green-800">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span>Direct messaging included</span>
          </div>
        </div>
      </div>
    </div>
  );
}
