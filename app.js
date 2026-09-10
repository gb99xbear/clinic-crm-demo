// app.js — Klinik CRM SPA (GP & Dental) (redesign). Same API surface as the original; new rendering.

const $ = (id) => document.getElementById(id);
const HIDDEN = "hidden";

const STAGES = ["new", "qualified", "appointment", "treated", "lost"];
const ENGAGEMENT = ["new", "responding", "qualified", "not_interested", "unreachable"];
const SOURCES = ["manual", "website", "whatsapp", "walkin", "referral", "google"];
const DOC_TYPES = ["ic", "medical_history", "consent_form", "xray", "insurance", "other"];
const SUBMISSION_STATUS = ["scheduled", "checked_in", "in_treatment", "billed", "completed", "cancelled", "no_show"];
const SCHOOL_STATUSES = ["prospect", "contacted", "meeting", "active", "paused", "dropped"];
const TIER_LABELS = {
  tier1_spk: "T1 Flagship", tier2_elite: "T2 Elite",
  tier3_islamic: "T3 Community", tier4_regional: "T4 Regional",
};

let currentLead = null;
let pollTimer = null;

// ---------- api helper ----------

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (r.status === 401 && !path.startsWith("/login")) { showLogin(); throw new Error("unauthorized"); }
  if (!r.ok) {
    const detail = await r.json().catch(() => ({}));
    throw new Error(detail.detail || `${path} -> ${r.status}`);
  }
  return r.json();
}

// ---------- utils ----------

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function label(s) { return String(s || "").replace(/_/g, " "); }
function fmtDate(epoch) {
  if (!epoch) return "-";
  return new Date(epoch * 1000).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtDay(epoch) {
  if (!epoch) return "-";
  return new Date(epoch * 1000).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}
function fmtRel(epoch) {
  if (!epoch) return "-";
  const diff = epoch - Date.now() / 1000, abs = Math.abs(diff);
  const unit = abs < 3600 ? [60, "m"] : abs < 86400 ? [3600, "h"] : [86400, "d"];
  const n = Math.max(1, Math.round(abs / unit[0]));
  return diff < 0 ? `${n}${unit[1]} ago` : `in ${n}${unit[1]}`;
}
function initials(name) { return String(name || "?").split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase(); }
function toast(text, ms = 2200) {
  const t = $("toast"); t.textContent = text; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), ms);
}
function setMsg(id, text, isErr = false, clearMs = 2500) {
  const el = $(id); if (!el) return;
  el.textContent = text; el.classList.toggle("err", isErr);
  clearTimeout(el._t); if (clearMs) el._t = setTimeout(() => (el.textContent = ""), clearMs);
}
const _deb = {};
function debounce(fn, ms = 220) {
  return (...a) => { clearTimeout(_deb[fn.name]); _deb[fn.name] = setTimeout(() => fn(...a), ms); };
}
function fail(e) { if (e.message !== "unauthorized") { console.error(e); toast("⚠ " + e.message); } }

// ---------- auth ----------

function showLogin() {
  $("login").classList.remove(HIDDEN); $("app").classList.add(HIDDEN);
  const tb = document.getElementById('mobile-topbar');
  if (tb) tb.classList.add(HIDDEN);
  closeSidebar();
  if (pollTimer) clearInterval(pollTimer);
}
async function doLogin() {
  try {
    const r = await fetch("/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: $("login-pw").value }) });
    if (!r.ok) throw new Error("bad");
    $("login").classList.add(HIDDEN); $("app").classList.remove(HIDDEN);
    const tb = document.getElementById('mobile-topbar');
    if (tb) tb.classList.remove(HIDDEN);
    startApp();
  } catch { $("login-msg").textContent = "Wrong password"; $("login-msg").classList.add("err"); }
}
async function doLogout() { await fetch("/logout"); showLogin(); }


// ---------- mobile sidebar ----------
function toggleSidebar(force) {
  const sb = document.querySelector('.sidebar');
  const bd = document.getElementById('sidebar-backdrop');
  const open = force !== undefined ? force : !sb.classList.contains('open');
  sb.classList.toggle('open', open);
  bd.classList.toggle('hidden', !open);
  document.body.classList.toggle('nav-open', open);
}
function closeSidebar() { toggleSidebar(false); }

// ---------- tabs ----------

function showTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  const navBtn = document.querySelector(`.tab[data-tab="${name}"]`);
  if (navBtn) navBtn.classList.add("active"); else document.querySelector('.tab[data-tab="pricing"]')?.classList.add("active");
  if (window.innerWidth <= 720) closeSidebar();
  document.querySelectorAll(".tabpanel").forEach((p) => p.classList.add(HIDDEN));
  const panel = $(`tab-${name}`);
  panel.classList.remove(HIDDEN);
  panel.style.animation = "none"; panel.offsetHeight; panel.style.animation = "";
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  if (name === "overview") loadOverview().catch(fail);
  if (name === "inbox") loadInboxChats();
  if (name === "leads") loadLeads().catch(fail);
  if (name === "schools") loadSchools();
  if (name === "devices") listDevices();
  if (name === "settings") showSub(currentSub);
  if (name === "add") setTimeout(() => $("a-name").focus(), 50);
}

// ================= DASHBOARD =================

let dashboardSnapshot = null;
let currentDashboardDays = null;
let dashboardDragId = null;
let kanbanPage = {};
const KANBAN_PAGE_SIZE = 6;
function kanbanPageFor(k) { return kanbanPage[k] || 0; }
function kanbanNext(k) { kanbanPage[k] = kanbanPageFor(k) + 1; renderDashboard(); }
function kanbanPrev(k) { if (kanbanPageFor(k) > 0) { kanbanPage[k]--; renderDashboard(); } }
function kanbanJump(k, v) { kanbanPage[k] = parseInt(v, 10) || 0; renderDashboard(); }
function kanbanResetAll() { kanbanPage = {}; }

function dashboardLeadMatches(l) {
  const q = ($("dash-search")?.value || "").trim().toLowerCase();
  return (!q || `${l.name || ""} ${l.program_interest || ""}`.toLowerCase().includes(q))
    && (!$("dash-source")?.value || l.source === $("dash-source").value)
    && (!$("dash-stage")?.value || l.stage === $("dash-stage").value)
    && (!$("dash-engagement")?.value || l.engagement === $("dash-engagement").value);
}

function bars(obj, total, alt) {
  return Object.entries(obj).map(([k, v]) =>
    `<div class="bar-row"><span class="bar-label">${esc(label(k))}</span><div class="bar-track"><div class="bar-fill ${alt ? "alt" : ""}" style="width:${total ? Math.round(v / total * 100) : 0}%"></div></div><span class="bar-val">${v}</span></div>`).join("");
}

