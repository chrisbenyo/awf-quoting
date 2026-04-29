const SUPABASE_URL = "https://evfkoeuhhgfmdrsnifyd.supabase.co";
const SUPABASE_KEY = "sb_publishable_jZ2wGIvrlQqM3hyp284yQA_MmGlkRCq";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const RLS_FIX_SQL = `
DO $$
BEGIN
  DROP POLICY IF EXISTS "quotes_admin_select" ON public.quotes;
  CREATE POLICY "quotes_admin_select" ON public.quotes
    FOR SELECT USING (
      auth.uid() = user_id
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
  DROP POLICY IF EXISTS "line_items_admin_select" ON public.line_items;
  CREATE POLICY "line_items_admin_select" ON public.line_items
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = line_items.quote_id
          AND (q.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
      )
    );
END $$;
`;

export default async (req) => {
  const url = new URL(req.url);

  if (req.method === 'POST' && url.searchParams.get("adminConfirm")) {
    const userId = url.searchParams.get("adminConfirm");
    const sbRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_confirm: true })
    });
    const data = await sbRes.json();
    return new Response(JSON.stringify(data), {
      status: sbRes.status,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  if (req.method === 'POST' && url.searchParams.get("fixRLS")) {
    const metaRes = await fetch(`${SUPABASE_URL}/pg-meta/v1/query`, {
      method: 'POST',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: RLS_FIX_SQL })
    });
    const data = await metaRes.json();
    return new Response(JSON.stringify(data), {
      status: metaRes.status,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  const since = url.searchParams.get("since") ?? "2026-04-17T00:00:00";
  const limit = url.searchParams.get("limit") ?? "500";
  try {
    const sbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/quotes?select=id,customer_name,total_price,created_at,status,won,po_number,won_at&created_at=gte.${since}&order=created_at.desc&limit=${limit}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await sbRes.json();
    return new Response(JSON.stringify(data), {
      status: sbRes.status,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
};

export const config = { path: "/api/quotes-proxy" };
