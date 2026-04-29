const SUPABASE_URL = "https://evfkoeuhhgfmdrsnifyd.supabase.co";
const SUPABASE_KEY = "sb_publishable_jZ2wGIvrlQqM3hyp284yQA_MmGlkRCq";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async (req) => {
  const url = new URL(req.url);

  // Admin: confirm a user's email by ID (POST with ?adminConfirm=<userId>)
  if (req.method === 'POST') {
    const userId = url.searchParams.get("adminConfirm");
    if (!userId) return new Response(JSON.stringify({ error: "missing userId" }), { status: 400 });
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