function renderDashboard() {
  if (!dashboardSnapshot) return;
  const d = dashboardSnapshot, cards = d.cards;
  $("stat-cards").innerHTML = [
    ["Total leads", cards.total, ""], ["New", cards.new, "subtle"], ["Responding", cards.responding, "info"],
    ["Qualified", cards.qualified, "info"], ["Overdue follow-ups", cards.overdue_followups, cards.overdue_followups ? "bad" : ""],
    ["Hot leads", cards.hot_leads, cards.hot_leads ? "warn" : ""],
  ].map(([l, v, c]) => `<div class="card stat ${c}"><div class="stat-num">${v}</div><div class="stat-label">${esc(l)}</div></div>`).join("");

  $("source-funnel").innerHTML = bars(d.by_source || {}, cards.total, false);
  $("dashboard-engagement").innerHTML = bars(d.by_engagement || {}, cards.total, true);

  const a = d.analytics || {};
  const stageKeys = Object.keys(d.stages || {});
  $("dashboard-funnel").innerHTML = (a.funnel || []).map(f =>
    `<div class="analytics-row"><span>${esc(f.label)}</span><div class="bar-track"><div class="bar-fill alt" style="width:${f.pct_total}%"></div></div><b>${f.count} · ${f.pct_total}%</b><small>${f.pct_previous}% prev</small></div>`).join("");

  const trend = Object.entries(a.created_by_day || {}).sort();
  const maxTrend = Math.max(1, ...trend.map(x => x[1]));
  $("dashboard-created-trend").innerHTML = trend.length
    ? trend.map(([day, n], i) => `<div class="trend-bar" title="${esc(day)}: ${n}"><b>${n || ""}</b><i style="height:${Math.max(2, Math.round(n / maxTrend * 80))}%"></i>${trend.length <= 16 || i % 5 === 0 ? `<small>${day.slice(8)}/${day.slice(5, 7)}</small>` : "<small>&nbsp;</small>"}</div>`).join("")
    : '<p class="muted">No leads in this window.</p>';

  const matrix = a.by_source_stage || {};
  const maxCell = Math.max(1, ...Object.values(matrix).flatMap(v => Object.values(v)));
  $("dashboard-source-stage").innerHTML = `<table><thead><tr><th>Source</th>${stageKeys.map(s => `<th>${esc(d.stages[s].label)}</th>`).join("")}</tr></thead><tbody>${
    Object.entries(matrix).map(([src, vals]) => `<tr><th>${esc(src)}</th>${stageKeys.map(s => { const v = vals[s] || 0; return `<td class="${v === 0 ? "zero" : v >= maxCell * .6 ? "hot" : ""}">${v}</td>`; }).join("")}</tr>`).join("")}</tbody></table>`;

  const sourceSel = $("dash-source"), stageSel = $("dash-stage"), engSel = $("dash-engagement");
  if (sourceSel.options.length === 1) Object.keys(d.by_source || {}).forEach(k => sourceSel.add(new Option(label(k), k)));
  if (stageSel.options.length === 1) stageKeys.forEach(k => stageSel.add(new Option(d.stages[k].label, k)));
  if (engSel.options.length === 1) Object.keys(d.by_engagement || {}).forEach(k => engSel.add(new Option(label(k), k)));

  $("lead-kanban").innerHTML = stageKeys.map(k => {
    const col = d.stages[k], leads = col.leads.filter(dashboardLeadMatches), total = leads.length;
    const pages = Math.max(1, Math.ceil(total / KANBAN_PAGE_SIZE));
    let pg = Math.min(Math.max(kanbanPageFor(k), 0), pages - 1); kanbanPage[k] = pg;
    const slice = leads.slice(pg * KANBAN_PAGE_SIZE, (pg + 1) * KANBAN_PAGE_SIZE);
    const pager = total > KANBAN_PAGE_SIZE ? `<div class="kanban-pager">
        <button class="btn ghost small" onclick="kanbanPrev('${k}')" ${pg === 0 ? "disabled" : ""}>‹</button>
        <select class="kanban-jump" onchange="kanbanJump('${k}',this.value)">${Array.from({ length: pages }, (_, i) => `<option value="${i}" ${i === pg ? "selected" : ""}>${i + 1}/${pages}</option>`).join("")}</select>
        <button class="btn ghost small" onclick="kanbanNext('${k}')" ${pg === pages - 1 ? "disabled" : ""}>›</button></div>` : "";
    return `<section class="kanban-column" data-stage="${k}" ondragover="dashboardDragOver(event)" ondragleave="dashboardDragLeave(event)" ondrop="dashboardDrop(event,'${k}')">
      <div class="kanban-head"><b><span class="tag stage-${k}">${esc(col.label)}</span></b><span>${total}/${col.count}</span></div>
      ${slice.length ? slice.map(l => `<article class="kanban-lead" draggable="true" data-lead-id="${l.id}" ondragstart="dashboardDragStart(event,${l.id})" ondragend="dashboardDragEnd(event)" onclick="openDrawer(${l.id})">
          <b>${esc(l.name)}</b><small>${esc(l.program_interest || "No programme")}</small>
          <small>${esc(l.source)} · ${esc(label(l.engagement || "new"))}</small>
          <select onclick="event.stopPropagation()" onchange="setDashboardStage(${l.id},this.value)">${stageKeys.map(s => `<option value="${s}" ${s === l.stage ? "selected" : ""}>${esc(d.stages[s].label)}</option>`).join("")}</select>
        </article>`).join("") : `<p class="muted">Kosong</p>`}${pager}</section>`;
  }).join("");

  const groups = [["overdue", "Overdue"], ["today", "Today"], ["upcoming", "Upcoming"]];
  $("followup-queue").innerHTML = groups.map(([key, lbl]) => `<div class="followup-group ${key}"><h4>${lbl} <span>${d.followups[key].length}</span></h4>${
    d.followups[key].slice(0, 8).map(f => `<div class="followup-row" onclick="openDrawer(${f.lead_id})"><b>${esc(f.name)}</b><small>${fmtRel(f.scheduled_at)} · ${fmtDate(f.scheduled_at)} · ${esc(f.channel || "")}</small></div>`).join("") || `<p class="muted">Nothing here</p>`}</div>`).join("");

  $("nav-leads-count").textContent = cards.total;
}
function resetDashboardFilters() { ["dash-search", "dash-source", "dash-stage", "dash-engagement"].forEach(id => $(id).value = ""); kanbanResetAll(); renderDashboard(); }
async function setDashboardStage(id, stage) { try { await api(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify({ stage }) }); toast("Stage updated"); await loadOverview(); } catch (e) { fail(e); } }
function dashboardDragStart(e, id) { dashboardDragId = id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(id)); e.currentTarget.classList.add("dragging"); }
function dashboardDragEnd(e) { dashboardDragId = null; e.currentTarget.classList.remove("dragging"); document.querySelectorAll(".drag-over").forEach(x => x.classList.remove("drag-over")); }
function dashboardDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; e.currentTarget.classList.add("drag-over"); }
function dashboardDragLeave(e) { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove("drag-over"); }
async function dashboardDrop(e, targetStage) {
  e.preventDefault(); e.currentTarget.classList.remove("drag-over");
  const id = dashboardDragId || e.dataTransfer.getData("text/plain"); if (!id) return;
  const lead = Object.values(dashboardSnapshot.stages).flatMap(x => x.leads).find(l => String(l.id) === String(id));
  if (!lead || lead.stage === targetStage) return;
  const old = lead.stage; lead.stage = targetStage; renderDashboard();
  try { await api(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify({ stage: targetStage }) }); toast(`${lead.name} → ${label(targetStage)}`); await loadOverview(); }
  catch (err) { lead.stage = old; renderDashboard(); fail(err); }
}
async function loadOverview(days = currentDashboardDays) {
  currentDashboardDays = days;
  dashboardSnapshot = await api(`/api/dashboard${days ? `?days=${days}` : ""}`);
  document.querySelectorAll(".dashboard-window-buttons [data-days]").forEach(b => b.classList.toggle("current", String(b.dataset.days) === String(days || "all")));
  renderDashboard();
}
function setDashboardWindow(days) { loadOverview(days).catch(fail); }

// ================= LEADS =================

