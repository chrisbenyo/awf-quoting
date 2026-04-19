const SUPABASE_URL = process.env.SUPABASE_URL || "https://evfkoeuhhgfmdrsnifyd.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_jZ2wGIvrlQqM3hyp284yQA_MmGlkRCq";

export default async (req) => {
  const url = new URL(req.url);
  const since = url.searchParams.get("since") ?? "2026-04-01T00:00:00";
  const limit = url.searchParams.get("limit") ?? "500";
  try {
    const sbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/quotes?select=id,customer_name,total_price,created_at,won_at,status,won,po_number&created_at=gte.${since}&order=created_at.desc&limit=${limit}`,
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
