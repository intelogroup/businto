import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

async function testOperatorEmail() {
  console.log('🧪 Testing operator email notification...\n');
  
  // Create a test transport request
  const requestData = {
    service_type: 'school',
    pickup_address: '123 Main St, Springfield, IL 62701',
    dropoff_address: '456 School Ave, Springfield, IL 62702',
    pickup_fuzzy: 'Springfield, IL',
    dropoff_fuzzy: 'Springfield School District',
    start_date: '2026-01-20',
    start_time: '07:30 AM',
    is_recurring: true,
    recurrence_pattern: 'daily_weekdays',
    metadata: {
      schedule_type: 'Daily (Mon-Fri)',
      student_count: '25-30 students',
      wheelchair_accessible: true,
      car_seats_needed: false,
      special_needs: true
    },
    user_id: null // Anonymous request for testing
  };

  console.log('📤 Sending test request:');
  console.log(JSON.stringify(requestData, null, 2));
  console.log('\n');

  try {
    const response = await fetch(`${API_URL}/api/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('❌ Request failed:', result.error);
      process.exit(1);
    }

    console.log('✅ Request created successfully!');
    console.log('   Request ID:', result.id);
    console.log('\n📧 Operator emails should be sent via Ethereal...');
    console.log('   Check the server console for Ethereal preview URLs');
    console.log('   All emails will be sent to: jimkalinov@gmail.com (in Ethereal test account)');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testOperatorEmail();