async function loadLeads() {
  const params = new URLSearchParams();
  if ($("f-search").value) params.set("search", $("f-search").value);
  if ($("f-source").value) params.set("source", $("f-source").value);
  if ($("f-stage").value) params.set("stage", $("f-stage").value);
  if ($("f-engagement").value) params.set("engagement", $("f-engagement").value);
  if ($("f-overdue").checked) params.set("overdue_followup", "true");
  const leads = await api(`/api/leads?${params}`);
  const now = Date.now() / 1000;
  $("leads-count").textContent = `${leads.length} lead${leads.length === 1 ? "" : "s"}`;
  $("leads-empty").classList.toggle(HIDDEN, leads.length > 0);
  document.querySelector("#leads-table tbody").innerHTML = leads.map(l => `
    <tr onclick="openDrawer(${l.id})">
      <td><div class="person"><span class="avatar">${initials(l.name)}</span><div><b>${esc(l.name)}</b><span class="sub">${esc(l.phone || l.email || "")}</span></div></div></td>
      <td><span class="tag src-${l.source}">${l.source}</span></td>
      <td><span class="tag stage-${l.stage}">${label(l.stage)}</span></td>
      <td><span class="tag eng-${l.engagement}">${label(l.engagement)}</span></td>
      <td>${esc(l.program_interest || "—")}</td>
      <td class="${l.next_followup_at && l.next_followup_at < now ? "overdue" : ""}">${l.next_followup_at ? `${fmtRel(l.next_followup_at)}<span class="sub">${fmtDate(l.next_followup_at)}</span>` : "—"}</td>
      <td class="muted">${fmtRel(l.updated_at)}</td></tr>`).join("");
}

// ================= ADD LEAD =================

async function addLeadManual() {
  const payload = { name: $("a-name").value, email: $("a-email").value || null, phone: $("a-phone").value || null, program_interest: $("a-program").value || null };
  try {
    const r = await api("/api/leads", { method: "POST", body: JSON.stringify(payload) });
    setMsg("add-msg", `✓ Created lead #${r.id}`);
    toast(`Lead #${r.id} created`);
    ["a-name", "a-email", "a-phone", "a-program"].forEach((i) => ($(i).value = ""));
  } catch (e) { setMsg("add-msg", e.message, true); }
}

// ================= DRAWER =================

async function openDrawer(leadId) {
  try {
    currentLead = await api(`/api/leads/${leadId}`);
    $("drawer-backdrop").classList.remove(HIDDEN); $("drawer").classList.remove(HIDDEN);
    renderDrawer();
  } catch (e) { fail(e); }
}
function closeDrawer() {
  $("drawer-backdrop").classList.add(HIDDEN); $("drawer").classList.add(HIDDEN);
  currentLead = null;
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("drawer").classList.contains(HIDDEN)) closeDrawer(); });

function renderDrawer() {
  const l = currentLead.lead, stageIdx = STAGES.indexOf(l.stage), now = Date.now() / 1000;
  const docsDone = currentLead.documents.filter(d => d.status === "verified").length;
  $("drawer-content").innerHTML = `
    <div class="drawer-head"><button class="back-btn" onclick="closeDrawer()">← KEMBALI</button><button class="btn ghost small" onclick="closeDrawer()">✕</button></div>
    <div class="drawer-meta"><span class="tag src-${l.source}">${l.source}</span><span class="tag stage-${l.stage}">${label(l.stage)}</span><span class="tag eng-${l.engagement}">${label(l.engagement)}</span><span class="hint mono">#${l.id}</span></div>
    <h2 class="drawer-title">${esc(l.name)}</h2>
    <table class="detail-table"><tbody>
      <tr><th>Email</th><td>${l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : "—"}</td></tr>
      <tr><th>Telefon</th><td>${l.phone ? `${esc(l.phone)} <a class="wa-btn" style="margin-left:8px;padding:3px 10px;font-size:11.5px" href="https://wa.me/${l.phone.replace(/[^0-9]/g, "")}" target="_blank" rel="noopener">💬 WhatsApp</a>` : "—"}</td></tr>
      <tr><th>Program</th><td>${esc(l.program_interest || "—")}</td></tr>
      <tr><th>Created</th><td>${fmtDay(l.created_at)} <span class="hint">· updated ${fmtRel(l.updated_at)}</span></td></tr>
    </tbody></table>

    <h3>Stage</h3>
    <div class="stepper">${STAGES.slice(0, 7).map((st, i) => `<div class="step ${i <= stageIdx ? "active" : ""} ${st === l.stage ? "current" : ""}" onclick="setStage('${st}')" title="Set stage: ${label(st)}">${label(st)}</div>`).join("")}</div>
    <div class="row" style="margin-top:14px">${["lost", "deferred"].map(st => `<button class="btn ghost small ${st === l.stage ? "current" : ""}" onclick="setStage('${st}')">${st === l.stage ? "✓ " : ""}Mark ${st}</button>`).join("")}</div>

    <h3>Engagement</h3>
    <div class="row wrap">${ENGAGEMENT.map(e => `<button class="pill-btn ${e === l.engagement ? "active" : ""}" onclick="setEngagement('${e}')">${label(e)}</button>`).join("")}</div>

    <h3>Documents <span class="hint mono" style="text-transform:none;letter-spacing:0">${docsDone}/${currentLead.documents.length} verified</span></h3>
    <table class="mini-table"><tbody>${currentLead.documents.map(d => `
      <tr><td>${label(d.doc_type)}</td><td><span class="tag doc-${d.status}">${d.status}</span></td><td class="muted">${esc(d.notes || "")}</td>
        <td><select onchange="cycleDoc('${d.doc_type}', this.value)">${["pending", "received", "verified"].map(s => `<option value="${s}" ${s === d.status ? "selected" : ""}>${s}</option>`).join("")}</select></td></tr>`).join("")}
    </tbody></table>

    <h3>University submissions</h3>
    <table class="mini-table"><tbody>${currentLead.submissions.map(s => `
      <tr><td><b>${esc(s.university)}</b><div class="muted">${esc(s.program || "")}</div></td>
        <td><select onchange="setSubmission(${s.id}, this.value)">${SUBMISSION_STATUS.map(st => `<option value="${st}" ${st === s.status ? "selected" : ""}>${label(st)}</option>`).join("")}</select></td></tr>`).join("") || `<tr><td class="muted">No submissions yet.</td></tr>`}
    </tbody></table>
    <div class="row" style="margin-top:10px"><input id="sub-uni" placeholder="University"><input id="sub-prog" placeholder="Program"><button class="btn small" onclick="addSubmission()">Add</button></div>

    <h3>Follow-ups</h3>
    <div class="row sched"><input id="fu-days" type="number" value="3" min="1"><span class="hint">days from now</span><input id="fu-channel" placeholder="channel (whatsapp / call)"><input id="fu-notes" placeholder="notes"><button class="btn small primary" onclick="scheduleFollowup()">Schedule</button></div>
    <table class="mini-table" style="margin-top:10px"><tbody>${currentLead.followups.slice().sort((a, b) => (a.done_at ? 1 : 0) - (b.done_at ? 1 : 0) || a.scheduled_at - b.scheduled_at).map(f => `
      <tr class="${f.done_at ? "done" : f.scheduled_at < now ? "overdue" : ""}"><td>${fmtDate(f.scheduled_at)}<div class="muted" style="font-size:11px">${f.done_at ? "done" : fmtRel(f.scheduled_at)}</div></td><td>${esc(f.channel || "")}</td><td class="muted">${esc(f.notes || "")}</td>
        <td>${f.done_at ? `<span class="tag ok">done</span>` : `<button class="btn small" onclick="markFollowupDone(${f.id})">Mark done</button>`}</td></tr>`).join("") || `<tr><td class="muted">No follow-ups.</td></tr>`}
    </tbody></table>

    <h3>Activity</h3>
    <div class="activity">${currentLead.activity.map(a => `<div class="act-row"><span class="muted">${fmtDate(a.ts)} · ${esc(a.actor)}</span><b>${esc(a.action)}</b> ${esc(a.detail || "")}</div>`).join("")}</div>`;
}

