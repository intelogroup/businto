// test-matcher.ts
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { supabaseAdmin } from './src/lib/supabase-server';

async function main() {
    const { data, error } = await supabaseAdmin.from('operators').select('*').limit(1);
    console.log(Object.keys(data[0]));
}

main().catch(console.error);
