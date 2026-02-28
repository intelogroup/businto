const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('operators').select('*');
  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(data[0], null, 2));
    console.log(`Total operators: ${data.length}`);
  }
}
check();