// ---------- mutations ----------
async function refreshLead() { await openDrawer(currentLead.lead.id); if (!$("tab-overview").classList.contains(HIDDEN)) loadOverview().catch(() => {}); if (!$("tab-leads").classList.contains(HIDDEN)) loadLeads().catch(() => {}); }
async function setStage(stage) { try { const r = await api(`/api/leads/${currentLead.lead.id}`, { method: "PATCH", body: JSON.stringify({ stage }) }); if (r.warning) toast("⚠ " + r.warning, 4000); await refreshLead(); } catch (e) { fail(e); } }
async function setEngagement(eng) { try { await api(`/api/leads/${currentLead.lead.id}`, { method: "PATCH", body: JSON.stringify({ engagement: eng }) }); await refreshLead(); } catch (e) { fail(e); } }
async function cycleDoc(docType, status) { try { await api(`/api/leads/${currentLead.lead.id}/documents/${docType}`, { method: "POST", body: JSON.stringify({ status }) }); await refreshLead(); } catch (e) { fail(e); } }
async function setSubmission(subId, status) { try { await api(`/api/submissions/${subId}`, { method: "PATCH", body: JSON.stringify({ status }) }); await refreshLead(); } catch (e) { fail(e); } }
async function addSubmission() {
  if (!$("sub-uni").value.trim()) { toast("University name required"); return; }
  try { await api(`/api/leads/${currentLead.lead.id}/submissions`, { method: "POST", body: JSON.stringify({ university: $("sub-uni").value, program: $("sub-prog").value || null }) }); await refreshLead(); } catch (e) { fail(e); }
}
async function scheduleFollowup() {
  const days = parseInt($("fu-days").value || "3", 10);
  try { await api(`/api/leads/${currentLead.lead.id}/followups`, { method: "POST", body: JSON.stringify({ scheduled_at: Math.floor(Date.now() / 1000) + days * 86400, channel: $("fu-channel").value || null, notes: $("fu-notes").value || null }) }); toast("Follow-up scheduled"); await refreshLead(); } catch (e) { fail(e); }
}
async function markFollowupDone(id) { try { await api(`/api/followups/${id}`, { method: "PATCH" }); await refreshLead(); } catch (e) { fail(e); } }

// ================= SCHOOLS =================

function toggleSchoolForm() { $("school-form").classList.toggle(HIDDEN); if (!$("school-form").classList.contains(HIDDEN)) $("sc-name").focus(); }

async function loadSchools() {
  const q = new URLSearchParams();
  if ($("s-search").value.trim()) q.set("search", $("s-search").value.trim());
  if ($("s-status").value) q.set("status", $("s-status").value);
  if ($("s-tier").value) q.set("tier", $("s-tier").value);
  try {
    const d = await api(`/api/schools?${q}`);
    const sel = $("s-status");
    if (sel.options.length <= 1) SCHOOL_STATUSES.forEach(s => sel.add(new Option(label(s), s)));
    document.querySelector("#schools-table tbody").innerHTML = d.schools.map(s => `
      <tr onclick="openSchool(${s.id})">
        <td><b>${esc(s.name)}</b>${s.notes ? `<span class="sub">${esc(s.notes.slice(0, 70))}${s.notes.length > 70 ? "…" : ""}</span>` : ""}</td>
        <td>${esc(s.city || "")}</td><td><span class="tag">${TIER_LABELS[s.tier] || "-"}</span></td>
        <td><span class="pill pill-${s.status}">${label(s.status)}</span></td>
        <td>${esc(s.contact_name || "")}${s.contact_role ? `<span class="sub">${esc(s.contact_role)}</span>` : ""}</td>
        <td>${s.whatsapp ? `<a class="wa-btn" style="padding:3px 10px;font-size:11.5px" href="https://wa.me/${s.whatsapp.replace(/[^0-9]/g, "")}" target="_blank" rel="noopener" onclick="event.stopPropagation()">💬 chat</a>` : "<span class='muted'>—</span>"}</td>
        <td class="muted">${fmtRel(s.updated_at)}</td></tr>`).join("");
    $("schools-empty").classList.toggle(HIDDEN, d.schools.length > 0);
  } catch (e) { fail(e); }
}

async function addSchool() {
  const body = {
    name: $("sc-name").value.trim(), city: $("sc-city").value.trim(), tier: $("sc-tier").value, status: $("sc-status").value,
    contact_name: $("sc-contact").value.trim(), contact_role: $("sc-role").value.trim(), contact_email: $("sc-email").value.trim(),
    contact_phone: $("sc-phone").value.trim(), whatsapp: $("sc-wa").value.trim(), website: $("sc-web").value.trim(), notes: $("sc-notes").value.trim(),
  };
  if (!body.name) { setMsg("sc-msg", "School name required", true); return; }
  try {
    await api("/api/schools", { method: "POST", body: JSON.stringify(body) });
    ["sc-name", "sc-city", "sc-contact", "sc-role", "sc-email", "sc-phone", "sc-wa", "sc-web", "sc-notes"].forEach(id => ($(id).value = ""));
    setMsg("sc-msg", "✓ Created"); toast("School added"); toggleSchoolForm(); loadSchools();
  } catch (e) { setMsg("sc-msg", e.message, true); }
}

