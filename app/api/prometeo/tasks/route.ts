import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getTenantClient } from '@/lib/supabase/tenant';
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
    const { agent_id, prompt, schedule, notification_type, recipients } = body;

    // Validate required fields
    if (!agent_id || !prompt || !schedule || !recipients?.length) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate cron expression
    let nextRun: Date;
    try {
      const interval = CronExpressionParser.parse(schedule);
      nextRun = interval.next().toDate();
    } catch {
      return NextResponse.json(
        { error: 'Invalid cron schedule' },
        { status: 400 }
      );
    }

    const supabase = await getTenantClient(session.tenant.id);

    // Create task
    const { data, error } = await supabase
      .from('prometeo_tasks')
      .insert({
        agent_id,
        prompt,
        schedule,
        next_run: nextRun.toISOString(),
        notification_type: notification_type || 'push',
        recipients,
        is_active: true,
        created_by: session.user.email,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating prometeo task:', error);
      return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
    }

    return NextResponse.json({ task: data });
  } catch (error) {
    console.error('Prometeo create task error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
