import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log('Testing query for ID:', id);

  const { data, error } = await supabase
    .from('transport_requests')
    .select('id, service_type, pickup_fuzzy, metadata_safe')
    .eq('id', id)
    .single();

  console.log('Result:', { data, error });

  return NextResponse.json({
    requestId: id,
    found: !!data,
    error: error?.message,
    data: data || null
  });
}