async function openSchool(id) {
  try {
    const d = await api(`/api/schools/${id}`), s = d.school;
    const wa = s.whatsapp ? s.whatsapp.replace(/[^0-9]/g, "") : null;
    const waText = encodeURIComponent(`Assalamu'alaikum Bapak/Ibu ${s.contact_name || ""}, saya dari Klinik...`);
    $("drawer-content").innerHTML = `
      <div class="drawer-head"><button class="back-btn" onclick="closeDrawer()">← KEMBALI</button><button class="btn ghost small" onclick="closeDrawer()">✕</button></div>
      <div class="drawer-meta"><span class="tag">${TIER_LABELS[s.tier] || ""}</span><span class="pill pill-${s.status}">${label(s.status)}</span><span class="hint">${esc(s.city || "")}</span></div>
      <h2 class="drawer-title">${esc(s.name)}</h2>
      <table class="detail-table"><tbody>
        <tr><th>Contact</th><td>${esc(s.contact_name || "—")}${s.contact_role ? ` <span class="hint">· ${esc(s.contact_role)}</span>` : ""}</td></tr>
        ${s.contact_email ? `<tr><th>Email</th><td><a href="mailto:${esc(s.contact_email)}">${esc(s.contact_email)}</a></td></tr>` : ""}
        ${s.contact_phone ? `<tr><th>Telefon</th><td>${esc(s.contact_phone)}</td></tr>` : ""}
        ${s.website ? `<tr><th>Website</th><td><a href="${esc(s.website)}" target="_blank" rel="noopener">${esc(s.website)}</a></td></tr>` : ""}
        ${wa ? `<tr><th>WhatsApp</th><td><a class="wa-btn" href="https://wa.me/${wa}?text=${waText}" target="_blank" rel="noopener">💬 WhatsApp ${esc(s.contact_name || "school")}</a></td></tr>` : ""}
      </tbody></table>
      <h3>Pipeline status</h3>
      <div class="status-row">${SCHOOL_STATUSES.map(st => `<button class="mini ${st === s.status ? "current" : ""}" onclick="setSchoolStatus(${s.id}, '${st}')">${label(st)}</button>`).join("")}</div>
      ${s.notes ? `<h3>Notes</h3><p>${esc(s.notes)}</p>` : ""}
      <h3>Activity</h3>
      <div class="activity">${d.activity.map(a => `<div class="act"><span class="act-time">${fmtDate(a.created_at)}</span><b>${esc(a.action)}</b> ${esc(a.detail || "")}</div>`).join("") || '<p class="hint">No activity yet.</p>'}</div>`;
    $("drawer").classList.remove(HIDDEN); $("drawer-backdrop").classList.remove(HIDDEN);
  } catch (e) { fail(e); }
}
async function setSchoolStatus(id, status) {
  try { await api(`/api/schools/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); toast(`Status → ${label(status)}`); await openSchool(id); loadSchools(); } catch (e) { fail(e); }
}

// ================= INBOX =================

let inboxChats = [], inboxCurrent = null, inboxThread = null;

async function loadInboxChats() {
  try {
    const dev = $("ib-device");
    if (dev.options.length <= 1) { const d = await api("/api/alisya/devices"); (d.devices || []).forEach(x => dev.add(new Option(`📱 ${x.display_name}`, x.session))); }
    const q = dev.value ? `?device=${encodeURIComponent(dev.value)}` : "";
    const d = await api(`/api/alisya/inbox${q}`);
    inboxChats = d.chats || [];
    const unread = inboxChats.reduce((n, c) => n + (c.unread || 0), 0);
    $("nav-inbox-count").textContent = unread || "";
    renderInboxList();
    if (!inboxCurrent && inboxChats.length) loadInboxMsgs(inboxChats[0].id);
    else if (inboxCurrent) loadInboxMsgs(inboxCurrent);
  } catch (e) { fail(e); }
}
function renderInboxList() {
  const q = ($("ib-search").value || "").toLowerCase();
  const rows = inboxChats.filter(c => `${c.name} ${c.id}`.toLowerCase().includes(q));
  $("ib-count").textContent = `${rows.length}`;
  $("ib-chat").innerHTML = rows.map(c => `
    <div class="chat-item ${c.id === inboxCurrent ? "current" : ""}" onclick="loadInboxMsgs('${esc(c.id)}')">
      <span class="avatar">${initials(c.name)}</span>
      <div><b>${esc(c.name)}</b><small>${c.last ? (c.last.from_me ? "↩ " : "") + esc(c.last.body) : ""}</small></div>
      <div class="meta"><span>${c.last ? fmtRel(c.last.ts) : ""}</span>${c.unread ? `<span class="unread">${c.unread}</span>` : c.bot_paused ? "<span title='bot paused'>⏸</span>" : ""}</div>
    </div>`).join("") || '<p class="hint" style="padding:12px">Tiada chat.</p>';
}
async function loadInboxMsgs(cid) {
  inboxCurrent = cid;
  renderInboxList();
  try {
    const d = await api(`/api/alisya/inbox/${encodeURIComponent(cid)}`);
    inboxThread = d;
    const c = d.chat;
    $("ib-thread-head").innerHTML = `<span class="avatar">${initials(c.name)}</span><div><b>${esc(c.name)}</b><small>${esc(c.id)} · via ${esc(c.session)}</small></div>
      <span class="bot-state tag ${c.bot_paused ? "eng-not_interested" : "eng-qualified"}">${c.bot_paused ? "Bot paused" : "Alisya active"}</span>`;
    $("ib-pause").textContent = c.bot_paused ? "▶ Resume bot" : "⏸ Pause bot";
    let lastDay = "";
    $("ib-msgs").innerHTML = (d.messages || []).map(m => {
      const day = new Date(m.ts * 1000).toDateString();
      const sep = day !== lastDay ? `<div class="day-sep">${fmtDay(m.ts)}</div>` : ""; lastDay = day;
      return `${sep}<div class="bubble ${m.from_me ? "me" : ""}"><div class="who">${m.from_me ? (m.by === "staff" ? "Staff" : "Alisya") : esc(c.name)}</div>${esc(m.body).replace(/\n/g, "<br>")}<time>${new Date(m.ts * 1000).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}</time></div>`;
    }).join("") || '<p class="hint">Tiada mesej.</p>';
    $("ib-msgs").scrollTop = $("ib-msgs").scrollHeight;
    renderInboxContext(c);
    const it = inboxChats.find(x => x.id === cid); if (it) { it.unread = 0; renderInboxList(); $("nav-inbox-count").textContent = inboxChats.reduce((n, x) => n + (x.unread || 0), 0) || ""; }
  } catch (e) { fail(e); }
}
async function renderInboxContext(c) {
  let lead = null;
  if (c.linked_lead_id) { try { lead = (await api(`/api/leads/${c.linked_lead_id}`)).lead; } catch { } }
  $("ib-ctx").innerHTML = `
    ${lead ? `<div class="kanban-lead" style="cursor:pointer" onclick="openDrawer(${lead.id})"><b>${esc(lead.name)}</b><small>${esc(lead.program_interest || "No programme")}</small><div class="row wrap" style="margin-top:6px"><span class="tag stage-${lead.stage}">${label(lead.stage)}</span><span class="tag eng-${lead.engagement}">${label(lead.engagement)}</span></div></div>` : `<p class="hint">No linked lead.</p>`}
    <dl><dt>Chat ID</dt><dd class="mono">${esc(c.id)}</dd><dt>Device</dt><dd class="mono">${esc(c.session)}</dd><dt>Bot</dt><dd>${c.bot_paused ? "Paused" : "Auto-replying"}</dd></dl>
    <label class="field"><span>Linked lead ID</span><input id="ib-lead" type="number" value="${c.linked_lead_id || ""}" placeholder="e.g. 12"></label>
    <label class="field"><span>Internal notes</span><textarea id="ib-notes" rows="3">${esc(c.notes || "")}</textarea></label>
    <div class="row"><button class="btn small primary" onclick="saveInboxContext()">Save context</button><span id="ib-ctx-msg" class="msg"></span></div>`;
}
async function saveInboxContext() {
  try { await api(`/api/alisya/inbox/${encodeURIComponent(inboxCurrent)}/context`, { method: "PATCH", body: JSON.stringify({ linked_lead_id: $("ib-lead").value || null, notes: $("ib-notes").value }) }); setMsg("ib-ctx-msg", "✓ Disimpan"); loadInboxMsgs(inboxCurrent); } catch (e) { setMsg("ib-ctx-msg", e.message, true); }
}
async function sendInboxReply() {
  const text = $("ib-reply").value.trim(); if (!text || !inboxCurrent) return;
  try { await api(`/api/alisya/inbox/${encodeURIComponent(inboxCurrent)}/reply`, { method: "POST", body: JSON.stringify({ text }) }); $("ib-reply").value = ""; await loadInboxMsgs(inboxCurrent); loadInboxChats(); } catch (e) { fail(e); }
}
async function toggleBotPause() {
  if (!inboxCurrent) return;
  try { const r = await api(`/api/alisya/inbox/${encodeURIComponent(inboxCurrent)}/pause`, { method: "POST" }); toast(r.bot_paused ? "Alisya paused for this chat" : "Alisya resumed"); loadInboxMsgs(inboxCurrent); loadInboxChats(); } catch (e) { fail(e); }
}

// ================= SETTINGS (Alisya) =================

let currentSub = "persona";
const SUB_LOADERS = { persona: loadAlisyaConfig, behaviour: loadBehaviour, knowledge: loadKnowledge, memory: loadMemoryContacts, training: loadTraining, model: loadModel, provider: loadProviders, actions: loadActions, playground: renderPlayground };
function showSub(name) {
  currentSub = name;
  document.querySelectorAll("#settings-subnav button").forEach(b => b.classList.toggle("current", b.dataset.sub === name));
  document.querySelectorAll(".subpanel").forEach(p => p.classList.add(HIDDEN));
  $(`sub-${name}`).classList.remove(HIDDEN);
  SUB_LOADERS[name]();
}

// ---- persona (Global | Device scope) ----
async function ensureCfgScopeOptions() {
  const sel = $("cfg-scope"); const cur = sel.value;
  try {
    const d = await api("/api/alisya/devices");
    sel.innerHTML = '<option value="global">🌐 Global</option>' + (d.devices || []).map(x => `<option value="${esc(x.session)}">📱 ${esc(x.display_name)} (${esc(x.session)})</option>`).join("");
    if (cur) sel.value = cur;
  } catch { }
}
function onCfgPersonaModeChange() {
  const scope = $("cfg-scope").value || "global", mode = $("cfg-persona_mode").value || "share";
  const dis = scope !== "global" && mode === "share";
  ["cfg-persona_tone", "cfg-persona_intro", "cfg-away_message", "cfg-working_hours", "cfg-ignore_keywords", "cfg-active_from", "cfg-active_to"].forEach(id => $(id).disabled = dis);
  if (scope !== "global") setMsg("cfg-msg", dis ? "Sharing global persona — switch to Custom to edit per device." : "", false, 0);
}
async function loadAlisyaConfig() {
  await ensureCfgScopeOptions();
  const scope = $("cfg-scope").value || "global", isGlobal = scope === "global";
  $("cfg-persona-mode-wrap").classList.toggle(HIDDEN, isGlobal);
  try {
    let cfg;
    if (isGlobal) { cfg = await api("/api/alisya/config"); $("cfg-persona_mode").value = "share"; onCfgPersonaModeChange(); }
    else {
      const [g, dev] = await Promise.all([api("/api/alisya/config"), api(`/api/alisya/devices/${encodeURIComponent(scope)}`)]);
      cfg = g; $("cfg-persona_mode").value = dev.persona_mode || "share";
      if (dev.persona_mode === "custom") { const ov = dev.persona_override || {}; for (const k of ["persona_tone", "persona_intro", "away_message", "working_hours", "active_hours", "ignore_keywords"]) if (ov[k] !== undefined && ov[k] !== "" && ov[k] !== null && !(Array.isArray(ov[k]) && !ov[k].length)) cfg[k] = ov[k]; }
      onCfgPersonaModeChange();
    }
    $("cfg-persona_name").value = cfg.persona_name || ""; $("cfg-working_hours").value = cfg.working_hours || "";
    $("cfg-persona_tone").value = cfg.persona_tone || ""; $("cfg-persona_intro").value = cfg.persona_intro || "";
    $("cfg-away_message").value = cfg.away_message || "";
    const ah = cfg.active_hours || [8, 22]; $("cfg-active_from").value = ah[0]; $("cfg-active_to").value = ah[1];
    $("cfg-ignore_keywords").value = (cfg.ignore_keywords || []).join(", ");
    $("cfg-auto_reply").checked = !!cfg.auto_reply; $("cfg-ignore_groups").checked = !!cfg.ignore_groups; $("cfg-ignore_unknown").checked = !!cfg.ignore_unknown;
    if (isGlobal) setMsg("cfg-msg", "", false, 0);
  } catch (e) { setMsg("cfg-msg", e.message, true); }
}
async function saveAlisyaConfig() {
  const from = parseInt($("cfg-active_from").value, 10), to = parseInt($("cfg-active_to").value, 10);
  if ([from, to].some(n => Number.isNaN(n) || n < 0 || n > 23)) { setMsg("cfg-msg", "Active hours must be 0–23", true); return; }
  const raw = {
    persona_name: $("cfg-persona_name").value.trim(), working_hours: $("cfg-working_hours").value.trim(), persona_tone: $("cfg-persona_tone").value.trim(),
    persona_intro: $("cfg-persona_intro").value.trim(), away_message: $("cfg-away_message").value.trim(), active_hours: [from, to],
    ignore_keywords: $("cfg-ignore_keywords").value.split(",").map(s => s.trim()).filter(Boolean),
    auto_reply: $("cfg-auto_reply").checked, ignore_groups: $("cfg-ignore_groups").checked, ignore_unknown: $("cfg-ignore_unknown").checked,
  };
  const scope = $("cfg-scope").value || "global";
  try {
    setMsg("cfg-msg", "Saving…", false, 0);
    if (scope === "global") {
      const patch = {}; for (const [k, v] of Object.entries(raw)) if (v !== "" && v !== null) patch[k] = v;
      await api("/api/alisya/config", { method: "PATCH", body: JSON.stringify(patch) });
    } else {
      const mode = $("cfg-persona_mode").value || "share", override = {};
      if (mode === "custom") { for (const k of ["persona_tone", "persona_intro", "away_message", "working_hours"]) if (raw[k]) override[k] = raw[k]; override.active_hours = raw.active_hours; override.ignore_keywords = raw.ignore_keywords; }
      await api(`/api/alisya/devices/${encodeURIComponent(scope)}`, { method: "PATCH", body: JSON.stringify({ persona_mode: mode, persona_override: override }) });
      if (raw.persona_name) await api("/api/alisya/config", { method: "PATCH", body: JSON.stringify({ persona_name: raw.persona_name }) });
    }
    setMsg("cfg-msg", "✓ Disimpan"); toast("Persona saved");
  } catch (e) { setMsg("cfg-msg", e.message, true); }
}

// ---- behaviour ----
const BH_MAP = { role: "bh-role", objective: "bh-objective", language: "bh-language", tone: "bh-tone", response_length: "bh-length", emoji_level: "bh-emoji", can_answer: "bh-can", must_not: "bh-must", handoff_rule: "bh-handoff", lead_fields: "bh-leads", cta: "bh-cta" };
async function loadBehaviour() {
  try { const b = await api("/api/alisya/behavior"); for (const [k, id] of Object.entries(BH_MAP)) $(id).value = b[k] || ""; $("bh-follow").checked = !!b.ask_followup; $("bh-name").checked = !!b.use_customer_name; }
  catch (e) { setMsg("bh-msg", e.message, true); }
}
async function saveBehaviour() {
  const body = {}; for (const [k, id] of Object.entries(BH_MAP)) body[k] = $(id).value; body.ask_followup = $("bh-follow").checked; body.use_customer_name = $("bh-name").checked;
  try { await api("/api/alisya/behavior", { method: "PATCH", body: JSON.stringify(body) }); setMsg("bh-msg", "✓ Disimpan — behaviour baru digunakan pada reply seterusnya", false, 4000); } catch (e) { setMsg("bh-msg", e.message, true); }
}

// ---- knowledge ----
let KNOWLEDGE_DOCS = [];
async function loadKnowledge() { try { KNOWLEDGE_DOCS = (await api("/api/alisya/knowledge")).documents || []; renderKnowledge(); } catch (e) { $("kn-list").textContent = e.message; } }
function renderKnowledge() {
  const q = ($("kn-search").value || "").toLowerCase();
  const rows = KNOWLEDGE_DOCS.filter(d => `${d.title} ${d.category} ${d.content}`.toLowerCase().includes(q));
  $("kn-list").innerHTML = rows.map(d => `<div class="kn-doc ${d.enabled ? "" : "off"}">
      <header><b>${esc(d.title)}</b><span class="tag ${d.enabled ? "eng-qualified" : ""}">${esc(d.category)}</span></header>
      <p class="hint" style="margin:0">${esc((d.content || "").slice(0, 240))}${d.content.length > 240 ? "…" : ""}</p>
      <footer><button class="btn ghost small" onclick="toggleKnowledge(${d.id},${!d.enabled})">${d.enabled ? "Disable" : "Enable"}</button><button class="btn ghost small" onclick="deleteKnowledge(${d.id})">Delete</button></footer></div>`).join("") || '<p class="hint">Tiada document.</p>';
}
function filterKnowledge() { renderKnowledge(); }
async function createKnowledge() {
  const title = $("kn-title").value.trim(), category = $("kn-category").value.trim() || "general", content = $("kn-content").value.trim();
  if (!title || !content) { setMsg("kn-msg", "Title & content diperlukan", true); return; }
  try { await api("/api/alisya/knowledge", { method: "POST", body: JSON.stringify({ title, category, content, enabled: true }) }); $("kn-title").value = ""; $("kn-content").value = ""; setMsg("kn-msg", "✓ Added"); loadKnowledge(); } catch (e) { setMsg("kn-msg", e.message, true); }
}
async function toggleKnowledge(id, enabled) { await api(`/api/alisya/knowledge/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) }); loadKnowledge(); }
async function deleteKnowledge(id) { if (!confirm("Delete knowledge document?")) return; await api(`/api/alisya/knowledge/${id}`, { method: "DELETE" }); loadKnowledge(); }

