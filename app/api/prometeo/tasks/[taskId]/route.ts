import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getTenantClient } from '@/lib/supabase/tenant';
import { CronExpressionParser } from 'cron-parser';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email || !session.tenant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { taskId } = await params;
    const supabase = await getTenantClient(session.tenant.id);

    const { data: task, error } = await supabase
      .from('prometeo_tasks')
      .select(`
        *,
        agents:agent_id (name)
      `)
      .eq('id', taskId)
      .single();

    if (error || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ task: { ...task, agent_name: task.agents?.name } });
  } catch (error) {
    console.error('Prometeo get task error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email || !session.tenant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { taskId } = await params;
    const body = await request.json();
    
    const supabase = await getTenantClient(session.tenant.id);

    // Build update object with only allowed fields
    const allowedFields = ['prompt', 'schedule', 'notification_type', 'recipients', 'is_active'];
    const updateData: Record<string, any> = {};
    
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // If schedule changed, recalculate next_run
    if (updateData.schedule) {
      try {
        const interval = CronExpressionParser.parse(updateData.schedule);
        updateData.next_run = interval.next().toDate().toISOString();
      } catch {
        return NextResponse.json(
          { error: 'Invalid cron schedule' },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from('prometeo_tasks')
      .update(updateData)
      .eq('id', taskId)
      .select()
      .single();

    if (error) {
      console.error('Error updating prometeo task:', error);
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
    }

    return NextResponse.json({ task: data });
  } catch (error) {
    console.error('Prometeo update task error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email || !session.tenant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { taskId } = await params;
    const supabase = await getTenantClient(session.tenant.id);

    const { error } = await supabase
      .from('prometeo_tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      console.error('Error deleting prometeo task:', error);
      return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Prometeo delete task error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
