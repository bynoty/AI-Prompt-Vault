const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'C:/Users/i1032010/antigravity/AI-Prompt-Vault/.env' });

const url = process.env.SUPABASE_URL || "https://ijpiebqfhsgalypfesti.supabase.co";
const key = process.env.SUPABASE_ANON_KEY;
const fallbackKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqcGllYnFmaHNnYWx5cGZlc3RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0NjA4NjcsImV4cCI6MjEwMDAzNjg2N30.hInRP9QQSD_FI0R0-aIUwDARHrG8vHfLYshEGXDFOno';

async function test(keyToUse, label) {
    console.log(`Testing ${label}...`);
    const supabase = createClient(url, keyToUse);
    try {
        const { data, error } = await supabase.from('prompts').select('id').limit(1);
        if (error) {
            console.log(`  Error: ${error.message} (Code: ${error.code})`);
        } else {
            console.log(`  Success! Connection OK. Data length: ${data.length}`);
        }
    } catch (e) {
        console.log(`  Exception: ${e.message}`);
    }
}

async function run() {
    await test(key, ".env Key");
    await test(fallbackKey, "Fallback Key");
}

run();
