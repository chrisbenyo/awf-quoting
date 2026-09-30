# AWOS / "Quote-to-Floor" — engineering context

Standing context for **AWOS**, branded **Quote-to-Floor** (`quotetofloor.com`): a managed-SaaS quoting + shop-floor system owned by **Chris Benyo** of **All Weld & Fabricating (AWF)**, a steel fab shop. This file is auto-loaded by Claude Code — read it before touching any AWOS repo so a session starts already knowing the app.

> This repo's work moved from the Claude desktop "Cowork task" surface to **Claude Code** (Oct 2026). The big practical change: **in Claude Code you can `git push` and use the GitHub CLI directly** — the browser/CodeMirror deploy dance described at the bottom is the LEGACY method from the old surface, kept only as a fallback.

## Accounts & access (hard to re-derive — keep current)

- **GitHub:** org/user `chrisbenyo`. Repos: `awf-quoting` (the main app — quoting + dashboard + customer/status pages), `awf-dashboard`, `awf-shopfloor` (shop-floor scanning, "Boss Mode"), `awos-docs` (private: `RUNBOOK.md`, `COMMERCIALIZATION.md`, `ONBOARDING.md`; backlog lives in the runbook Roadmap).
- **Supabase (live AWF database):** project ref **`evfkoeuhhgfmdrsnifyd`**, hardcoded in `awf-deploy/index.html`. Owned by the **`quotes@allweldfab.com`** Supabase account (GitHub sign-in). The `chris@allweldfab.com` account is EMPTY and lands on "Create organization" — use `quotes@allweldfab.com` for the DB dashboard / migrations. Dashboard: `supabase.com/dashboard/project/evfkoeuhhgfmdrsnifyd`.
- **Netlify:** AWF app = project **`dazzling-gecko-570423`**. `main` auto-deploys to production (`quotes.allweldfab.com`); PRs get `deploy-preview-<n>--dazzling-gecko-570423.netlify.app`.
- **Branch protection:** `main` on `awf-quoting` requires a PR (0 approvals, no direct commits — by anyone). Tenant branches (`tenant/*`) are NOT protected but still go through branch + PR + preview.

## Multi-tenant deployment (AS BUILT — read before "propagating a fix")

The future plan is "one codebase, one deploy fanning out to subdomains via hostname routing." **Not built yet.** Today each customer (tenant) is a **long-lived git branch** with its OWN hardcoded Supabase URL/key, OWN Netlify site, and OWN Supabase project:

| Tenant | Branch | Netlify site | Supabase | `<title>` |
|---|---|---|---|---|
| **AWF** | `main` | `dazzling-gecko-570423` | `evfkoeuhhgfmdrsnifyd` | "AWF Quoting — v6" |
| **Elite** (Elite Welding & Fabrication, first commercial tenant; contact = **Nate**) | `tenant/elite` | `elite-welding-quotes` | `duxqbwlnpduwsibjqkff` | "QuoteToFloor" |

**Consequence:** a fix is NOT global. Merging to `main` only updates AWF. To ship the same fix to a tenant, branch off `tenant/elite`, apply the identical logic change, PR back into `tenant/elite`, verify on that tenant's preview, merge. The ONLY difference between tenant copies of `awf-deploy/index.html` is the hardcoded Supabase URL/key + title/branding — logic is identical, so the same edits apply to every branch (verify each matches once, and confirm the tenant's DB/branding is preserved and AWF's DB ref is absent). When Chris says "make sure this is in Nate's/Elite's tenant too," that's a second branch+PR+merge on `tenant/elite`.

**Propagation tip that works well:** in a local checkout of `tenant/elite`, `git apply` the exact patch(es) from the `main` PR to PROVE the hunks match Elite before doing anything, then push a branch + open the tenant PR.

## CRITICAL: which file is live

