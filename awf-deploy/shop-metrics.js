// Shop KPI math shared by dashboard.html and scorecard.html — one source of truth.
// Directional, not billable: times include nights, cart waits, etc. Weekends are excluded
// (working days) so a department isn't charged for Saturday.
// Only details scanned SHIPPED on a tablet count toward cycle time — office batch updates and
// same-hour dispatch+ship entries carry catch-up dates, not real ship dates.

// Targets in working days. Green = at/under target, yellow = 1 day over, red = 2+ days over.
const SHOP_TARGETS = { SAW: 4, BURN: 4, FIT: 2, WELD: 2, CLEAN: 3, PRIME: 3, SANDBLAST: 3, SHIP: 3 };
const SHOP_TOTAL_TARGET = 11;   // dispatch → shipped
const SHOP_STATIONS = Object.keys(SHOP_TARGETS);
const SHOP_COMPLIANCE_STATIONS = ['SAW', 'BURN', 'FIT', 'WELD'];

function shopGrade(days, target) { return days <= target ? 'green' : days <= target + 1 ? 'yellow' : 'red'; }
function shopMedian(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function shopYm(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function shopYmLabel(k) { const [y, m] = k.split('-'); return new Date(+y, +m - 1, 1).toLocaleString('default', { month: 'short' }); }
function shopLastMonths(n) { const now = new Date(), out = []; for (let i = n - 1; i >= 0; i--) out.push(shopYm(new Date(now.getFullYear(), now.getMonth() - i, 1))); return out; }
// Weekdays after a's date, up to and including b's date (same day = 0).
function shopWorkDays(a, b) {
  let n = 0; const d = new Date(a.getFullYear(), a.getMonth(), a.getDate()), end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  while (d < end) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}
const shopIsOffice = e => (e.notes || '').startsWith('Office batch');

async function loadShopData(proxy) {
  const res = await fetch(`${proxy}?shop=1`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// → { months: {ym: {work, cal, due, onTime, green, yellow, red, scanned:{SAW:n,…}}}, dwell: {station: {ym: [workdays]}} }
function computeShopMetrics({ jobs, events }) {
  const byJob = {};
  for (const e of events) (byJob[e.shop_job_id] ||= []).push(e);

  // Cycle time per detail, bucketed by month shipped
  const months = {};
  for (const j of jobs) {
    if (j.cancelled_at || !j.dispatched_at) continue;
    const evs = byJob[j.id] || [];
    const ship = evs.find(e => e.station === 'SHIPPED' && e.event_type === 'checkin');
    if (!ship || shopIsOffice(ship)) continue;
    const t0 = new Date(j.dispatched_at), t1 = new Date(ship.created_at);
    if (t1 - t0 < 3600e3) continue;
    const k = shopYm(t1);
    const m = (months[k] ||= { work: [], cal: [], due: 0, onTime: 0, green: 0, yellow: 0, red: 0, scanned: {} });
    const wd = shopWorkDays(t0, t1);
    m.work.push(wd);
    m.cal.push((t1 - t0) / 864e5);
    m[shopGrade(wd, SHOP_TOTAL_TARGET)]++;
    if (j.due_date) { m.due++; if (`${k}-${String(t1.getDate()).padStart(2, '0')}` <= j.due_date.slice(0, 10)) m.onTime++; }
    for (const s of SHOP_COMPLIANCE_STATIONS)
      if (evs.some(e => e.station === s && e.event_type === 'checkin' && !shopIsOffice(e))) m.scanned[s] = (m.scanned[s] || 0) + 1;
  }

  // Dwell per station: check-in until checked out there, or checked in somewhere else
  const dwell = {};
  for (const evs of Object.values(byJob)) {
    evs.forEach((e, i) => {
      if (e.event_type !== 'checkin' || !SHOP_TARGETS[e.station] || shopIsOffice(e)) return;
      const out = evs.slice(i + 1).find(o => (o.station === e.station && o.event_type === 'checkout') || (o.station !== e.station && o.event_type === 'checkin'));
      if (!out) return;   // still at the station
      const t = new Date(e.created_at);
      ((dwell[e.station] ||= {})[shopYm(t)] ||= []).push(shopWorkDays(t, new Date(out.created_at)));
    });
  }
  return { months, dwell };
}
