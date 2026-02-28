import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanup() {
  console.log('Cleaning up test trips...');
  
  // Truncating transport_requests with CASCADE will also clear quotes, bookings, etc.
  const { error } = await supabaseAdmin.rpc('execute_sql_cleanup', { 
    sql_query: 'TRUNCATE TABLE public.transport_requests CASCADE;' 
  });

  if (error) {
    // If rpc doesn't exist, try direct delete (might be slower but works if RLS allows or via admin client)
    console.log('RPC cleanup failed, trying direct delete...');
    const { error: deleteError } = await supabaseAdmin
      .from('transport_requests')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      console.error('Failed to cleanup data:', deleteError);
    } else {
      console.log('✅ Successfully cleared transport_requests, quotes, and associated test data.');
    }
  } else {
    console.log('✅ Successfully cleared all test data via CASCADE.');
  }
}

cleanup().then(() => console.log('Cleanup finished.'));