// ---- memory ----
let MEM_CONTACT = "";
async function loadMemoryContacts() {
  try {
    const d = await api("/api/alisya/memory"), sel = $("mem-contact");
    sel.innerHTML = (d.contacts || []).map(c => `<option value="${esc(c.chat_id)}">${esc(c.name || c.chat_id)} (${c.fields} fields)</option>`).join("") || '<option value="">(belum ada memory)</option>';
    if (MEM_CONTACT && [...sel.options].some(o => o.value === MEM_CONTACT)) sel.value = MEM_CONTACT;
    loadMemory();
  } catch (e) { fail(e); }
}
async function loadMemory() {
  MEM_CONTACT = $("mem-contact").value; const box = $("mem-list");
  if (!MEM_CONTACT) { box.innerHTML = '<p class="hint">Pilih contact.</p>'; return; }
  try {
    const d = await api(`/api/alisya/memory/${encodeURIComponent(MEM_CONTACT)}`);
    box.innerHTML = (d.items || []).map(it => `<div class="mem-row"><b>${esc(it.k)}</b><input value="${esc(it.v)}" onchange="saveMemoryItem('${esc(it.k)}', this.value)"><span class="src">${esc(it.source)}</span><button class="btn ghost small" onclick="delMemoryItem('${esc(it.k)}')">✕</button></div>`).join("") || '<p class="hint">Belum ada field untuk contact ni.</p>';
  } catch (e) { box.textContent = e.message; }
}
async function saveMemoryItem(k, v) {
  if (!MEM_CONTACT) { toast("Pilih contact dulu"); return; }
  if (v === undefined) { k = $("mem-k").value.trim(); v = $("mem-v").value.trim(); $("mem-k").value = ""; $("mem-v").value = ""; }
  if (!k || !v) return;
  await api(`/api/alisya/memory/${encodeURIComponent(MEM_CONTACT)}`, { method: "POST", body: JSON.stringify({ k, v }) });
  setMsg("mem-msg", "✓ Disimpan"); loadMemory(); loadMemoryContacts();
}
async function delMemoryItem(k) { if (!confirm(`Delete memory field '${k}'?`)) return; await api(`/api/alisya/memory/${encodeURIComponent(MEM_CONTACT)}/${encodeURIComponent(k)}`, { method: "DELETE" }); loadMemory(); }

