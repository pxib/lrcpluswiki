-- Imported legacy migration; the Supabase CLI manages its transaction.
-- Apply after content-controls.sql, before deploying the matching website.

-- Batch only the displayed topics. Invoker security preserves public read RLS;
-- this function exposes no private moderation or auth data.
create function public.community_topic_stats(p_topics uuid[])
returns table(topic_id uuid, comment_count bigint, participant_count bigint)
language plpgsql stable security invoker set search_path = '' as $$
begin
 if cardinality(p_topics) > 20 then raise exception 'too_many_topics'; end if;
 return query
 select entries.topic_id, count(*), count(distinct entries.author_id)
 from (
   select t.id as topic_id, t.author_id
   from public.community_topics t where t.id = any(p_topics)
   union all
   select c.topic_id, c.author_id
   from public.community_comments c where c.topic_id = any(p_topics)
 ) entries
 group by entries.topic_id;
end;
$$;
revoke all on function public.community_topic_stats(uuid[]) from public, anon, authenticated;
grant execute on function public.community_topic_stats(uuid[]) to anon, authenticated;
