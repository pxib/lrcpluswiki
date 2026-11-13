-- Run once AFTER community.sql, in Supabase's SQL Editor as postgres.
begin;
alter table public.community_topics add column locked boolean not null default false;

create table public.community_staff (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 role text not null check(role in ('moderator','admin'))
);
create table public.community_restrictions (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 reason text not null check(char_length(reason) between 1 and 2000)
);
create table public.community_reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid references public.profiles(id) on delete set null,
 target_type text not null check(target_type in ('topic','comment')),
 target_id uuid not null,
 article_id text not null,
 topic_id uuid not null,
 author_id uuid references public.profiles(id) on delete set null,
 content text not null,
 reason text not null check(reason in ('spam','harassment','inaccurate','other')),
 details text not null default '' check(char_length(details) <= 2000),
 status text not null default 'open' check(status in ('open','dismissed','removed')),
 created_at timestamptz not null default now(),
 reviewed_by uuid references public.profiles(id) on delete set null,
 reviewed_at timestamptz
);
create unique index community_reports_open_unique on public.community_reports(reporter_id,target_type,target_id) where status='open';
create index community_reports_queue on public.community_reports(status,created_at,id);
create index community_reports_reporter_date on public.community_reports(reporter_id,created_at);
create table public.community_moderation_log (
 id bigint generated always as identity primary key,
 actor_id uuid references public.profiles(id) on delete set null,
 action text not null,
 target text not null,
 created_at timestamptz not null default now()
);
alter table public.community_staff enable row level security;
alter table public.community_restrictions enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_moderation_log enable row level security;
revoke all on public.community_staff, public.community_restrictions, public.community_reports,
 public.community_moderation_log from public, anon, authenticated;

-- Helpers are never directly callable by browser roles.
create function public.community_verified_user() returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid();
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null
   and (banned_until is null or banned_until<now())) then raise exception 'verified_account_required'; end if;
 if exists(select 1 from public.community_restrictions where user_id=uid) then raise exception 'account_restricted'; end if;
 return uid;
end; $$;
revoke all on function public.community_verified_user() from public, anon, authenticated;

create function public.community_staff_role() returns text
language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 uid := public.community_verified_user();
 return (select role from public.community_staff where user_id=uid);
end; $$;
revoke all on function public.community_staff_role() from public, anon, authenticated;
grant execute on function public.community_staff_role() to authenticated;

