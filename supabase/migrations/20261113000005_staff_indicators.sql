-- Imported legacy migration; the Supabase CLI manages its transaction.
-- Apply after moderation.sql. Only public staff attribution is exposed.
create function public.community_staff_indicators(p_users uuid[])
returns table(user_id uuid, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
 if cardinality(p_users) > 50 then raise exception 'too_many_users'; end if;
 return query
 select staff.user_id, staff.role from public.community_staff staff
 where staff.user_id = any(p_users);
end;
$$;
revoke all on function public.community_staff_indicators(uuid[]) from public, anon, authenticated;
grant execute on function public.community_staff_indicators(uuid[]) to anon, authenticated;
