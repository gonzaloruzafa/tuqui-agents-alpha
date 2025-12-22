/**
 * Test Prometeo v2 - Notifications + Conditional Tasks
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { createClient } from '@supabase/supabase-js';

// Use same config as test-integration.ts
const TENANT_URL = process.env.INITIAL_TENANT_URL || 'https://ancgbbzvfhoqqxiueyoz.supabase.co';
const TENANT_KEY = process.env.INITIAL_TENANT_SERVICE_KEY || '';
const TEST_EMAIL = 'test@adhoc.com.ar';

const supabase = createClient(TENANT_URL, TENANT_KEY);

async function test() {
  console.log('🧪 Testing Prometeo v2...\n');
  let passed = 0;
  let failed = 0;

  // Test 1: Check new columns exist
  console.log('1️⃣ Testing new columns in prometeo_tasks...');
  const { data: tasks, error: tasksError } = await supabase
    .from('prometeo_tasks')
    .select('id, task_type, condition, check_interval, priority')
    .limit(1);
  
  if (!tasksError) {
    console.log('   ✅ New columns exist (task_type, condition, check_interval, priority)');
    passed++;
  } else {
    console.log('   ❌ Error:', tasksError.message);
    failed++;
  }

  // Test 2: Check notifications table exists
  console.log('\n2️⃣ Testing notifications table...');
  const { error: notifError } = await supabase
    .from('notifications')
    .select('id')
    .limit(1);
  
  if (!notifError) {
    console.log('   ✅ notifications table exists');
    passed++;
  } else {
    console.log('   ❌ notifications table error:', notifError.message);
    failed++;
  }

  // Test 3: Check prometeo_executions table exists
  console.log('\n3️⃣ Testing prometeo_executions table...');
  const { error: execError } = await supabase
    .from('prometeo_executions')
    .select('id')
    .limit(1);
  
  if (!execError) {
    console.log('   ✅ prometeo_executions table exists');
    passed++;
  } else {
    console.log('   ❌ prometeo_executions table error:', execError.message);
    failed++;
  }

  // Test 4: Create a test notification
  console.log('\n4️⃣ Testing notification CRUD...');
  const { data: notif, error: createError } = await supabase
    .from('notifications')
    .insert({
      user_email: TEST_EMAIL,
      title: '🧪 Test Notification',
      body: 'This is a test notification from Prometeo v2',
      priority: 'info',
      is_read: false
    })
    .select()
    .single();

  if (notif && !createError) {
    console.log('   ✅ CREATE: Notification created:', notif.id);
    
    // Read
    const { data: readNotif } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', notif.id)
      .single();

    if (readNotif) {
      console.log('   ✅ READ: Title:', readNotif.title, '| Priority:', readNotif.priority);
    }

    // Update
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notif.id);

    if (!updateError) {
      console.log('   ✅ UPDATE: Marked as read');
    }

    // Delete
    const { error: deleteError } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notif.id);

    if (!deleteError) {
      console.log('   ✅ DELETE: Test notification cleaned up');
    }
    passed++;
  } else {
    console.log('   ❌ Failed to create notification:', createError?.message);
    failed++;
  }

  // Test 5: Test all priority values
  console.log('\n5️⃣ Testing priority constraints...');
  let priorityPass = true;
  for (const priority of ['info', 'warning', 'critical']) {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_email: TEST_EMAIL,
        title: `Test ${priority}`,
        body: 'Test',
        priority
      })
      .select()
      .single();

    if (!error && data) {
      await supabase.from('notifications').delete().eq('id', data.id);
    } else {
      console.log(`   ❌ Priority '${priority}' failed:`, error?.message);
      priorityPass = false;
    }
  }
  if (priorityPass) {
    console.log('   ✅ All priorities work (info, warning, critical)');
    passed++;
  } else {
    failed++;
  }

  // Test 6: Test unread count
  console.log('\n6️⃣ Testing unread count query...');
  const { count, error: countError } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_email', TEST_EMAIL)
    .eq('is_read', false);

  if (!countError) {
    console.log('   ✅ Unread count works. Current unread:', count);
    passed++;
  } else {
    console.log('   ❌ Count query failed:', countError.message);
    failed++;
  }

  // Test 7: Test task_type values
  console.log('\n7️⃣ Testing existing tasks...');
  const { data: existingTasks } = await supabase
    .from('prometeo_tasks')
    .select('id, name, task_type, priority')
    .limit(5);
  
  if (existingTasks) {
    console.log('   ✅ task_type column accessible');
    if (existingTasks.length > 0) {
      console.log('   📋 Existing tasks:');
      existingTasks.forEach(t => {
        console.log(`      - ${t.name || 'Unnamed'}: type=${t.task_type || 'scheduled'}, priority=${t.priority || 'info'}`);
      });
    } else {
      console.log('   📋 No tasks created yet');
    }
    passed++;
  } else {
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed === 0) {
    console.log('\n🎉 All Prometeo v2 tests passed!');
    console.log('\n📋 Ready to use:');
    console.log('   • /admin/prometeo - Create conditional tasks');
    console.log('   • 🔔 Header bell - See notifications');
    console.log('   • /admin/notifications - Full inbox');
  }

  process.exit(failed > 0 ? 1 : 0);
}

test().catch(console.error);
