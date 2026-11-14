import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {createDeleteAccountHandler} from './handler.mjs';

Deno.serve(createDeleteAccountHandler({
  createClient,
  url: Deno.env.get('SUPABASE_URL'),
  anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}));