// ---- training ----
function updateTrainingTokens() { $("tr-tokens").textContent = Math.max(1, Math.round(($("tr-content").value || "").length / 4)) + " tokens"; }
async function loadTraining() { try { const d = await api("/api/alisya/training"); $("tr-content").value = d.content || ""; $("tr-enabled").checked = !!d.enabled; updateTrainingTokens(); } catch (e) { setMsg("tr-msg", e.message, true); } }
async function saveTraining() {
  try { const d = await api("/api/alisya/training", { method: "PATCH", body: JSON.stringify({ content: $("tr-content").value, enabled: $("tr-enabled").checked }) }); $("tr-content").value = d.content || ""; updateTrainingTokens(); setMsg("tr-msg", "✓ Disimpan — Alisya guna training data baru pada reply seterusnya", false, 4000); }
  catch (e) { setMsg("tr-msg", e.message, true); }
}

// ---- model ----
const MD_MAP = { base: "base_url", env: "api_key_env", chat: "chat_model", memory: "memory_model", actions: "actions_model", playground: "playground_model", fallback: "fallback_model", max: "max_tokens" };
async function loadModel() { try { const d = await api("/api/alisya/model"); for (const [id, k] of Object.entries(MD_MAP)) $("md-" + id).value = d[k] ?? ""; $("md-fallback-on").checked = !!d.fallback_enabled; } catch (e) { setMsg("md-msg", e.message, true); } }
async function saveModel() {
  const body = {}; for (const [id, k] of Object.entries(MD_MAP)) body[k] = $("md-" + id).value; body.max_tokens = parseInt(body.max_tokens) || 300; body.fallback_enabled = $("md-fallback-on").checked;
  try { await api("/api/alisya/model", { method: "PATCH", body: JSON.stringify(body) }); setMsg("md-msg", "✓ Saved — new requests use this model", false, 4000); } catch (e) { setMsg("md-msg", e.message, true); }
}
async function testModel() { setMsg("md-msg", "⏳ Testing…", false, 0); try { const d = await api("/api/alisya/model/test", { method: "POST" }); setMsg("md-msg", d.ok ? `✓ ${d.model} responded: ${d.reply || "ok"}` : d.error, !d.ok, 5000); } catch (e) { setMsg("md-msg", e.message, true); } }

// ---- providers ----
async function loadProviders() {
  try {
    const d = await api("/api/alisya/providers"); $("pf-enabled").checked = !!d.enabled;
    $("pf-list").innerHTML = (d.providers || []).map(p => `<div class="pf-item ${p.enabled ? "" : "off"}"><span class="prio">${p.priority}</span><div><b>${esc(p.name)}</b> <span class="tag ${p.enabled ? "eng-qualified" : ""}">${p.enabled ? "enabled" : "disabled"}</span><small>${esc(p.model)} · ${esc(p.base_url)} · ${esc(p.api_key_env)}</small></div><div class="row"><button class="btn ghost small" onclick="testProvider(${p.id})">Test</button><button class="btn ghost small" onclick="deleteProvider(${p.id})">Delete</button></div></div>`).join("") || '<p class="hint">No custom providers configured.</p>';
  } catch (e) { setMsg("pf-msg", e.message, true); }
}
async function addProvider() {
  const body = { name: $("pf-name").value, base_url: $("pf-base").value, api_key_env: $("pf-env").value, model: $("pf-model").value, priority: parseInt($("pf-priority").value) || 100 };
  try { await api("/api/alisya/providers", { method: "POST", body: JSON.stringify(body) }); setMsg("pf-msg", "✓ Added"); ["pf-name", "pf-base", "pf-env", "pf-model"].forEach(id => $(id).value = ""); loadProviders(); } catch (e) { setMsg("pf-msg", e.message, true); }
}
async function testProvider(id) { try { const d = await api(`/api/alisya/providers/${id}/test`, { method: "POST" }); setMsg("pf-msg", d.ok ? `✓ ${d.provider} responded` : d.error, !d.ok, 4000); } catch (e) { setMsg("pf-msg", e.message, true); } }
async function deleteProvider(id) { if (!confirm("Delete provider?")) return; await api(`/api/alisya/providers/${id}`, { method: "DELETE" }); loadProviders(); }
async function testFailover() { try { const d = await api("/api/alisya/providers/test-failover", { method: "POST" }); setMsg("pf-msg", d.ok ? `✓ Used ${d.result.provider_name} / ${d.result.model}` : d.error, !d.ok, 4000); } catch (e) { setMsg("pf-msg", e.message, true); } }
async function saveProviderConfig() { try { await api("/api/alisya/providers/config", { method: "PATCH", body: JSON.stringify({ enabled: $("pf-enabled").checked }) }); setMsg("pf-msg", "✓ Routing saved"); } catch (e) { setMsg("pf-msg", e.message, true); } }

