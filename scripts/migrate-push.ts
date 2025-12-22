import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { createClient } from '@supabase/supabase-js';

const TENANT_URL = process.env.INITIAL_TENANT_URL || 'https://ancgbbzvfhoqqxiueyoz.supabase.co';
const TENANT_SERVICE_KEY = process.env.INITIAL_TENANT_SERVICE_KEY!;

if (!TENANT_SERVICE_KEY) {
  console.error('❌ INITIAL_TENANT_SERVICE_KEY not set in .env.local');
  process.exit(1);
}

async function runMigration() {
  console.log('📦 Creating push_subscriptions table...\n');

  const supabase = createClient(TENANT_URL, TENANT_SERVICE_KEY, {
    db: { schema: 'public' }
  });

  // The SQL to execute
  const sql = `
    -- Push Subscriptions Table
    create table if not exists push_subscriptions (
      id uuid default gen_random_uuid() primary key,
      user_email text not null,
      subscription jsonb not null,
      created_at timestamp with time zone default timezone('utc'::text, now()) not null,
      updated_at timestamp with time zone default timezone('utc'::text, now()) not null
    );

    -- Index for looking up subscriptions by user
    create index if not exists idx_push_subscriptions_user_email 
      on push_subscriptions(user_email);
  `;

  console.log('SQL to run:');
  console.log(sql);
  console.log('\n⚠️  You need to run this SQL manually in Supabase SQL Editor:');
  console.log(`   ${TENANT_URL.replace('.co', '.co/project/ancgbbzvfhoqqxiueyoz/sql/new')}`);
  console.log('\nAlternatively, use the Supabase CLI or Dashboard.');
  
  // Try to insert a test and see if table exists
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id')
    .limit(1);
    
  if (error) {
    if (error.code === 'PGRST204' || error.message.includes('does not exist') || error.code === '42P01') {
      console.log('\n❌ Table push_subscriptions does NOT exist');
      console.log('   Please run the SQL above in Supabase SQL Editor');
    } else {
      console.log('\n⚠️  Got unexpected error:', error);
    }
  } else {
    console.log('\n✅ Table push_subscriptions already exists!');
    console.log(`   Found ${data?.length || 0} rows`);
  }
}

runMigration().catch(console.error);
