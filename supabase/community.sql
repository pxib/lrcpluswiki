-- Run once in a NEW Supabase project's SQL Editor, as postgres.
begin;

create table public.community_articles (id text primary key);
insert into public.community_articles(id) values
 ('main'), ('installation'), ('getting-started'), ('interface'), ('playback'), ('finding-lyrics'),
 ('readings'), ('editor'), ('lrcx'), ('settings-reference'), ('translations'),
 ('sharing'), ('ayami'), ('companion'), ('customization'), ('plugins'),
 ('troubleshooting'), ('shortcuts'), ('tutorials'), ('glossary'), ('article-index'),
 ('plugin-directory'), ('plugin-anki-flashcards'), ('plugin-cantonese-readings'),
 ('plugin-discord-rpc'), ('plugin-floating-lyrics'), ('plugin-karaoke-screen'),
 ('plugin-korean-romanization'), ('plugin-lyrics-translator'), ('plugin-ytdlp-import');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null check (username ~ '^[A-Za-z0-9_]{3,30}$')
);
create unique index profiles_username_unique on public.profiles(lower(username));

create table public.community_topics (
 id uuid primary key default gen_random_uuid(),
 article_id text not null references public.community_articles(id),
 author_id uuid references public.profiles(id) on delete set null,
 title text not null check (char_length(btrim(title)) between 1 and 160),
 body text not null check (char_length(btrim(body)) between 1 and 10000),
 created_at timestamptz not null default now()
);
create index community_topics_article_date on public.community_topics(article_id, created_at, id);

create table public.community_comments (
 id uuid primary key default gen_random_uuid(),
 topic_id uuid not null references public.community_topics(id) on delete cascade,
 author_id uuid references public.profiles(id) on delete set null,
 body text not null check (char_length(btrim(body)) between 1 and 10000),
 created_at timestamptz not null default now()
);
create index community_comments_topic_date on public.community_comments(topic_id, created_at, id);

-- Private bookkeeping: clients cannot read or write rate limits.
create table public.community_post_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 last_post_at timestamptz not null
);

alter table public.profiles enable row level security;
alter table public.community_articles enable row level security;
alter table public.community_topics enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_post_limits enable row level security;

revoke all on public.profiles, public.community_articles, public.community_topics,
 public.community_comments, public.community_post_limits from anon, authenticated;
grant select on public.profiles, public.community_articles, public.community_topics,
 public.community_comments to anon, authenticated;
create policy profiles_read on public.profiles for select to anon, authenticated using (true);
create policy articles_read on public.community_articles for select to anon, authenticated using (true);
create policy topics_read on public.community_topics for select to anon, authenticated using (true);
create policy comments_read on public.community_comments for select to anon, authenticated using (true);

-- Username is copied at signup into a protected public profile. Later edits to
-- auth metadata cannot impersonate a different participant in discussions.
create function public.community_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id, username) values (new.id, btrim(new.raw_user_meta_data ->> 'username'));
 return new;
end;
$$;
revoke all on function public.community_new_user() from public, anon, authenticated;
create trigger community_user_created after insert on auth.users
 for each row execute function public.community_new_user();

create function public.community_check_post() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
 uid uuid := auth.uid();
 last_post timestamptz;
begin
 if uid is null or not exists (
   select 1 from auth.users where id = uid and email_confirmed_at is not null
    and (banned_until is null or banned_until < now())
 ) then raise exception 'verified_account_required'; end if;
 -- Lock persists to transaction end, so concurrent RPCs cannot bypass the limit.
 perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
 select last_post_at into last_post from public.community_post_limits where user_id = uid;
 if last_post > clock_timestamp() - interval '1 minute' then
   raise exception 'posting_too_fast';
 end if;
 insert into public.community_post_limits(user_id, last_post_at) values (uid, clock_timestamp())
 on conflict (user_id) do update set last_post_at = excluded.last_post_at;
 return uid;
end;
$$;
revoke all on function public.community_check_post() from public, anon, authenticated;

create function public.community_start_topic(p_article text, p_title text, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid; topic uuid;
begin
 uid := public.community_check_post();
 insert into public.community_topics(article_id, author_id, title, body)
 values(p_article, uid, btrim(p_title), btrim(p_body)) returning id into topic;
 return topic;
end;
$$;
create function public.community_reply(p_topic uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid; comment uuid;
begin
 uid := public.community_check_post();
 insert into public.community_comments(topic_id, author_id, body)
 values(p_topic, uid, btrim(p_body)) returning id into comment;
 return comment;
end;
$$;
revoke all on function public.community_start_topic(text, text, text) from public, anon, authenticated;
revoke all on function public.community_reply(uuid, text) from public, anon, authenticated;
grant execute on function public.community_start_topic(text, text, text) to authenticated;
grant execute on function public.community_reply(uuid, text) to authenticated;
commit;
