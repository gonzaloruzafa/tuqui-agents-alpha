import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getTenantClient } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email || !session.tenant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { subscription } = await request.json();
    const tenantId = session.tenant.id;

    if (!subscription) {
      return NextResponse.json(
        { error: 'Missing subscription' },
        { status: 400 }
      );
    }

    const supabase = await getTenantClient(tenantId);

    // Check if subscription with same endpoint already exists
    const endpoint = subscription.endpoint;
    const { data: existing } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_email', session.user.email)
      .filter('subscription->>endpoint', 'eq', endpoint)
      .maybeSingle();

    let data, error;
    
    if (existing) {
      // Update existing subscription
      const result = await supabase
        .from('push_subscriptions')
        .update({ subscription, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Insert new subscription
      const result = await supabase
        .from('push_subscriptions')
        .insert({ tenant_id: tenantId, user_email: session.user.email, subscription })
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Error saving push subscription:', error);
      return NextResponse.json(
        { error: 'Failed to save subscription' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email || !session.tenant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endpoint } = await request.json();
    const tenantId = session.tenant.id;

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Missing endpoint' },
        { status: 400 }
      );
    }

    const supabase = await getTenantClient(tenantId);

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_email', session.user.email)
      .filter('subscription->>endpoint', 'eq', endpoint);

    if (error) {
      console.error('Error deleting push subscription:', error);
      return NextResponse.json(
        { error: 'Failed to delete subscription' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
