/**
 * Test distance-based operator matching
 * Run with: node scripts/test-distance-matching.js
 */

const { findMatchingOperators } = require('../src/lib/operator-matching');

async function testMatching() {
  console.log('🧪 Testing Distance-Based Operator Matching\n');
  console.log('='.repeat(60));

  // Test 1: Boston pickup (with coordinates)
  console.log('\n📍 Test 1: School Request in Boston');
  console.log('Pickup: 123 Beacon St, Boston, MA 02108');
  console.log('Coordinates: 42.3551, -71.0656\n');

  const bostonMatches = await findMatchingOperators({
    service_type: 'school',
    pickup_address: '123 Beacon St, Boston, MA 02108',
    pickup_fuzzy: 'Beacon Hill, Boston',
    pickup_lat: 42.3551,
    pickup_lng: -71.0656,
    metadata: {
      student_count: 15,
      grade_level: 'elem',
      schedule_type: 'round-trip'
    }
  });

  console.log(`✅ Found ${bostonMatches.length} matching operators:\n`);
  bostonMatches.forEach((op, idx) => {
    console.log(`${idx + 1}. ${op.company_name}`);
    console.log(`   Distance: ${op.distance}mi | Score: ${op.score} | Rating: ${op.rating}⭐`);
    console.log(`   Email: ${op.company_email}`);
    console.log(`   Active Quotes: ${op.active_quotes_count || 0}`);
    console.log();
  });

  // Test 2: Cambridge pickup (medical)
  console.log('\n' + '='.repeat(60));
  console.log('\n📍 Test 2: Medical Request in Cambridge');
  console.log('Pickup: 456 Harvard St, Cambridge, MA');
  console.log('Coordinates: 42.3736, -71.1097\n');

  const cambridgeMatches = await findMatchingOperators({
    service_type: 'medical',
    pickup_address: '456 Harvard St, Cambridge, MA 02139',
    pickup_fuzzy: 'Cambridge, MA',
    pickup_lat: 42.3736,
    pickup_lng: -71.1097,
    metadata: {
      mobility_level: 'wheelchair',
      service_level: 'door-to-door'
    }
  });

  console.log(`✅ Found ${cambridgeMatches.length} matching operators:\n`);
  cambridgeMatches.forEach((op, idx) => {
    console.log(`${idx + 1}. ${op.company_name}`);
    console.log(`   Distance: ${op.distance}mi | Score: ${op.score} | Rating: ${op.rating}⭐`);
    console.log(`   Email: ${op.company_email}`);
    console.log();
  });

  // Test 3: Springfield pickup (far from most operators)
  console.log('\n' + '='.repeat(60));
  console.log('\n📍 Test 3: Wedding Request in Springfield, MA');
  console.log('Pickup: Springfield, MA');
  console.log('Coordinates: 42.1015, -72.5898\n');

  const springfieldMatches = await findMatchingOperators({
    service_type: 'wedding',
    pickup_address: 'Springfield, MA 01103',
    pickup_fuzzy: 'Springfield, MA',
    pickup_lat: 42.1015,
    pickup_lng: -72.5898,
    metadata: {
      guest_count: 100,
      vehicle_style: 'coach'
    }
  });

  console.log(`✅ Found ${springfieldMatches.length} matching operators:\n`);
  springfieldMatches.forEach((op, idx) => {
    console.log(`${idx + 1}. ${op.company_name}`);
    console.log(`   Distance: ${op.distance}mi | Score: ${op.score} | Rating: ${op.rating}⭐`);
    console.log(`   Email: ${op.company_email}`);
    console.log();
  });

  // Test 4: Without coordinates (fallback)
  console.log('\n' + '='.repeat(60));
  console.log('\n📍 Test 4: Request without coordinates (fallback mode)');
  console.log('Pickup: Unknown location, MA\n');

  const fallbackMatches = await findMatchingOperators({
    service_type: 'school',
    pickup_address: 'Massachusetts',
    pickup_fuzzy: 'MA',
    metadata: {}
  });

  console.log(`✅ Found ${fallbackMatches.length} operators (rating-based fallback):\n`);
  fallbackMatches.slice(0, 5).forEach((op, idx) => {
    console.log(`${idx + 1}. ${op.company_name} - Rating: ${op.rating}⭐`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('\n✅ All tests complete!\n');
  console.log('📊 Summary:');
  console.log(`  • Boston (dense area): ${bostonMatches.length} matches`);
  console.log(`  • Cambridge: ${cambridgeMatches.length} matches`);
  console.log(`  • Springfield (rural): ${springfieldMatches.length} matches`);
  console.log(`  • No coordinates: ${fallbackMatches.length} matches (fallback)`);
  console.log('\n💡 Distance-based matching ensures only nearby, relevant operators are notified!');
}

// Run tests
testMatching().catch(console.error);