create function public.community_require_staff(p_admin boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid; staff text;
begin
 uid := public.community_verified_user();
 select role into staff from public.community_staff where user_id=uid;
 if staff is null or (p_admin and staff<>'admin') then raise exception 'staff_required'; end if;
 return uid;
end; $$;
revoke all on function public.community_require_staff(boolean) from public, anon, authenticated;

create or replace function public.community_check_post() returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid; last_post timestamptz;
begin
 uid := public.community_verified_user();
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select last_post_at into last_post from public.community_post_limits where user_id=uid;
 if last_post > clock_timestamp()-interval '1 minute' then raise exception 'posting_too_fast'; end if;
 insert into public.community_post_limits values(uid,clock_timestamp())
 on conflict(user_id) do update set last_post_at=excluded.last_post_at;
 return uid;
end; $$;

create or replace function public.community_reply(p_topic uuid,p_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid; comment uuid; is_locked boolean;
begin
 uid := public.community_check_post();
 select locked into is_locked from public.community_topics where id=p_topic for share;
 if is_locked then raise exception 'topic_locked'; end if;
 insert into public.community_comments(topic_id,author_id,body) values(p_topic,uid,btrim(p_body)) returning id into comment;
 return comment;
end; $$;

create function public.community_report(p_type text,p_target uuid,p_reason text,p_details text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid; report uuid; article text; topic uuid; author uuid; snapshot text;
begin
 uid := public.community_verified_user();
 perform pg_advisory_xact_lock(hashtextextended('report:'||uid::text,0));
 if exists(select 1 from public.community_reports where reporter_id=uid and target_type=p_type and target_id=p_target and status='open') then
   raise exception 'already_reported';
 end if;
 if exists(select 1 from public.community_reports where reporter_id=uid and created_at>clock_timestamp()-interval '1 minute') then
   raise exception 'posting_too_fast';
 end if;
 if p_type='topic' then
   select article_id,id,author_id,title||E'\n\n'||body into article,topic,author,snapshot from public.community_topics where id=p_target for share;
 elsif p_type='comment' then
   select t.article_id,t.id,c.author_id,c.body into article,topic,author,snapshot
   from public.community_comments c join public.community_topics t on t.id=c.topic_id where c.id=p_target for share of c,t;
 else raise exception 'invalid_target'; end if;
 if topic is null then raise exception 'target_not_found'; end if;
 insert into public.community_reports(reporter_id,target_type,target_id,article_id,topic_id,author_id,content,reason,details)
 values(uid,p_type,p_target,article,topic,author,snapshot,p_reason,btrim(coalesce(p_details,''))) returning id into report;
 return report;
end; $$;
revoke all on function public.community_report(text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.community_report(text,uuid,text,text) to authenticated;

create function public.community_report_queue(p_status text default 'open',p_offset integer default 0)
returns table(id uuid,reporter text,author text,author_id uuid,target_type text,target_id uuid,article_id text,topic_id uuid,
 content text,reason text,details text,status text,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 perform public.community_require_staff();
 if p_status not in ('open','dismissed','removed') or p_offset<0 then raise exception 'invalid_filter'; end if;
 return query select r.id,p.username,a.username,r.author_id,r.target_type,r.target_id,r.article_id,r.topic_id,
 r.content,r.reason,r.details,r.status,r.created_at
 from public.community_reports r left join public.profiles p on p.id=r.reporter_id left join public.profiles a on a.id=r.author_id
 where r.status=p_status order by r.created_at,r.id offset p_offset limit 20;
end; $$;
revoke all on function public.community_report_queue(text,integer) from public, anon, authenticated;
grant execute on function public.community_report_queue(text,integer) to authenticated;

create function public.community_review_report(p_report uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid; r public.community_reports;
begin
 uid := public.community_require_staff();
 select * into r from public.community_reports where id=p_report for update;
 if r.id is null or r.status<>'open' then raise exception 'report_closed'; end if;
 if p_action='remove' then
   if r.target_type='topic' then delete from public.community_topics where id=r.target_id;
   else delete from public.community_comments where id=r.target_id; end if;
   -- Close every open report on the removed target or any replies removed with a topic.
   update public.community_reports set status='removed',reviewed_by=uid,reviewed_at=now()
   where status='open' and ((target_type=r.target_type and target_id=r.target_id) or (r.target_type='topic' and topic_id=r.topic_id));
 elsif p_action='dismiss' then
   update public.community_reports set status='dismissed',reviewed_by=uid,reviewed_at=now() where id=r.id;
 else raise exception 'invalid_action'; end if;
 insert into public.community_moderation_log(actor_id,action,target) values(uid,p_action,r.id::text);
end; $$;
revoke all on function public.community_review_report(uuid,text) from public, anon, authenticated;
grant execute on function public.community_review_report(uuid,text) to authenticated;

create function public.community_lock_topic(p_topic uuid,p_locked boolean) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 uid := public.community_require_staff();
 if p_locked is null then raise exception 'invalid_action'; end if;
 update public.community_topics set locked=p_locked where id=p_topic;
 if not found then raise exception 'target_not_found'; end if;
 insert into public.community_moderation_log(actor_id,action,target) values(uid,case when p_locked then 'lock' else 'unlock' end,p_topic::text);
end; $$;
revoke all on function public.community_lock_topic(uuid,boolean) from public, anon, authenticated;
grant execute on function public.community_lock_topic(uuid,boolean) to authenticated;

create function public.community_manage_member(p_username text,p_action text,p_reason text default '') returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid; target uuid;
begin
 uid := public.community_require_staff(true);
 select id into target from public.profiles where lower(username)=lower(btrim(p_username));
 if target is null then raise exception 'target_not_found'; end if;
 -- Serialize role changes; an administrator cannot demote/block themselves.
 perform pg_advisory_xact_lock(hashtextextended('community_staff_management',0));
 uid := public.community_require_staff(true);
 if target=uid then raise exception 'cannot_change_self'; end if;
 if p_action in ('moderator','admin') then
   if exists(select 1 from public.community_restrictions where user_id=target) then raise exception 'account_restricted'; end if;
   insert into public.community_staff values(target,p_action) on conflict(user_id) do update set role=excluded.role;
 elsif p_action='member' then delete from public.community_staff where user_id=target;
 elsif p_action='block' then
   if exists(select 1 from public.community_staff where user_id=target) then raise exception 'staff_member_protected'; end if;
   insert into public.community_restrictions values(target,btrim(p_reason)) on conflict(user_id) do update set reason=excluded.reason;
 elsif p_action='unblock' then delete from public.community_restrictions where user_id=target;
 else raise exception 'invalid_action'; end if;
 insert into public.community_moderation_log(actor_id,action,target) values(uid,p_action,target::text);
end; $$;
revoke all on function public.community_manage_member(text,text,text) from public, anon, authenticated;
grant execute on function public.community_manage_member(text,text,text) to authenticated;
commit;
