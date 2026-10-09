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

  if (url.searchParams.get("fixRLS")) {
    // Run each policy statement individually via the REST API using service role
    const statements = [
      `DROP POLICY IF EXISTS "quotes_admin_select" ON public.quotes`,
      `CREATE POLICY "quotes_admin_select" ON public.quotes FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))`,
      `DROP POLICY IF EXISTS "line_items_admin_select" ON public.line_items`,
      `CREATE POLICY "line_items_admin_select" ON public.line_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND (q.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))))`
    ];
    const results = [];
    for (const sql of statements) {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
          method: 'POST',
          headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql })
        });
        results.push({ sql: sql.substring(0,40), status: r.status, body: (await r.text()).substring(0,100) });
      } catch(e) {
        results.push({ sql: sql.substring(0,40), error: e.message });
      }
    }
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  // Shop cycle-time data for the dashboard: every shop job + every scan event, paged past the 1000-row cap.
  if (url.searchParams.get("shop")) {
    const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
    const pageAll = async (path) => {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}&limit=1000&offset=${offset}`, { headers });
        if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
        const page = await r.json();
        rows.push(...page);
        if (page.length < 1000) return rows;
      }
    };
    try {
      const [jobs, events] = await Promise.all([
        pageAll("shop_jobs?select=id,dispatched_at,due_date,cancelled_at&order=id"),
        pageAll("shop_events?select=shop_job_id,station,event_type,created_at,notes&shop_job_id=not.is.null&order=created_at,id"),
      ]);
      return new Response(JSON.stringify({ jobs, events }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }

  const since = url.searchParams.get("since") ?? "2026-04-17T00:00:00";
  const limit = parseInt(url.searchParams.get("limit") ?? "500", 10);
  try {
    // Supabase returns at most 1000 rows per request and silently drops the rest,
    // so page through until we have `limit` rows or run out.
    const PAGE = 1000;
    const data = [];
    let status = 200;
    for (let offset = 0; offset < limit; offset += PAGE) {
      const sbRes = await fetch(
        `${SUPABASE_URL}/rest/v1/quotes?select=id,customer_name,total_price,awarded_total,cancelled_at,created_at,status,won,po_number,won_at&created_at=gte.${since}&order=created_at.desc,id.desc&limit=${Math.min(PAGE, limit - offset)}&offset=${offset}`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const page = await sbRes.json();
      if (!sbRes.ok) { return new Response(JSON.stringify(page), { status: sbRes.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }); }
      data.push(...page);
      if (page.length < Math.min(PAGE, limit - offset)) break;
    }
    return new Response(JSON.stringify(data), {
      status,
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
