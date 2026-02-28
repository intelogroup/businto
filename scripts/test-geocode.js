const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function testGeocode() {
  const address = '3, Manni Circle, Barnstable, Massachusetts, 02632, United States';
  const apiUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://businto.vercel.app'}/api/maps/geocode?address=${encodeURIComponent(address)}`;
  
  console.log(`🌐 Geocoding address: ${address}`);
  console.log(`📡 URL: ${apiUrl}`);

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(text);
      return;
    }

    const data = await response.json();
    console.log('✅ Result:', data);
  } catch (error) {
    console.error('💥 Fetch failure:', error);
  }
}

testGeocode().catch(console.error);