`awf-quoting` is messy. The **live quoting app is `awf-deploy/index.html`** — a single-file vanilla-JS HTML app (~4500 lines). Siblings in `awf-deploy/`: `dashboard.html`, `customers.html`, `status.html`, and `netlify/functions/quotes-proxy.mjs` (a proxy that widens the dashboard's quotes select). Do **NOT** edit the repo-root `index.html` (stale since May 2026) or the junk dirs `awf-deploy,` (trailing comma), `netfiy.toml`, `netifly` — accidental cruft; flag for cleanup, don't touch without asking.

## Stack

- **Supabase** (Postgres + Auth) accessed from the browser via **direct REST** (`SUPABASE_URL` + `SUPABASE_ANON` baked into the app), not supabase-js. Auth token in `localStorage['awf_token']`. Roles via `profiles.role` + a Postgres `is_admin()`.
- **`sbDB`** — a hand-rolled `QueryBuilder` over PostgREST, and a **custom thenable you MUST `await`**. A bare `.then(fn)` returns `undefined` (it invokes `fn` internally and resolves to nothing) — a silent hang trap. `await` inside an `async` map instead. Methods: `.select .eq .in(col,vals) .order .limit .single .update .insert .delete`. Batch id lookups with `sbFetchByIds(table, cols, ids, idCol='id')` (chunks of 120, parallel, awaited) — never a per-row `.single()` loop.
- **Netlify** per-tenant sites; a `netlify/functions` proxy exists. Hostname-routing multi-tenant is backlog.
- **Anthropic API** (via a Cloudflare worker `new.chris-d24.workers.dev`) parses uploaded drawing PDFs into BOM line items (~$0.01/doc).
- No build step / framework.

## Data model (as used by the code)

- **`quotes`**: `id` (PK, the real identity), `number` (human quote #, DB-assigned — app never writes it), `customer_name`, `customer_quote_num`, `location`, `lead_time_weeks`, `terms`, `notes`, `status`, `total_price`, `user_id`, `won`, `won_at`, `po_number`, `due_date`, `submitted_at`, `review_note`, `deleted_at` (soft-delete / 30-day trash). Cancel/partial-award added: `cancelled_at`, `cancel_reason`, `reactivated_at`, `awarded_total`, `odoo_sync_status`.
- **`line_items`**: `id`, `quote_id`, `sort_order`, `item_type` (`detail_meta`|`tube`|`flat`|`angle`|`cchannel`|`other`|`quote_level`), `description`, `qty`, `unit_price`, `total_price`, `source`, `item_data` (JSONB — holds `detail_idx`, all dimensional fields, and per-detail award info). **Because `item_data` is JSONB, per-item additions need NO migration.** Per-detail award status lives in the `detail_meta` row's `item_data`: `{award_status:'won'|'not_awarded'|'cancelled', award_at, award_by, award_reason}`; absent/legacy = treated as `'won'`.
- Also: `customers`, `shop_jobs` (added `cancelled_at`, `cancelled_by`), `shop_events`, `profiles`, `stations`.
- Material/size tables are JS consts in the app (`THICKNESS_OPTIONS`, `HRS_TABLE`, `SQ_TUBE`/`RECT_TUBE`/`RND_TUBE`, `ANGLE`, gauge table). Weight = volume × density; SS/AL can be derived from steel via density factors (AL ≈ 0.35×, 304 SS ≈ 1.02×).

## Editor mechanics (know before changing save/load)

- Global **`currentQuoteId`** = open quote's PK. In-memory state: `details[]`, `quoteLevelItems[]`, `activeDetailIdx`.
- **Autosave is debounced** (`schedSave`): `saveHeader` 800ms, `saveItems` 1500ms.
- `saveHeader` = `UPDATE quotes SET <buildHeaderPatch()> WHERE id=currentQuoteId`.
- `saveItems` = **DELETE all line_items for the quote, then re-INSERT** from in-memory state. Destructive-by-design; correctness depends on `currentQuoteId` and the in-memory state being right. This is the mechanism behind the identity-swap / stale-tab data-loss class below.

## Hard-won lessons (each cost a real incident)

- **Autosave clobber / identity-swap (Aug 2026, commit `d66c5d6`):** a debounced save scheduled for quote A fired after switching to quote B, writing A onto B. Fix: `openQuote`/`newQuote` clear timers + flush the outgoing quote; `schedSave` binds `qid=currentQuoteId` and skips if it changed. **Lesson:** any deferred write reading a mutable global must cancel + flush on context switch and bind its target id at schedule time.
- **Stale-tab clobber (Sep 2026) + the guard:** a browser tab left open across a deploy keeps running OLD code; its next `saveItems` (delete+reinsert) SILENTLY OVERWRITES good data — it doesn't just miss new features. This (not a live race) is the real cause behind recurring "identity-swap" reports and the quote-6354 award-status wipe. **Guard shipped (both tenants):** on load + every 60s + on `visibilitychange`, HEAD-fetch `index.html` with `cache:'no-store'`, read the ETag; baseline on first fetch; if it later differs → `__appStale=true` → red banner + "Reload now" (cache-busted reload), and `schedSave`/`saveHeader`/`saveItems` early-return while stale so an out-of-date tab can't write. Netlify already sends `must-revalidate` + a stable content ETag, so no extra config was needed.
- **N+1 shop-screen loads (Sep 2026):** Active Jobs took ~34s. `loadActiveJobs`/`loadFloorBoard`/`loadPendingDispatch` did per-row `.single()` lookups. Fix: `.in()` + `sbFetchByIds` batching → ~1s. **Lesson:** never a per-row `.single()` loop over an id list.
- **Double unit conversion (Sep 2026):** metric drawings sometimes store the unit in the value (`width:"306mm"` alongside `widthUnit:"mm"`); `parseFraction()` already returns inches for unit-suffixed values, so `dimToFracIn()` re-toggling `/25.4` printed 7/16" for a 12-1/2" plate. Fix: give `dimToFracIn` the same `hasExplicit` guard `resolveLength` uses.
- **mm→inch rounding (Sep 2026):** round to NEAREST 1/16 (`Math.round(decimal*16)`), not floor. Shop-floor resolution; matches how the fabricators (Jerry) hand-write dims.
- **PDF import JSON parse (Sep 2026):** the AI sometimes returns MULTIPLE top-level JSON arrays (one per BOM table) or trailing prose; the old first-`[`-to-last-`]` slice glued them into invalid JSON → "Unexpected non-whitespace character after JSON". Fix: `extractBomArrays()` scans for every complete top-level array (balanced-bracket, string-aware) and merges their items. **Lesson:** never JSON.parse a model reply via a naive first-to-last slice.

## Shipped feature state (current — both tenants unless noted)

- **Partial-award + Cancel Order:** Win button shows a per-detail checklist; unchecked details become `not_awarded` (keep their real price, skipped for dispatch + traveler); `awarded_total` computed. Quote-level Cancel Order (prompts reason, warns if dispatched, sets `cancelled_at`/`odoo_sync_status='cancel_pending'`, marks shop_jobs cancelled) + Reactivate; "Cancelled" filter tab; cancelled excluded from lists/dispatch/active-jobs/floor.
- **Dashboard `awarded_total`** (AWF only — Elite dashboard is still a trial stub): won tiles value at `awarded_total` (fallback `total_price`), cancelled excluded. `quotes-proxy.mjs` select includes `awarded_total,cancelled_at`.
- **Stale-tab guard** (above), **PDF multi-array parse** (above), **BOM placeholder import** (unpriceable lines → freeform $0 with a needs-pricing flag), **print pagination** (long quotes flow across pages), **traveler PO gate**, **customer_name canonicalization on save**, dim/rounding fixes.
- **Odoo:** cancellations are ~quarterly, so there is **NO automated batch** — on demand, when Chris cancels an order he asks Claude to cancel the matching Odoo Sales Order (see the `allweld-odoo-doc-entry` skill / his logged-in Odoo). `odoo_sync_status='cancel_pending'` is left as a harmless marker.

## Open backlog

- **Single-codebase multi-tenant** (customer registry table + hostname routing) to replace the tenant-branch model — the big one as more customers sign.
- Schema-migration SQL in-repo (schema currently only lives in prod), seed-data script.
- Elite aux pages (`status.html`/`customers.html`) still point at AWF's DB + are AWF-branded (PR #16, parked pending Elite go/no-go); Elite dashboard is a stub. Elite report identity should read "Elite Welding & Fabrication"; still need Elite's real address/phone for the status-report footer.
- Terms Phase 2 (DB-driven dropdown + customer defaults), material auto-detection, shippers Phase 1.
- Dashboard cleanup: `WON_2026H` hardcoded, `won_at` undercount edges.
- Secret rotation + 2FA; in-app onboarding + user docs.

## Working loop with Chris

Chris is the **requirements-maker**; Claude is the **coder**. He values concise, direct communication and initiative ("I can't have 50 first dates"). Loop:
1. Restate a non-trivial request as a short spec, confirm, then code.
2. Minimal, surgical diffs. Verify each edit matches exactly once; syntax-check the JS (`node -e` on the inline `<script>`) before committing.
3. Default delivery = **branch + PR → Netlify preview → Chris reviews → merge** (= production deploy for that tenant). Never commit to `main` directly.
4. After a fix, offer to (a) straighten any records the bug mangled, (b) capture the lesson here, and (c) if it's shared logic, propagate to each tenant branch.

## Deploying — Claude Code (primary) vs browser (legacy fallback)

**In Claude Code (now):** clone/checkout the repo, edit `awf-deploy/index.html` with normal file edits, `node -e` syntax-check, `git commit`, `git push` a branch, open the PR (`gh pr create` or the API), verify the Netlify preview, merge (`gh pr merge`). Standard git — no browser needed. Still branch+PR into protected `main`; propagate to `tenant/elite` as a second branch+PR.

**Legacy (old Cowork desktop task — no local push):** deploys went through the GitHub web editor via Claude-in-Chrome: open `github.com/chrisbenyo/awf-quoting/edit/<branch>/awf-deploy/index.html`, get the CodeMirror view (`const el=document.querySelector('.cm-content'); const view=(el.cmView&&el.cmView.view)||(el.cmTile&&el.cmTile.view);`), apply base64 old/new snippet pairs (assert each matches once) then `view.dispatch({changes:{from:0,to:view.state.doc.length,insert:newText}})`, Commit → new branch → Propose → Create PR → Merge. Verify a deploy by loading the preview and introspecting in-page (e.g. `loadActiveJobs.toString().includes('sbFetchByIds')`). Only needed if you're ever back on a surface without git push.
