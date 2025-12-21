import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getTenantClient } from '@/lib/supabase/tenant';
import { executePrometeoTask } from '@/lib/prometeo/runner';

export async function POST(
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

    // Fetch task
    const { data: task, error } = await supabase
      .from('prometeo_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (error || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Execute the task
    const result = await executePrometeoTask(session.tenant.id, task);

    // Update last_run
    await supabase
      .from('prometeo_tasks')
      .update({
        last_run: new Date().toISOString(),
        last_result: result.success ? 'success' : 'error',
      })
      .eq('id', taskId);

    return NextResponse.json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    console.error('Prometeo run task error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
