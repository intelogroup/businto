const fs = require('fs');

async function reload() {
    try {
        const token = 'sbp_cbc5fdecda40c10e48649a2b62eb4397587db43b';
        const projectRef = 'expwyvyphwlyhwrzdmmv';

        console.log('🔄 Reloading PostgREST schema cache...');

        // We can reload by running a NOTIFY command
        const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: "NOTIFY pgrst, 'reload schema';" })
        });

        const text = await res.text();
        console.log('Status:', res.status);
        console.log('Response:', text);

        if (res.status === 200 || res.status === 201) {
            console.log('✅ Schema reload triggered successfully.');
        } else {
            console.log('❌ Failed to reload schema.');
        }
    } catch (err) {
        console.error(err);
    }
}

reload();
