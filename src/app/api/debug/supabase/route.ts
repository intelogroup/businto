import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log('=== Debug Info ===');
  console.log('URL:', url);
  console.log('Key present:', !!key);
  console.log('Key length:', key?.length);
  
  if (!url || !key) {
    return NextResponse.json({
      error: 'Missing environment variables',
      url: !!url,
      key: !!key
    });
  }

  // Test direct query
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data, error, count } = await supabase
    .from('transport_requests')
    .select('id, service_type, pickup_fuzzy', { count: 'exact' })
    .limit(5);

  return NextResponse.json({
    envCheck: {
      urlPresent: !!url,
      keyPresent: !!key,
      urlValue: url
    },
    queryResult: {
      success: !error,
      count,
      error: error?.message,
      sampleData: data?.map(r => ({ id: r.id, type: r.service_type }))
    }
  });
}
