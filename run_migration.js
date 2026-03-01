const fs = require('fs');

async function run() {
  try {
    const token = 'sbp_cbc5fdecda40c10e48649a2b62eb4397587db43b';
    const projectRef = 'expwyvyphwlyhwrzdmmv';
    const sql = fs.readFileSync('supabase/migrations/20260301060000_fix_transport_requests_rls_leak.sql', 'utf8');

    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: sql })
    });

    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text);
  } catch (err) {
    console.error(err);
  }
}

run();
