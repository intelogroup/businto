const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const { findMatchingOperators } = require('../src/lib/operator-matching');

async function debugMatching() {
  const request = {
    service_type: 'medical',
    pickup_address: '3, Manni Circle, Barnstable, Massachusetts, 02632, United States',
    pickup_fuzzy: '3, Manni Circle, Barnstable, Massachusetts, 02632, United States',
    metadata: {
      note: "Ready",
      trip_type: "one-way",
      oxygen_use: true,
      is_bariatric: false,
      is_immediate: true,
      stair_factor: "none",
      service_level: "door-to-door",
      mobility_level: "ambulatory",
      service_animal: false,
      appointment_time: "",
      facility_details: "entrance",
      medical_start_date: "",
      additional_passengers: 1
    }
  };

  console.log('🔍 Debugging matching for request:', JSON.stringify(request, null, 2));
  
  const matched = await findMatchingOperators(request);
  
  console.log('
✅ Result: Found', matched.length, 'operators');
  if (matched.length > 0) {
    console.log('Operators:', matched.map(o => o.company_name).join(', '));
  }
}

debugMatching().catch(console.error);
