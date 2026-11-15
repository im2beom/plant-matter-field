// OPTIONAL: deploy with `supabase functions deploy delete-account`.
// Verify the signed-in user first; NEVER put SUPABASE_SERVICE_ROLE_KEY in browser config.js.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Vary':'Origin',
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response('', { headers: cors });
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, {status:405,headers:cors});
  try {
    const { confirm } = await req.json();
    if (confirm !== 'DELETE') return Response.json({error:'Confirmation required'}, {status:400,headers:cors});
    const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
    if(!jwt) return Response.json({error:'Unauthorized'}, {status:401,headers:cors});
    const url=Deno.env.get('SUPABASE_URL')!;
    const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
    const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${jwt}`}},auth:{persistSession:false}});
    const {data:{user},error}=await userClient.auth.getUser(jwt);
    if(error||!user) return Response.json({error:'Unauthorized'}, {status:401,headers:cors});
    const admin=createClient(url,service,{auth:{persistSession:false}});
    // Remove the user's uploaded photos (observations, place plants, profile photo) before deleting the account.
    for (const bucket of ['field-photos','place-photos','avatars']) {
      const { data: files } = await admin.storage.from(bucket).list(user.id, { limit: 1000 });
      if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
    }
    const {error:deleteError}=await admin.auth.admin.deleteUser(user.id);
    if(deleteError) throw deleteError;
    return Response.json({deleted:true}, {status:200,headers:cors});
  } catch(error) {
    return Response.json({error:'Unable to delete account'}, {status:500,headers:cors});
  }
});
