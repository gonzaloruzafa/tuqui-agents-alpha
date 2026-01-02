import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getTenantClient } from '@/lib/supabase/client';
import { CronExpressionParser } from 'cron-parser';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email || !session.tenant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getTenantClient(session.tenant.id);

    // Fetch tasks with agent names
    const { data: tasks, error } = await supabase
      .from('prometeo_tasks')
      .select(`
        *,
        agents:agent_id (name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching prometeo tasks:', error);
      return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }

    // Format tasks with agent names
    const formattedTasks = (tasks || []).map((task: any) => ({
      ...task,
      agent_name: task.agents?.name || 'Unknown',
      agents: undefined, // Remove nested object
    }));

    return NextResponse.json({ tasks: formattedTasks });
  } catch (error) {
    console.error('Prometeo tasks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email || !session.tenant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      agent_id, 
      prompt, 
      schedule, 
      notification_type, 
      recipients,
      // Prometeo v2 fields
      task_type = 'scheduled',
      condition,
      check_interval,
      priority = 'info'
    } = body;

    // Validate required fields
    if (!agent_id || !prompt || !recipients?.length) {
      return NextResponse.json(
        { error: 'Missing required fields: agent_id, prompt, recipients' },
        { status: 400 }
      );
    }

    // Conditional tasks need a condition
    if (task_type === 'conditional' && !condition) {
      return NextResponse.json(
        { error: 'Conditional tasks require a condition' },
        { status: 400 }
      );
    }

    // Scheduled tasks need a schedule
    if (task_type === 'scheduled' && !schedule) {
      return NextResponse.json(
        { error: 'Scheduled tasks require a cron schedule' },
        { status: 400 }
      );
    }

    // Determine the effective schedule for next_run calculation
    const effectiveSchedule = task_type === 'conditional' ? (check_interval || '*/15 * * * *') : schedule;
    
    // Validate cron expression
    let nextRun: Date;
    try {
      const interval = CronExpressionParser.parse(effectiveSchedule);
      nextRun = interval.next().toDate();
    } catch {
      return NextResponse.json(
        { error: 'Invalid cron schedule' },
        { status: 400 }
      );
    }

    const supabase = await getTenantClient(session.tenant.id);

    // Create task with v2 fields
    const { data, error } = await supabase
      .from('prometeo_tasks')
      .insert({
        tenant_id: session.tenant.id,
        agent_id,
        user_email: session.user.email, // Required NOT NULL field
        name: body.name || '', // Optional name
        prompt,
        schedule: task_type === 'scheduled' ? schedule : null,
        next_run: nextRun.toISOString(),
        notification_type: notification_type || 'in_app',
        recipients,
        is_active: true,
        created_by: session.user.email,
        // Prometeo v2 fields
        task_type,
        condition: task_type === 'conditional' ? condition : null,
        check_interval: task_type === 'conditional' ? (check_interval || '*/15 * * * *') : null,
        priority,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating prometeo task:', error);
      return NextResponse.json({ 
        error: `Failed to create task: ${error.message || 'Unknown error'}`,
        details: error
      }, { status: 500 });
    }

    return NextResponse.json({ task: data });
  } catch (error) {
    console.error('Prometeo create task error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
