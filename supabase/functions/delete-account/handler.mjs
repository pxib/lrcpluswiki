// Secrets and the admin client stay in the Edge Function, never in the wiki.
export function createDeleteAccountHandler({createClient, url, anonKey, serviceKey}) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };
  const reply = (status, error) => new Response(JSON.stringify(error ? {error} : {deleted: true}), {status, headers});
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
    if (request.method !== 'POST') return reply(405, 'method_not_allowed');
    const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return reply(401, 'sign_in_required');
    if (!url || !anonKey || !serviceKey) return reply(503, 'unavailable');
    try {
      const text = await request.text();
      if (text.length > 8192) return reply(413, 'invalid_request');
      let body;
      try { body = JSON.parse(text); } catch { return reply(400, 'invalid_request'); }
      if (body?.confirmation !== 'DELETE' || typeof body.password !== 'string' || !body.password || body.password.length > 1024) return reply(400, 'invalid_request');
      const options = {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}};
      const admin = createClient(url, serviceKey, options);
      // Validate the live account with Auth rather than trusting JWT payload claims.
      const identity = await admin.auth.getUser(token);
      const user = identity.data?.user;
      if (identity.error || !user?.id || !user.email) return reply(401, 'sign_in_required');
      const verifier = createClient(url, anonKey, options);
      const verified = await verifier.auth.signInWithPassword({email: user.email, password: body.password});
      if (verified.error || verified.data?.user?.id !== user.id) {
        return reply(verified.error?.status === 429 ? 429 : 403, verified.error?.status === 429 ? 'rate_limit' : 'invalid_credentials');
      }
      try {
        // No caller-provided user ID is accepted. Existing foreign keys remove the
        // profile/introduction and detach public contributions and private reports.
        const result = await admin.auth.admin.deleteUser(user.id);
        if (result.error) return reply(503, 'unavailable');
        return reply(200);
      } finally {
        // Remove the short-lived verification session if deletion failed, too.
        await verifier.auth.signOut({scope: 'local'}).catch(() => {});
      }
    } catch {
      // Do not echo provider errors, request bodies, tokens, or passwords.
      return reply(503, 'unavailable');
    }
  };
}
