-- Push Subscriptions Table for Web Push Notifications (Prometeo)
-- Run this on the tenant database

create table if not exists push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_email text not null,
  subscription jsonb not null, -- Contains: endpoint, expirationTime, keys.p256dh, keys.auth
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for looking up subscriptions by user
create index if not exists idx_push_subscriptions_user_email 
  on push_subscriptions(user_email);

-- Unique constraint to prevent duplicate subscriptions for same endpoint
create unique index if not exists idx_push_subscriptions_endpoint 
  on push_subscriptions((subscription->>'endpoint'));

-- Trigger to update updated_at
create or replace function update_push_subscriptions_updated_at()
returns trigger as $$
begin
  NEW.updated_at = timezone('utc'::text, now());
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists push_subscriptions_updated_at on push_subscriptions;
create trigger push_subscriptions_updated_at
  before update on push_subscriptions
  for each row
  execute function update_push_subscriptions_updated_at();

-- Comment for documentation
comment on table push_subscriptions is 'Web Push notification subscriptions for Prometeo scheduled tasks';
comment on column push_subscriptions.subscription is 'PushSubscription object from browser - contains endpoint and encryption keys';
