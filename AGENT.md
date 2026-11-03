DelIQ Data Platform: Specification for Company A (Sweden pilot)
Build brief for an AI coding agent | Team: Ctrl + Alt + Defeat | Version 1.0, 3 November 2026
0. How the agent must use this document
1. Treat requirement IDs (for example ING-3) as the unit of work. Cite them in commit messages and test names.
2. Priorities: P0 = needed for the Round 2 demo (deadline 9 Nov 2026, 22:00 GMT+7 = 16:00 Stockholm); P1 = next after the demo; P2 = roadmap. Finish all P0 before starting any P1.
3. The source systems already exist as the simulator deliq-sim (SQLite files erp.db, wms.db, tms.db, plus a carrier event feed, with sim.db as the replay clock). Read its schema/*.sql. Do not invent source tables or columns. Never write to a source database.
4. If a detail is missing, pick the simplest option, add one line to docs/ASSUMPTIONS.md with a justification, and keep going. Do not block on questions.
5. Every module ships with tests (Vitest). A requirement is done only when its acceptance check passes.
6. Zero-cost constraint: no paid services and no cloud accounts. All LLM calls go through an adapter that has a deterministic mock mode, so the full system runs offline.
7. Never commit secrets or real personal data. Provide .env.example.
8. Prefer boring, readable code. TypeScript strict mode. Validate every external boundary with Zod.
9. Keep a log of AI-assisted work as you go (task, original estimate, actual time, what a human validated). The team must submit an AI Journal.
1. Business context and purpose
Company A is a Danish construction retailer with hundreds of stores in Denmark, Norway and Sweden, selling building materials, tools and home-improvement products to trade customers and consumers. Each country grew its own systems and manual processes. The pilot focuses on Sweden, delivery and fulfilment, where about 65% of customers are trade customers (contractors). A late or failed delivery of bulky materials idles a paid crew on site, which risks the relationship and the margin.
What DelIQ is: a lightweight control-tower layer on top of the existing ERP, WMS, TMS and carriers. It does not replace them. Its hypothesis: if every delivery exception becomes a case with an owner, a clock and a history, and bounded AI helps resolve the routine ones, then time-to-resolve, repeat contacts and failed deliveries fall.
The data platform is the foundation. It must give one trustworthy, timely view of every order from confirmation to delivery, detect problems before the customer feels them, and record everything needed to act, audit and learn.
Business questions the platform must answer
1. Which open orders are at risk of missing their delivery window, and how sure are we?
2. Which of them matter most (customer tier, order value, time left)?
3. Who owns each problem, what is the deadline, and what has been done so far?
4. What are the feasible fixes, ranked by speed, cost and chance of success?
5. Which fixes may the system do alone, which need approval, which need a human lead?
6. What did we tell the customer, when, and was it accurate?
7. Can we trust the data right now (freshness, conflicts between systems)?
8. Is DelIQ working: on-time-in-full rate, mean time to resolve, manual effort, auto-resolved share?
9. Where do orders fail repeatedly (by carrier, SKU, route, DC)?
10. How do we repeat this in Denmark and Norway with minimal rework?
2. Scope
Area
P0 (demo)
P1
P2
Ingestion
Polling of ERP, WMS, TMS, carrier events; carrier webhook; raw store
CSV fallback importer; incremental backfill
Real API adapters, SAP and SFTP adapters
Canonical model
Orders, shipments, events, ID cross-reference, status map
Customer and site history
Multi-DC, multi-country dimensions
Detection
Rules R1 to R7 with evidence
Conflict rule R8, threshold tuning UI
ML delay prediction
Cases
Tickets, owner, SLA clock, urgency score, history
Assignment rules, bulk actions
Workflow engine
AI
Structured triage, ranked fixes, message drafts, guardrails, mock mode
Evaluation harness, shadow mode reports
Fine-tuned or local models
Policy gate
Path A/B/C, audit log, kill switch
Spending caps per period
Per-customer policies
Serving
REST API, dashboard (queue, case brief, approvals, timeline, KPIs, data health)
SSE live updates
Mobile worker app
KPIs
Five proposal KPIs plus override rate and detection precision/recall
Weekly root-cause report
Predictive dashboards
Non-goals: replacing or writing back to ERP/WMS/TMS (actions are simulated and logged in P0); real SMS or email sending; production-grade scaling; authentication beyond simple roles.
3. Architecture and principles
Sources (ERP, WMS, TMS, carrier feed)   read-only
  -> Ingestion (poll, webhook, CSV)      idempotent, validated
  -> Raw store                           append-only, payload preserved
  -> Canonical layer                     normalised IDs, statuses, events
  -> Detection engine                    deterministic rules
  -> Case management                     one ticket per issue
  -> AI triage                           structured, bounded
  -> Policy gate + audit log             Path A/B/C
  -> Actions / notification outbox       simulated in P0
  -> Serving (REST API, dashboard) and Analytics (KPI views)
Principles (non-negotiable):
• Read-only to sources. DelIQ owns only its own database deliq.db, separate from the source databases.
• Deterministic first, AI second. Rules detect and classify. AI only recommends and drafts, never detects, and never executes directly.
• Event-sourced timeline. Every state change is an append-only event. Current state is derived from events.
• Idempotent and replayable. Re-running ingestion on the same data must not create duplicates. The full pipeline must be replayable from the raw store.
• Simulated clock. All time-dependent logic uses now() from GET /api/mock/clock, never Date.now(), behind one Clock interface.
• Config over code. Thresholds, status maps, autonomy rules and message templates live in tables or config files.
• Country-agnostic core. Country, language, timezone and currency are attributes, not hard-coded.
• Everything audited. Each automated or human decision is logged with inputs and outcome.
Zero-cost stack: TypeScript, Next.js (App Router) for API routes and dashboard, SQLite via better-sqlite3 with Drizzle ORM (keep SQL Postgres-compatible), Zod, Vitest, Tailwind. LLM provider behind an LlmClient interface with two implementations: MockLlm (fixtures, deterministic, default) and RemoteLlm (any provider free tier, enabled by env var).
4. Source systems the platform must integrate
These match the simulator. Keep identifiers exactly as given.
System
Tables used
What DelIQ takes from it
Poll cursor
ERP
customers, sites, products, orders, order_lines, distribution_centers
Customer type and tier, SLA hours, late penalty, order value, promised date and delivery window, site address and access notes
orders.updated_at
WMS
wms_orders, pick_tasks, stock, dispatch_events, replenishments
Pick status and shortages, stock position, load cut-off, staged/loaded/handed-over events, expected replenishment
wms_orders.updated_at; dispatch_events.event_ts
TMS
shipments, milestones, routes, vehicles, carriers, delivery_attempts
Planned and current ETA, milestone plan vs actual, route status, vehicle capabilities, attempt outcomes
shipments.updated_at
Carrier feed
carrier_events
Raw third-party events (PU, DEP, ARR, OFD, DEL, EXC)
received_at; also pushed by webhook
Known mismatches the platform must resolve (this is the integration work):
• Order IDs differ: ERP ORD-10432, WMS ext_ref 10432, TMS order_ref ORD10432. The canonical key is ORD-10432.
• Different status vocabularies in each system (see section 6.3).
• The DC is dc_id in ERP and dc_code in WMS/TMS.
• Carrier events join to shipments through tracking_id; carrier codes differ from TMS statuses.
• Timestamps are ISO-8601 UTC strings. Missing current_eta means the ETA is unknown.
• Data can be stale, late or out of order. A TMS update may arrive before the carrier event that caused it.
5. Ingestion layer
ID
P
Requirement
Acceptance check
ING-1
P0
One SourceAdapter interface per system: fetchChanges(cursor) -> {rows, nextCursor}. P0 adapters call the mock REST APIs (/api/mock/{system}/{table}?updated_since=).
Adapters are swappable in tests with a fake.
ING-2
P0
Persist a cursor per source table in ingestion_cursor. A failed run does not advance the cursor.
Kill mid-run, rerun, no gaps and no duplicates.
ING-3
P0
Store every fetched row in raw_<table> with source, fetched_at, content_hash and the original JSON. Append-only.
Identical row twice produces one logical record (unique on source + natural key + hash).
ING-4
P0
Validate each row with a Zod schema. Invalid rows go to ingestion_dead_letter with the error. The run continues.
Inject a malformed row; it lands in dead letter; the rest is processed.
ING-5
P0
Carrier webhook receiver POST /api/webhooks/carrier. Validate, store raw, write the event to the canonical timeline. Poll and webhook must converge without duplicates.
Same event via both paths yields one timeline event.
ING-6
P0
ingestion_run table: start, end, rows read, rows written, dead-lettered, status. Scheduler runs every N simulated or real seconds (configurable).
Dashboard data-health page reads it.
ING-7
P1
CSV fallback importer reading the exported CSVs, same validation and same canonical outputs.
Import of exports/ produces the same canonical state as polling.
ING-8
P0
Handle out-of-order and late events: events are ordered by occurred_at, never regress a terminal stage (DELIVERED, FAILED) without an explicit correction event.
Replay shuffled events; final state is identical.
ING-9
P0
Track freshness per source: last_successful_fetch, max(source updated_at).
Exposed in the data-health API.
6. Data model of the DelIQ database (deliq.db)
6.1 Layers
• raw_*: exact source copies, append-only (ING-3).
• canonical (silver): normalised, deduplicated, joined by canonical order key.
• serving (gold): views and tables for the dashboard and KPIs.
6.2 Canonical tables
Table
Purpose
Key columns
order_xref
ID cross-reference
order_key (PK, ORD-10432), erp_order_id, wms_order_no, wms_ext_ref, tms_order_ref, shipment_id, tracking_id, dc_code
dim_customer
Customer snapshot
customer_id, type (B2B/B2C), tier, sla_hours, late_penalty_eur, preferred_lang, contact fields (PII, see section 12)
dim_site
Delivery site
site_id, address, city, lat/lon, access_notes
dim_product
SKU
sku, category, is_bulky, weight
fact_order
Canonical order
order_key, customer_id, site_id, order_value_eur, promised_date, window_start, window_end, country, dc_code
fact_order_line
Lines
order_key, sku, qty
shipment_state
Current derived state per order
order_key, stage (canonical), wms_status, tms_status, erp_status, current_eta, planned_eta, route_id, route_status, last_event_at, last_update_by_source (JSON), data_freshness_flag
delivery_event
Append-only timeline
event_id, order_key, source, event_type, stage_after, occurred_at, ingested_at, raw_ref
status_map
Config
source, source_status, canonical_stage
threshold_config
Config
country, customer_tier, rule_id, params (JSON)
6.3 Canonical stages and status mapping (P0)
Stages in order: ORDERED, RELEASED, ALLOCATED, PICKING, PICKED, SHORT, STAGED, LOADED, DISPATCHED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, FAILED, RETURNED. SHORT and FAILED are exception stages; DELIVERED and RETURNED are terminal.
Source
Source status
Canonical stage
ERP
CONFIRMED / RELEASED / DISPATCHED / DELIVERED
ORDERED / RELEASED / DISPATCHED / DELIVERED
WMS
NEW / ALLOCATED / PICKING / PICKED / SHORT / STAGED / LOADED
RELEASED / ALLOCATED / PICKING / PICKED / SHORT / STAGED / LOADED
TMS
PLANNED / TENDERED / IN_TRANSIT / OUT_FOR_DELIVERY / DELIVERED / FAILED / RETURNED
LOADED-or-earlier (do not advance) / DISPATCHED / IN_TRANSIT / OUT_FOR_DELIVERY / DELIVERED / FAILED / RETURNED
Carrier
PU / DEP / OFD / DEL / EXC
DISPATCHED / IN_TRANSIT / OUT_FOR_DELIVERY / DELIVERED / (exception event, no stage change by itself)
Rule: the canonical stage is the furthest-advanced non-conflicting stage. If sources disagree materially (for example ERP says DELIVERED, TMS says IN_TRANSIT), keep the more conservative stage and raise a DATA_CONFLICT detection (R8).
ID
P
Requirement
Acceptance check
MOD-1
P0
Build order_xref by normalising IDs with one pure function per system, unit-tested.
100% of simulator orders resolve to a full cross-reference.
MOD-2
P0
Status mapping is read from status_map, not hard-coded. Unknown source statuses are dead-lettered and flagged.
Add an unmapped status; it is flagged, nothing crashes.
MOD-3
P0
shipment_state is rebuilt deterministically from delivery_event plus source snapshots.
Rebuild from scratch equals incremental state.
MOD-4
P0
All canonical tables carry country (default SE) and dc_code.
Schema check.
MOD-5
P0
Schema migrations are versioned (Drizzle migrations), runnable from empty.
npm run migrate on a clean checkout.
7. Detection engine
Deterministic rules evaluated on every ingestion cycle and every clock tick, against shipment_state and open tickets. All thresholds come from threshold_config (defaults below; per country and tier overridable).
Rule
Exception type
Condition (defaults)
Severity
R1
SHORT_PICK
Any pick_tasks.status = SHORT, or wms_orders.status = SHORT
High; Critical if tier is STRATEGIC or value above high-value limit
R2
LATE_DISPATCH
now > wms_orders.cutoff_at and no LOADED event; early warning at cut-off minus 15 min
Medium, High after 30 min late
R3
STALLED_MILESTONE
Milestone actual_at is null and now > planned_at + grace (grace 30 min for DEPARTED_DC, 45 min for OUT_FOR_DELIVERY)
Medium
R4
ETA_BREACH
current_eta > window_end, or current_eta within 30 min of window_end and stage is not OUT_FOR_DELIVERY
High for B2B, Medium for B2C
R5
STATUS_UNKNOWN
In transit and current_eta is null, or no update from any source for longer than the freshness threshold (default 45 min during operating hours)
Medium; High within 2 h of the window end
R6
DELIVERY_FAILED
delivery_attempts.outcome = FAILED or carrier EXC with a failed-attempt reason
High
R7
ROUTE_BREAKDOWN
routes.status = BREAKDOWN; one ticket per affected order, linked to one route-level incident
Critical
R8
DATA_CONFLICT
Source statuses disagree beyond the allowed lag (default 20 min)
Low (P1)
ID
P
Requirement
Acceptance check
DET-1
P0
Each detection stores rule_id, order_key, detected_at (simulated), and an evidence JSON listing the source rows and timestamps used.
Every ticket shows its evidence.
DET-2
P0
De-duplication: at most one open ticket per (order_key, exception_type). Repeated hits update the existing ticket and may raise severity.
Run detection 10 times; still one ticket.
DET-3
P0
Auto-resolve when the condition clears (for example ETA recovers), with a RESOLVED_AUTO event and reason.
Test per rule.
DET-4
P0
Detection is pure given (state, config, now). Unit tests use fixtures; no database access inside rule functions.
Rule unit tests run without a DB.
DET-5
P0
Evaluate precision and recall against sim.db > planted_exceptions in a script (evaluation only, never used by production code paths).
npm run eval:detection prints precision, recall, and median lead time before the window end.
DET-6
P1
Rule R8 and threshold tuning screen.
n/a
8. Case management
Ticket = one exception on one order. Table ticket: ticket_id, order_key, exception_type, severity, state, owner_id, opened_at, due_at, resolved_at, urgency_score, path (A/B/C), customer_tier, order_value_eur, route_id, source_rule. Table ticket_event (append-only): state changes, owner changes, comments, AI recommendations, approvals, actions, messages sent.
States: NEW, TRIAGED, AWAITING_APPROVAL, IN_PROGRESS, WAITING_CUSTOMER, RESOLVED, CLOSED, SUPPRESSED.
SLA clock: due_at = opened_at + target, targets default B2B 2 h and B2C 6 h (these are the proposal's MTTR standards), capped at the delivery window end when that comes first.
Urgency score (0 to 100, default formula, configurable):
score = min(100, 40*tierWeight + 25*timePressure + 15*valueFactor + 10*isB2B + 10*repeat)
• tierWeight: STRATEGIC 1.0, KEY 0.6, STANDARD 0.3
• timePressure: clamp(1 - minutesToWindowEnd / 240, 0, 1); equals 1 once the window has passed
• valueFactor: min(1, order_value / 20000)
• isB2B: 1 or 0; repeat: 1 if the same customer had an exception in the last 7 days
ID
P
Requirement
Acceptance check
CAS-1
P0
Every ticket has an owner. Unassigned tickets default to the dispatcher queue and show as unowned.
No ticket without owner_id or queue.
CAS-2
P0
State transitions are validated by a state machine; illegal transitions are rejected and tested.
Transition matrix test.
CAS-3
P0
Full history in ticket_event; the UI renders it as a timeline.
Case detail page.
CAS-4
P0
Urgency and due_at recomputed on each cycle while the ticket is open.
Score rises as the window nears.
CAS-5
P0
Route-level incident object groups tickets from one breakdown.
Hero breakdown scenario shows one incident with its tickets.
CAS-6
P1
Assignment rules by DC, carrier, tier; reassignment with reason.
n/a
9. AI triage layer
Purpose: for each ticket, produce a structured, evidence-based recommendation and drafts. AI never detects, never executes, and never changes ticket state on its own.
Context pack (the only data given to the model, built by code, minimised): order summary and lines, customer tier and SLA, site access notes (treated as untrusted text), current stage and timeline, exception evidence, stock and expected replenishment for short SKUs, carrier on-time rating, route and vehicle details, alternative vehicles with crane capability, history of the last similar resolved tickets, and the policy table. Customer names and contact details are replaced by pseudonymous IDs.
Output schema (Zod-validated):
{ ticketId, rootCause, confidence (0..1),
  candidateActions: [{ type, description, costEur, etaGainMinutes, successProbability, requiresApproval, evidenceRefs[] }],
  recommendedActionIndex,
  customerMessage: { language, channel, body, evidenceRefs[] },
  internalBrief: string }
type must be one of an allowed whitelist: SEND_ETA_UPDATE, REQUEST_INFO_OR_PHOTO, RESCHEDULE_DELIVERY, REROUTE_VEHICLE, PARTIAL_DELIVERY, REPLACEMENT_ORDER, ESCALATE_TO_HUMAN, NO_ACTION.
ID
P
Requirement
Acceptance check
AI-1
P0
LlmClient interface with MockLlm (rule-based fixtures per exception type) as the default and a RemoteLlm behind an env flag.
Full test suite passes offline.
AI-2
P0
Output validated against the schema; invalid output is retried once, then replaced by the deterministic template recommendation.
Fault-injection test.
AI-3
P0
Grounding check: every number, time, SKU or ID in the message and brief must appear in the context pack; otherwise reject the draft.
Test with a hallucinated ETA.
AI-4
P0
Prompt-injection defence: free-text fields are delimited and marked as data; the model has no tools; outputs cannot add action types outside the whitelist.
Test with a malicious access_notes value.
AI-5
P0
Log every call: prompt hash, context pack reference, response, model, latency, validation result, in ai_call_log.
Visible in the audit view.
AI-6
P0
Messages are generated in the customer's preferred_lang (sv or en in P0).
Both languages tested.
AI-7
P0
Shadow mode flag: recommendations are produced and logged but not offered for execution. Kill switch disables AI calls and falls back to templates.
Toggle test.
AI-8
P1
Evaluation harness over resolved and planted cases: action acceptance rate, override rate, message accuracy.
n/a
10. Policy gate and actions
Every proposed action passes the gate before anything happens. Rules live in config, evaluated in this order (first match wins):
1. Kill switch on: Path C (human-led) for everything.
2. Exception is ROUTE_BREAKDOWN, a safety flag, tier STRATEGIC, or order value above the high-value limit (default 20,000 EUR): Path C, human-led.
3. Action has a cost, changes a route or vehicle, creates a replacement order, or reschedules a B2B delivery: Path B, human approval (one click by the dispatcher, with the AI brief shown).
4. Action is a low-risk communication (ETA update, status acknowledgement, request for missing information or photos): Path A, autonomous, subject to rate limits (default 1 message per customer per ticket per 30 min) and quiet hours.
5. Anything not matched: Path B.
ID
P
Requirement
Acceptance check
POL-1
P0
Gate implemented as a pure function (ticket, action, config) -> {path, reason} with tests for every branch.
Table-driven tests.
POL-2
P0
Approvals record approver, time, decision, optional comment. Rejections are stored as overrides with a reason code.
Override rate computable.
POL-3
P0
Actions in P0 are simulated: they write an action_log row and a notification_outbox row (channel, language, body, status). No source system is written to.
Outbox visible in the UI.
POL-4
P0
audit_log is append-only, with a hash chain (each row stores the hash of the previous row) and covers detections, AI calls, gate decisions, approvals, actions, config changes.
Tamper test detects a modified row.
POL-5
P1
Spending caps per day and per customer; counters reset by simulated day.
n/a
11. Serving: API and dashboard
REST API (JSON, Zod-typed, under /api/deliq): GET /tickets (filters: state, severity, owner, tier, exception type, order by urgency), GET /tickets/:id (brief, evidence, timeline, recommendations), POST /tickets/:id/approve and /reject, POST /tickets/:id/assign, GET /orders/:orderKey/timeline, GET /kpis, GET /health/data (freshness, dead letters, conflicts), GET /outbox, GET /audit, POST /admin/kill-switch, POST /admin/shadow-mode.
Dashboard views (P0):
1. Control tower queue: open tickets sorted by urgency, colour by Path (green/amber/red), SLA countdown, owner.
2. Case detail: AI brief, ranked actions with cost and chance of success, evidence, customer message draft (editable), approve or reject with one click, full timeline.
3. Order timeline: cross-system view of one order (ERP, WMS, TMS, carrier events side by side).
4. Approvals: pending Path B items.
5. KPIs: the metrics in section 12, with traffic-light thresholds.
6. Data health: per-source freshness, dead letters, conflicts, last ingestion runs.
7. Outbox and audit: messages that would have been sent; audit log browser.
ID
P
Requirement
Acceptance check
SRV-1
P0
API contracts defined once (Zod) and shared by backend and frontend.
Type-safe client.
SRV-2
P0
The dashboard refreshes by polling (5 s) in P0.
Visible update when the simulator ticks.
SRV-3
P0
Roles: dispatcher, supervisor, analyst (read-only), admin; a simple role switch is enough for the demo.
Approve button hidden for analyst.
SRV-4
P1
Server-sent events for live updates.
n/a
12. KPIs, analytics and privacy
12.1 KPI definitions (from the proposal; implement as SQL views)
KPI
Definition
On-target
At-risk
Critical
OTIF
Orders delivered on time and in full / total delivered x 100
>= 95% (B2B)
85 to 94%
< 85%
Early detection rate
Exceptions flagged before the delivery window ends / total exceptions x 100
>= 80%
60 to 79%
< 60%
MTTR
Total resolution time / closed tickets
<= 2 h (B2B)
2 to 6 h
> 6 h
Manual effort per case
Staff minutes per case versus baseline of 90 min
>= 50% cut
25 to 49%
< 25%
Auto / 1-click resolved
(Path A + Path B resolved) / total tickets x 100
>= 60%
40 to 59%
< 40%
Add: override rate (rejected or edited recommendations / recommendations shown), repeat-contact rate, detection precision and recall (evaluation only), AI message grounding failure rate, and a weekly root-cause breakdown by carrier, route, SKU and DC.
ID
P
Requirement
Acceptance check
KPI-1
P0
KPI views computed from ticket, ticket_event, delivery_event; each has a unit test with a tiny fixture.
Expected numbers match by hand.
KPI-2
P0
Baseline vs current comparison using the three historical days seeded in the simulator.
KPI page shows both.
KPI-3
P1
Weekly root-cause report export (CSV).
n/a
12.2 Data quality and observability
ID
P
Requirement
DQ-1
P0
Checks run each cycle and write to dq_issue: unresolved cross-references, duplicate natural keys, timestamp order violations (for example delivered before departed), stage regressions, unmapped statuses, stale sources.
DQ-2
P0
Data-freshness flag on shipment_state; orders with stale data show Status Unknown instead of a guessed ETA (the principle: customers tolerate delay better than silence, but never a made-up ETA).
DQ-3
P0
Structured JSON logging with a correlation ID per ingestion run and per ticket.
DQ-4
P1
Metrics endpoint with run durations and row counts.
12.3 Security, privacy and compliance
• GDPR: customer names, emails and phone numbers are personal data. Minimise: pseudonymise in AI context packs, mask in logs, and keep contact fields in dim_customer only. Document purpose and retention (default: raw 12 months, tickets and audit 24 months) in docs/PRIVACY.md.
• EU AI Act posture: human oversight (Path B/C), logging of AI decisions, transparency that messages may be AI-drafted, ability to disable AI (kill switch), documented limits.
• Access: role-based as in SRV-3; secrets only through environment variables; no keys in the repository or the submission.
• Integrity: audit hash chain (POL-4); source access is read-only by construction (query-only connections).
13. Multi-country extension
The canonical model, rules and gate are shared. Per country only these change: adapters, status_map, threshold_config, language templates, timezone and currency.
ID
P
Requirement
EXT-1
P1
SourceAdapter implementations as separate packages: adapter-se-mock (P0), adapter-dk-sap (stub: reads exported SAP-like CSV), adapter-no-sftp (stub: batch file pickup).
EXT-2
P1
Message templates and AI output language per country (sv, da, nb, en).
EXT-3
P1
Rollout checklist per country: status mapping, thresholds, language, employee briefing, 4 to 6 weeks of shadow mode before live.
EXT-4
P2
ML delay prediction trained on the ticket and event history (flag orders likely to fail before any rule fires).
14. Repository layout and coding standards
deliq/
  apps/web/                  Next.js: dashboard + API routes
  packages/core/             pure logic: canonical types, status mapping, detection rules, urgency, policy gate
  packages/adapters/         SourceAdapter implementations (se-mock, csv)
  packages/ai/               LlmClient, MockLlm, RemoteLlm, context pack builder, grounding checks
  packages/db/               Drizzle schema, migrations, repositories
  packages/contracts/        Zod schemas shared by API and UI
  scripts/                   migrate, ingest, eval:detection, seed-config
  docs/                      ASSUMPTIONS.md, PRIVACY.md, ARCHITECTURE.md, AI_JOURNAL_NOTES.md
Standards: pure functions in core (no I/O); repositories hide SQL; every public function typed; tests next to the code; lint and typecheck in CI script; small commits referencing requirement IDs.
15. Delivery plan (3 to 9 November 2026)
Day
Goal
Requirements
3 Nov
Repo, migrations, adapters, raw store, xref, status map, canonical state
ING-1 to 4, 6, 8, 9; MOD-1 to 5
4 Nov
Detection rules R1 to R7, tickets, urgency, SLA, state machine
DET-1 to 5; CAS-1 to 5
5 Nov
AI adapter with mock, guardrails, policy gate, audit, outbox
AI-1 to 7; POL-1 to 4
6 Nov
REST API and dashboard (queue, case detail, approvals, timeline)
SRV-1 to 3
7 Nov
KPIs, data health, webhook path, DQ checks
KPI-1, 2; DQ-1 to 3; ING-5
8 Nov
Hardening, demo rehearsal, record the video, user journey PDF, system context diagram PDF, AI Journal
End-to-end acceptance
9 Nov
Buffer and submission before 22:00 GMT+7
n/a
End-to-end acceptance scenario (the demo)
1. Start the simulator at 04:00Z. DelIQ ingests and shows the queue with the planted short-picks (hero ORD-10001, STRATEGIC, about 49k EUR, Path C human-led).
2. Advance the clock. ORD-10002 (KEY B2B) gets a transit delay: ticket opens, AI proposes a reschedule, dispatcher approves with one click (Path B).
3. ORD-10003 (B2C) delivery fails, site closed: AI drafts a Swedish message, the gate marks it Path A, it appears in the outbox automatically.
4. Run inject delay ORD-10004 150 live: the carrier event arrives by webhook, ETA becomes unknown, a Status Unknown ticket opens, then ETA_BREACH.
5. The route breakdown creates one incident with its stuck orders, all Path C.
6. Open KPIs: OTIF, early detection rate, MTTR, auto/1-click share, with the historical baseline; open Data health; open the audit log and verify the hash chain.
16. Assumptions and open questions
• All figures (hours, costs, thresholds) are benchmarks to be calibrated in Phase 1 of the real pilot, as stated in the proposal.
• One pilot DC (DC-SE-01); the model supports many.
• Actions are simulated; real write-back to ERP/WMS/TMS is out of scope for the MVP.
• Customer contact data are synthetic.
• Open: which free LLM provider (if any) the team will use for the live demo; whether MockLlm is sufficient for the video (acceptable if clearly labelled).
17. Kick-off prompt for the coding agent
Copy this into the agent session together with this document and the deliq-sim repository:
You are building the DelIQ data platform described in this specification. Work in the order of the delivery plan. Start with packages/db migrations, then packages/core types and status mapping, then adapters that read the deliq-sim mock APIs. For each requirement ID: write the test first, implement, run the tests, and report the result in one line. Do not write to source databases. Use the simulated clock only. When something is unclear, record an assumption in docs/ASSUMPTIONS.md and continue. After each day's block, summarise what is done, what is failing, and what you will do next.