// ---- actions ----
const AC_MAP = { "ac-enabled": "enabled", "ac-create": "auto_create_lead", "ac-update": "auto_update_lead", "ac-follow": "auto_followup", "ac-notify": "notify_team" };
async function loadActions() { try { const d = await api("/api/alisya/actions"); for (const [id, k] of Object.entries(AC_MAP)) $(id).checked = !!d[k]; } catch (e) { setMsg("ac-msg", e.message, true); } }
async function saveActions() {
  const body = {}; for (const [id, k] of Object.entries(AC_MAP)) body[k] = $(id).checked;
  try { await api("/api/alisya/actions", { method: "PATCH", body: JSON.stringify(body) }); setMsg("ac-msg", "✓ Saved — CRM actions aktif pada chat seterusnya", false, 4000); } catch (e) { setMsg("ac-msg", e.message, true); }
}

// ---- playground ----
let PG_HISTORY = [];
function renderPlayground() {
  $("pg-chatbox").innerHTML = PG_HISTORY.map(m => `<div class="bubble ${m.role === "user" ? "me" : ""}"><div class="who">${m.role === "user" ? esc($("pg-name").value || "You") : "Alisya"}</div>${esc(m.content).replace(/\n/g, "<br>")}</div>`).join("") || '<p class="hint" style="align-self:center;margin:auto">Simulate a WhatsApp chat — nothing is sent.</p>';
  $("pg-chatbox").scrollTop = $("pg-chatbox").scrollHeight;
}
async function sendPlayground() {
  const input = $("pg-input"), msg = input.value.trim(); if (!msg) return;
  input.value = ""; PG_HISTORY.push({ role: "user", content: msg }); renderPlayground();
  setMsg("pg-status", "⏳ Alisya sedang fikir…", false, 0);
  try {
    const d = await api("/api/alisya/playground/chat", { method: "POST", body: JSON.stringify({ message: msg, history: PG_HISTORY.slice(0, -1), chat_id: $("pg-chat").value || "playground:test", contact_name: $("pg-name").value || "Test Contact" }) });
    PG_HISTORY.push({ role: "assistant", content: d.reply }); renderPlayground();
    setMsg("pg-status", "✓ CRM simulation — WhatsApp tidak dihantar", false, 3000);
  } catch (e) { setMsg("pg-status", e.message, true); }
}
function clearPlayground() { PG_HISTORY = []; renderPlayground(); setMsg("pg-status", "", false, 0); }

// ================= DEVICES =================

let qrFor = null;
async function listDevices() {
  try {
    const d = await api("/api/alisya/devices"), devs = d.devices || [];
    const anyUp = devs.some(x => x.status === "WORKING");
    $("nav-dev-dot").className = "nav-dot " + (anyUp ? "on" : "off");
    $("device-list").innerHTML = devs.map(x => `<div class="card device">
        <div class="card-head"><div><b>${esc(x.display_name)}</b><div class="hint mono">${esc(x.session)}</div></div><span class="status ${esc(x.status)}">${esc(x.status)}</span></div>
        <dl><dt>Number</dt><dd>${esc(x.number || "— not paired")}</dd><dt>Engine</dt><dd>${esc(x.engine || "-")}</dd><dt>Persona</dt><dd>${x.persona_mode === "custom" ? "custom override" : "shared global"}</dd></dl>
        <div class="actions">
          <button class="btn small" onclick="deviceAction('${esc(x.session)}','start')">Start</button>
          <button class="btn small ghost" onclick="deviceAction('${esc(x.session)}','stop')">Stop</button>
          <button class="btn small ghost" onclick="deviceAction('${esc(x.session)}','restart')">Restart</button>
          <button class="btn small ghost" onclick="deviceQR('${esc(x.session)}')">Show QR</button>
          <button class="btn small danger" onclick="deviceLogout('${esc(x.session)}')">Logout</button>
        </div></div>`).join("") || '<p class="hint">No devices yet.</p>';
  } catch (e) { fail(e); }
}
async function createDevice() {
  const session = $("dv-session").value.trim(), display_name = $("dv-name").value.trim();
  if (!session || !display_name) { setMsg("dv-msg", "Session slug and display name required", true); return; }
  try { await api("/api/alisya/devices", { method: "POST", body: JSON.stringify({ session, display_name }) }); $("dv-session").value = ""; $("dv-name").value = ""; toast("Device created"); await listDevices(); deviceQR(session); } catch (e) { setMsg("dv-msg", e.message, true); }
}
async function deviceAction(session, action) {
  setMsg("dv-msg", `⏳ ${action} ${session}…`, false, 0);
  try { await api(`/api/alisya/devices/${encodeURIComponent(session)}/${action}`, { method: "POST" }); setMsg("dv-msg", `✓ ${action} requested`); setTimeout(listDevices, 400); } catch (e) { setMsg("dv-msg", e.message, true); }
}
async function deviceLogout(session) { if (!confirm(`Logout / unlink ${session}? WhatsApp pairing will be removed.`)) return; await deviceAction(session, "logout"); }
async function deviceQR(session) {
  qrFor = session; $("dv-qr-for").textContent = session; $("dv-qr").innerHTML = '<p class="hint">Loading QR…</p>';
  try { const d = await api(`/api/alisya/devices/${encodeURIComponent(session)}/qr`); $("dv-qr").innerHTML = fakeQR(d.seed); setMsg("dv-msg", "Scan with WhatsApp → Linked devices", false, 0); }
  catch (e) { $("dv-qr").textContent = e.message; }
}
function fakeQR(seed) {
  // demo-only pattern; real server streams a PNG
  const n = 29; let s = seed || 1; const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const cells = [];
  const finder = (x, y) => (x >= 0 && x < 7 && y >= 0 && y < 7) && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const inF = finder(x, y) || finder(x - (n - 7), y) || finder(x, y - (n - 7));
    const zone = (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
    if (inF || (!zone && r() > .5)) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
  }
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" fill="#17201f">${cells.join("")}</svg>`;
}

// ================= INIT =================

function fillSelects() {
  STAGES.forEach(st => $("f-stage").add(new Option(label(st), st)));
  ENGAGEMENT.forEach(e => $("f-engagement").add(new Option(label(e), e)));
}
function contactPricing(plan) {
  const msg = encodeURIComponent(`Hi Campus Bridge — I'm interested in ${plan} package. Boleh share details & next steps?`);
  toast(`${plan} — opening WhatsApp…`);
  window.open(`https://wa.me/60174337675?text=${msg}`, '_blank', 'noopener');
}
function startApp() {
  fillSelects();
  const h = location.hash.slice(1);
  if (h.startsWith("lead-")) { loadOverview().catch(fail); openDrawer(Number(h.slice(5))); }
  else if (h && $(`tab-${h}`)) showTab(h); else loadOverview().catch(fail);
  listDevices();
  api("/api/alisya/inbox").then(d => { const n = (d.chats || []).reduce((s, c) => s + (c.unread || 0), 0); $("nav-inbox-count").textContent = n || ""; }).catch(() => {});
  pollTimer = setInterval(() => {
    if (currentLead) openDrawer(currentLead.lead.id).catch(() => {});
    else if (!$("tab-overview").classList.contains(HIDDEN)) loadOverview().catch(() => {});
  }, 10000);
}
async function init() {
  try {
    await api("/api/health");
    const r = await fetch("/api/stats");
    if (r.status === 401) showLogin();
    else { $("login").classList.add(HIDDEN); $("app").classList.remove(HIDDEN); startApp(); }
  } catch { showLogin(); }
}
init();
