// Supabase Edge Function (Deno). Deploy: `supabase functions deploy delete-account`.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform;
// the service role key never leaves the server.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { handleDeleteAccount, listAllPhotos } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const BUCKET = 'progress-photos';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const result = await handleDeleteAccount(
    { method: req.method, authorization: req.headers.get('Authorization') },
    {
      getUserId: async (token) => (await admin.auth.getUser(token)).data.user?.id ?? null,
      listPhotos: (prefix) =>
        listAllPhotos(prefix, async (folder, offset, limit) => {
          const { data, error } = await admin.storage.from(BUCKET).list(folder, { limit, offset });
          if (error) {
            // A project without the photo bucket has nothing to delete; any other error stops the
            // deletion (the account is kept rather than deleted with photos left behind).
            if (/bucket not found/i.test(error.message)) return [];
            throw error;
          }
          // Storage lists a folder as an entry without id.
          return (data ?? []).map((f: { name: string; id: string | null }) => ({
            name: f.name,
            folder: f.id === null,
          }));
        }),
      removePhotos: async (paths) => {
        const { error } = await admin.storage.from(BUCKET).remove(paths);
        if (error) throw error;
      },
      deleteUser: async (userId) => {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
      },
    },
  );
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
