// app.js — Klinik CRM SPA (GP & Poliklinik Famili)
// Complete native Malaysian clinical workflows: Calendar, Patient Registry, WhatsApp AI & Recall

const $ = (id) => document.getElementById(id);
const HIDDEN = "hidden";

const STAGES = ["new", "qualified", "appointment", "treated", "lost"];
const STAGE_LABELS = {
  new: "Pertanyaan Baru",
  qualified: "Disahkan",
  appointment: "Temujanji / Menunggu",
  treated: "Selesai Rawatan",
  lost: "Batal / No-Show"
};

const ENGAGEMENT = ["new", "responding", "qualified", "not_interested", "unreachable"];
const SOURCES = ["walkin", "whatsapp", "website", "referral", "manual"];
const DOC_TYPES = ["ic", "medical_history", "consent_form", "xray", "insurance", "other"];

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
function label(s) { return STAGE_LABELS[s] || String(s || "").replace(/_/g, " "); }
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
  const unit = abs < 3600 ? [60, "m"] : abs < 86400 ? [3600, "j"] : [86400, "h"];
  const n = Math.max(1, Math.round(abs / unit[0]));
  return diff < 0 ? `${n}${unit[1]} lepas` : `dalam ${n}${unit[1]}`;
}
function initials(name) { return String(name || "?").split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase(); }
function toast(text, ms = 2400) {
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
  } catch { $("login-msg").textContent = "Kata laluan salah"; $("login-msg").classList.add("err"); }
}
async function doLogout() { await fetch("/logout"); showLogin(); }

// ---------- tabs ----------
function showTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  const navBtn = document.querySelector(`.tab[data-tab="${name}"]`);
  if (navBtn) navBtn.classList.add("active"); else document.querySelector('.tab[data-tab="pricing"]')?.classList.add("active");
  if (window.innerWidth <= 720) closeSidebar();
  document.querySelectorAll(".tabpanel").forEach((p) => p.classList.add(HIDDEN));
  const panel = $(`tab-${name}`);
  if (!panel) return;
  panel.classList.remove(HIDDEN);
  panel.style.animation = "none"; panel.offsetHeight; panel.style.animation = "";
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);

  if (name === "overview") loadOverview().catch(fail);
  if (name === "calendar") loadCalendar();
  if (name === "leads") loadLeads().catch(fail);
  if (name === "inbox") loadInboxChats();
  if (name === "devices") listDevices();
  if (name === "settings") showSub(currentSub);
  if (name === "add") setTimeout(() => $("a-name").focus(), 50);
}

// ================= DASHBOARD & PIPELINE =================
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
  return (!q || `${l.name || ""} ${l.program_interest || ""} ${l.ic || ""}`.toLowerCase().includes(q))
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
    ["Jumlah Pesakit", cards.total, ""],
    ["Pertanyaan Baru", cards.new, "subtle"],
    ["Dalam Rawatan / Menunggu", cards.qualified, "info"],
    ["Temujanji Hari Ini", cards.hot_leads, "warn"],
    ["Perlu Susulan (H+3)", cards.overdue_followups, cards.overdue_followups ? "bad" : ""]
  ].map(([l, v, c]) => `<div class="card stat ${c}"><div class="stat-num">${v}</div><div class="stat-label">${esc(l)}</div></div>`).join("");

  $("source-funnel").innerHTML = bars(d.by_source || {}, cards.total, false);
  $("dashboard-engagement").innerHTML = bars(d.by_engagement || {}, cards.total, true);

  const a = d.analytics || {};
  const stageKeys = Object.keys(d.stages || {});
  $("dashboard-funnel").innerHTML = (a.funnel || []).map(f =>
    `<div class="analytics-row"><span>${esc(f.label)}</span><div class="bar-track"><div class="bar-fill alt" style="width:${f.pct_total}%"></div></div><b>${f.count} · ${f.pct_total}%</b></div>`).join("");

  const trend = Object.entries(a.created_by_day || {}).sort();
  const maxTrend = Math.max(1, ...trend.map(x => x[1]));
  $("dashboard-created-trend").innerHTML = trend.length
    ? trend.map(([day, n], i) => `<div class="trend-bar" title="${esc(day)}: ${n}"><b>${n || ""}</b><i style="height:${Math.max(2, Math.round(n / maxTrend * 80))}%"></i>${trend.length <= 16 || i % 5 === 0 ? `<small>${day.slice(8)}/${day.slice(5, 7)}</small>` : "<small>&nbsp;</small>"}</div>`).join("")
    : '<p class="muted">Tiada data trend dalam tempoh ini.</p>';

  const matrix = a.by_source_stage || {};
  const maxCell = Math.max(1, ...Object.values(matrix).flatMap(v => Object.values(v)));
  $("dashboard-source-stage").innerHTML = `<table><thead><tr><th>Punca</th>${stageKeys.map(s => `<th>${esc(d.stages[s].label)}</th>`).join("")}</tr></thead><tbody>${
    Object.entries(matrix).map(([src, vals]) => `<tr><th>${esc(label(src))}</th>${stageKeys.map(s => { const v = vals[s] || 0; return `<td class="${v === 0 ? "zero" : v >= maxCell * .6 ? "hot" : ""}">${v}</td>`; }).join("")}</tr>`).join("")}</tbody></table>`;

  const sourceSel = $("dash-source"), stageSel = $("dash-stage"), engSel = $("dash-engagement");
  if (sourceSel.options.length === 1) SOURCES.forEach(k => sourceSel.add(new Option(label(k), k)));
  if (stageSel.options.length === 1) stageKeys.forEach(k => stageSel.add(new Option(d.stages[k].label, k)));
  if (engSel.options.length === 1) ENGAGEMENT.forEach(k => engSel.add(new Option(label(k), k)));

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
      <div class="kanban-head"><b><span class="tag stage-${k}">${esc(col.label)}</span></b><span>${total}</span></div>
      ${slice.length ? slice.map(l => `<article class="kanban-lead" draggable="true" data-lead-id="${l.id}" ondragstart="dashboardDragStart(event,${l.id})" ondragend="dashboardDragEnd(event)" onclick="openDrawer(${l.id})">
          <b>${esc(l.name)}</b>
          <small style="color:var(--teal);font-weight:600">${esc(l.treatment || l.program_interest || "Konsultasi Umum")}</small>
          ${l.allergies && l.allergies !== "Tiada" ? `<span class="allergy-tag">⚠ Alahan: ${esc(l.allergies)}</span>` : ""}
          <small class="muted">${esc(label(l.source))} · Panel: ${esc(l.panel || "Sendiri")}</small>
          <select onclick="event.stopPropagation()" onchange="setDashboardStage(${l.id},this.value)">${stageKeys.map(s => `<option value="${s}" ${s === l.stage ? "selected" : ""}>${esc(d.stages[s].label)}</option>`).join("")}</select>
        </article>`).join("") : `<p class="muted">Tiada pesakit</p>`}${pager}</section>`;
  }).join("");

  const groups = [["today", "Temujanji Hari Ini"], ["overdue", "Perlu Susulan (H+3)"], ["upcoming", "Akan Datang"]];
  $("followup-queue").innerHTML = groups.map(([key, lbl]) => `<div class="followup-group ${key}"><h4>${lbl} <span>${d.followups[key]?.length || 0}</span></h4>${
    (d.followups[key] || []).slice(0, 8).map(f => `<div class="followup-row" onclick="openDrawer(${f.lead_id})"><b>${esc(f.name)}</b><small>${fmtDate(f.scheduled_at)} · ${esc(f.notes || "")}</small></div>`).join("") || `<p class="muted">Tiada temujanji</p>`}</div>`).join("");

  $("nav-leads-count").textContent = cards.total;
}

function resetDashboardFilters() { ["dash-search", "dash-source", "dash-stage", "dash-engagement"].forEach(id => $(id).value = ""); kanbanResetAll(); renderDashboard(); }
async function setDashboardStage(id, stage) { try { await api(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify({ stage }) }); toast("Status pesakit dikemaskini"); await loadOverview(); } catch (e) { fail(e); } }
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

// ================= CALENDAR ENGINE (NEW) =================
let calCurrentYear = 2026;
let calCurrentMonth = 8; // 0-indexed (8 = Sept)
let calSelectedDateStr = "2026-09-10";
let calendarAppointments = [];

async function loadCalendar() {
  try {
    const res = await api("/api/calendar/appointments");
    calendarAppointments = res.appointments || [];
    $("nav-cal-count").textContent = calendarAppointments.length || "";
    renderCalendar();
  } catch (e) { fail(e); }
}

function changeCalMonth(delta) {
  calCurrentMonth += delta;
  if (calCurrentMonth > 11) { calCurrentMonth = 0; calCurrentYear++; }
  if (calCurrentMonth < 0) { calCurrentMonth = 11; calCurrentYear--; }
  renderCalendar();
}

function renderCalendar() {
  const monthNames = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
  $("cal-month-title").textContent = `${monthNames[calCurrentMonth]} ${calCurrentYear}`;

  const docFilter = $("cal-doc-filter") ? $("cal-doc-filter").value : "all";
  const filtered = calendarAppointments.filter(a => docFilter === "all" || a.doctor.includes(docFilter));

  // Render Month Grid
  const firstDay = new Date(calCurrentYear, calCurrentMonth, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(calCurrentYear, calCurrentMonth + 1, 0).getDate();

  let html = `<div class="cal-day-header">Ahd</div><div class="cal-day-header">Isn</div><div class="cal-day-header">Sel</div><div class="cal-day-header">Rab</div><div class="cal-day-header">Kha</div><div class="cal-day-header">Jum</div><div class="cal-day-header">Sab</div>`;

  for (let i = 0; i < firstDay; i++) {
    html += `<div class="cal-cell empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calCurrentYear}-${String(calCurrentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayAppts = filtered.filter(a => {
      const d = new Date(a.scheduled_at * 1000);
      return d.getFullYear() === calCurrentYear && d.getMonth() === calCurrentMonth && d.getDate() === day;
    });

    const isSelected = dateStr === calSelectedDateStr;
    const isToday = day === 10 && calCurrentMonth === 8 && calCurrentYear === 2026;

    html += `<div class="cal-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}" onclick="selectCalDate('${dateStr}')">
      <span class="cal-date-num">${day}</span>
      ${dayAppts.length ? `<span class="cal-dot-count">${dayAppts.length} slot</span>` : ''}
    </div>`;
  }

  $("cal-month-grid").innerHTML = html;
  renderSelectedDaySlots(filtered);
}

function selectCalDate(dateStr) {
  calSelectedDateStr = dateStr;
  renderCalendar();
}

function renderSelectedDaySlots(filtered) {
  const [y, m, d] = calSelectedDateStr.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  $("cal-day-title").textContent = dateObj.toLocaleDateString("ms-MY", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const dayAppts = (filtered || calendarAppointments).filter(a => {
    const ad = new Date(a.scheduled_at * 1000);
    return ad.getFullYear() === y && ad.getMonth() === (m - 1) && ad.getDate() === d;
  }).sort((a, b) => a.scheduled_at - b.scheduled_at);

  $("cal-day-count").textContent = `${dayAppts.length} temujanji`;

  if (!dayAppts.length) {
    $("cal-slot-list").innerHTML = `<div class="cal-empty-state"><p class="muted">Tiada temujanji dijadualkan pada tarikh ini.</p><button class="btn primary small" onclick="openNewApptModal('${calSelectedDateStr}')">＋ Tempah Slot Hari Ini</button></div>`;
    return;
  }

  $("cal-slot-list").innerHTML = dayAppts.map(a => {
    const timeStr = new Date(a.scheduled_at * 1000).toLocaleTimeString("en-MY", { hour: '2-digit', minute: '2-digit' });
    return `<div class="cal-slot-item status-${a.status}" onclick="openDrawer(${a.patient_id})">
      <div class="slot-time"><b>${timeStr}</b><small>${esc(a.doctor.split(' ')[0] + ' ' + a.doctor.split(' ')[1])}</small></div>
      <div class="slot-info">
        <b>${esc(a.patient_name)}</b>
        <span>${esc(a.treatment)}</span>
        <small class="muted">${esc(a.notes || a.phone)}</small>
      </div>
      <div class="slot-action">
        <span class="status-pill status-${a.status}">${esc(a.status)}</span>
      </div>
    </div>`;
  }).join("");
}

function openNewApptModal(defaultDate = null) {
  const dateStr = defaultDate || calSelectedDateStr;
  const pName = prompt("Nama Pesakit:", "");
  if (!pName) return;
  const pPhone = prompt("No Telefon (WhatsApp):", "012-");
  const pDoc = prompt("Doktor Bertugas (Dr. Amina / Dr. Farid / Dr. Sarah):", "Dr. Amina binti Zulkifli");
  const pTreatment = prompt("Rawatan / Aduan:", "Demam & Selesema");

  api("/api/calendar/book", {
    method: "POST",
    body: JSON.stringify({
      patient_name: pName,
      phone: pPhone,
      doctor: pDoc,
      treatment: pTreatment,
      scheduled_at: Math.floor(new Date(`${dateStr}T10:00:00`).getTime() / 1000)
    })
  }).then(() => {
    toast(`Temujanji ${pName} berjaya didaftarkan`);
    loadCalendar();
  }).catch(fail);
}

// ================= LEADS (PATIENTS DIRECTORY) =================
async function loadLeads() {
  const params = new URLSearchParams();
  if ($("f-search").value) params.set("search", $("f-search").value);
  if ($("f-source").value) params.set("source", $("f-source").value);
  if ($("f-stage").value) params.set("stage", $("f-stage").value);
  if ($("f-engagement").value) params.set("engagement", $("f-engagement").value);
  if ($("f-overdue").checked) params.set("overdue_followup", "true");

  const leads = await api(`/api/leads?${params}`);
  const now = Date.now() / 1000;
  $("leads-count").textContent = `${leads.length} pesakit`;
  $("leads-empty").classList.toggle(HIDDEN, leads.length > 0);

  document.querySelector("#leads-table tbody").innerHTML = leads.map(l => `
    <tr onclick="openDrawer(${l.id})">
      <td>
        <div class="person">
          <span class="avatar">${initials(l.name)}</span>
          <div>
            <b>${esc(l.name)}</b>
            <span class="sub mono">${esc(l.ic ? `IC: ${l.ic}` : (l.phone || ""))}</span>
          </div>
        </div>
      </td>
      <td><span class="tag src-${l.source}">${esc(label(l.source))}</span></td>
      <td><span class="tag stage-${l.stage}">${esc(label(l.stage))}</span></td>
      <td><span class="tag eng-${l.engagement}">${esc(label(l.engagement))}</span></td>
      <td>
        <b>${esc(l.treatment || l.program_interest || "—")}</b>
        ${l.allergies && l.allergies !== "Tiada" ? `<div class="allergy-tag">⚠ ${esc(l.allergies)}</div>` : ""}
      </td>
      <td class="${l.next_followup_at && l.next_followup_at < now ? "overdue" : ""}">
        ${l.next_followup_at ? `${fmtRel(l.next_followup_at)}<span class="sub">${fmtDate(l.next_followup_at)}</span>` : "—"}
      </td>
      <td class="muted">${fmtRel(l.updated_at)}</td>
    </tr>`).join("");
}

// ================= ADD PATIENT MANUAL =================
async function addPatientManual() {
  const name = $("a-name").value.trim();
  const phone = $("a-phone").value.trim();
  if (!name || !phone) {
    setMsg("add-msg", "Nama dan No. Telefon pesakit wajib diisi", true);
    return;
  }

  const payload = {
    name,
    ic: $("a-ic").value.trim() || null,
    phone,
    treatment: $("a-treatment").value,
    program_interest: $("a-treatment").value,
    allergies: $("a-allergies").value.trim() || "Tiada",
    panel: $("a-panel").value,
    notes: $("a-notes").value.trim() || null,
    source: "walkin"
  };

  try {
    const r = await api("/api/leads", { method: "POST", body: JSON.stringify(payload) });
    setMsg("add-msg", `✓ Pesakit #${r.id} didaftarkan ke giliran.`);
    toast(`Pesakit #${r.id} (${name}) didaftarkan`);
    ["a-name", "a-ic", "a-phone", "a-allergies", "a-notes"].forEach(i => $(i).value = "");
    setTimeout(() => showTab("leads"), 600);
  } catch (e) { setMsg("add-msg", e.message, true); }
}

// ================= PATIENT CLINICAL DRAWER =================
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
  $("drawer-content").innerHTML = `
    <div class="drawer-head">
      <button class="back-btn" onclick="closeDrawer()">← KEMBALI</button>
      <button class="btn ghost small" onclick="closeDrawer()">✕</button>
    </div>
    <div class="drawer-meta">
      <span class="tag src-${l.source}">${esc(label(l.source))}</span>
      <span class="tag stage-${l.stage}">${esc(label(l.stage))}</span>
      <span class="hint mono">ID: #${l.id}</span>
    </div>
    <h2 class="drawer-title">${esc(l.name)}</h2>

    ${l.allergies && l.allergies !== "Tiada" ? `
      <div class="alert-box-danger">
        <b>🚨 AMARAN ALAHAN PESAKIT:</b> ${esc(l.allergies)}
      </div>` : ""}

    <table class="detail-table"><tbody>
      <tr><th>No. K/P</th><td class="mono">${esc(l.ic || "—")}</td></tr>
      <tr><th>Telefon</th><td>${l.phone ? `${esc(l.phone)} <a class="wa-btn" style="margin-left:8px;padding:3px 10px;font-size:11.5px" href="https://wa.me/${l.phone.replace(/[^0-9]/g, "")}" target="_blank" rel="noopener">💬 WhatsApp</a>` : "—"}</td></tr>
      <tr><th>Aduan / Rawatan</th><td><b>${esc(l.treatment || l.program_interest || "—")}</b></td></tr>
      <tr><th>Panel Insurans</th><td>${esc(l.panel || "Sendiri")}</td></tr>
      <tr><th>Doktor Bertugas</th><td>${esc(l.assigned_to || "Dr. Amina binti Zulkifli")}</td></tr>
    </tbody></table>

    <h3>Status Rawatan (Pipeline)</h3>
    <div class="stepper">${STAGES.map((st, i) => `<div class="step ${i <= stageIdx ? "active" : ""} ${st === l.stage ? "current" : ""}" onclick="setStage('${st}')" title="Tukar status: ${label(st)}">${label(st)}</div>`).join("")}</div>

    <h3>Tindakan Pantas WhatsApp (Clinical Assistant)</h3>
    <div class="row wrap" style="gap:8px;margin-top:8px">
      <button class="btn small primary" onclick="sendWhatsAppTemplate('reminder')">⏰ Hantar Peringatan Temujanji</button>
      <button class="btn small" onclick="sendWhatsAppTemplate('recall')">🩺 Hantar Semakan H+3 (Demam)</button>
      <button class="btn small ghost" onclick="sendWhatsAppTemplate('review')">⭐ Minta Google Review (5-Star)</button>
    </div>

    <h3>Dokumen &amp; Rekod Panel</h3>
    <table class="mini-table"><tbody>${(currentLead.documents || []).map(d => `
      <tr>
        <td>${esc(label(d.doc_type))}</td>
        <td><span class="tag doc-${d.status}">${d.status}</span></td>
        <td class="muted">${esc(d.notes || "")}</td>
      </tr>`).join("")}
    </tbody></table>

    <h3>Aktiviti &amp; Sejarah Rawatan</h3>
    <div class="activity">${(currentLead.activity || []).map(a => `<div class="act-row"><span class="muted">${fmtDate(a.ts)} · ${esc(a.actor)}</span><b>${esc(a.action)}</b> ${esc(a.detail || "")}</div>`).join("")}</div>`;
}

function sendWhatsAppTemplate(type) {
  if (!currentLead || !currentLead.lead) return;
  const l = currentLead.lead;
  let msg = "";
  if (type === "reminder") {
    msg = `Salam ${l.name}, peringatan temujanji anda di Poliklinik Famili pada ${fmtDate(l.next_followup_at || Date.now()/1000 + 86400)}. Sila reply [1] untuk Sahkan atau [2] untuk Tukar Waktu. Terima kasih!`;
  } else if (type === "recall") {
    msg = `Salam ${l.name} dari Poliklinik Famili. Macam mana keadaan ${l.treatment || 'kesihatan'} hari ni, ada semakin beransur pulih? Jangan lupa habiskan ubat mengikut arahan doktor ya.`;
  } else if (type === "review") {
    msg = `Salam ${l.name}, terima kasih kerana mendapatkan rawatan di Poliklinik Famili. Sudikah luangkan 30 saat untuk kongsikan pengalaman anda di Google Maps? Link: https://g.page/r/poliklinik-famili/review ⭐`;
  }

  toast(`WhatsApp '${type}' dihantar ke ${l.name}`);
  window.open(`https://wa.me/${l.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
}

async function refreshLead() { await openDrawer(currentLead.lead.id); if (!$("tab-overview").classList.contains(HIDDEN)) loadOverview().catch(() => {}); if (!$("tab-leads").classList.contains(HIDDEN)) loadLeads().catch(() => {}); }
async function setStage(stage) { try { const r = await api(`/api/leads/${currentLead.lead.id}`, { method: "PATCH", body: JSON.stringify({ stage }) }); toast(`Status → ${label(stage)}`); await refreshLead(); } catch (e) { fail(e); } }
async function setEngagement(eng) { try { await api(`/api/leads/${currentLead.lead.id}`, { method: "PATCH", body: JSON.stringify({ engagement: eng }) }); await refreshLead(); } catch (e) { fail(e); } }

// ================= INBOX =================
let inboxChats = [], inboxCurrent = null;
async function loadInboxChats() {
  try {
    const d = await api("/api/alisya/inbox");
    inboxChats = d.chats || [];
    $("nav-inbox-count").textContent = inboxChats.reduce((n, c) => n + (c.unread || 0), 0) || "";
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
      <div class="meta"><span>${c.last ? fmtRel(c.last.ts) : ""}</span>${c.unread ? `<span class="unread">${c.unread}</span>` : ""}</div>
    </div>`).join("") || '<p class="hint" style="padding:12px">Tiada perbualan.</p>';
}

async function loadInboxMsgs(cid) {
  inboxCurrent = cid;
  renderInboxList();
  try {
    const d = await api(`/api/alisya/inbox/${encodeURIComponent(cid)}`);
    const c = d.chat;
    $("ib-thread-head").innerHTML = `<span class="avatar">${initials(c.name)}</span><div><b>${esc(c.name)}</b><small>${esc(c.id)} · ${esc(c.session)}</small></div>`;
    $("ib-msgs").innerHTML = (d.messages || []).map(m => `
      <div class="bubble ${m.from_me ? "me" : ""}"><div class="who">${m.from_me ? (m.by === "alisya" ? "Alisya AI" : "Staff Kaunter") : esc(c.name)}</div>${esc(m.body).replace(/\n/g, "<br>")}<time>${new Date(m.ts * 1000).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}</time></div>`
    ).join("") || '<p class="hint">Tiada mesej.</p>';
    $("ib-msgs").scrollTop = $("ib-msgs").scrollHeight;
    $("ib-ctx").innerHTML = `<p class="hint">${esc(c.notes || "Tiada nota pesakit.")}</p>`;
  } catch (e) { fail(e); }
}

async function sendInboxReply() {
  const text = $("ib-reply").value.trim(); if (!text || !inboxCurrent) return;
  $("ib-reply").value = "";
  toast("Mesej dihantar ke pesakit");
}
function toggleBotPause() { toast("Alisya AI status dikemaskini"); }

// ================= DEVICES & SETTINGS =================
async function listDevices() {
  try {
    const d = await api("/api/alisya/devices");
    $("device-list").innerHTML = (d.devices || []).map(x => `
      <div class="card device-card">
        <div class="card-head"><h3>${esc(x.display_name)}</h3><span class="status-pill status-${x.status.toLowerCase()}">${esc(x.status)}</span></div>
        <p class="hint">WhatsApp: ${esc(x.phone || "—")} (Session: <span class="mono">${esc(x.session)}</span>)</p>
      </div>`).join("");
  } catch (e) { fail(e); }
}

let currentSub = "persona";
function showSub(name) {
  currentSub = name;
  document.querySelectorAll("#settings-subnav button").forEach(b => b.classList.toggle("current", b.dataset.sub === name));
  document.querySelectorAll(".subpanel").forEach(p => p.classList.add(HIDDEN));
  const el = $(`sub-${name}`);
  if (el) el.classList.remove(HIDDEN);
}

function contactPricing(plan) {
  const msg = encodeURIComponent(`Salam, saya berminat nak tahu lebih lanjut tentang Pakej ${plan} Klinik CRM.`);
  toast(`${plan} — membuka WhatsApp…`);
  window.open(`https://wa.me/60174337675?text=${msg}`, '_blank', 'noopener');
}

function fillSelects() {
  STAGES.forEach(st => $("f-stage")?.add(new Option(label(st), st)));
  ENGAGEMENT.forEach(e => $("f-engagement")?.add(new Option(label(e), e)));
}

// ================= FAST QUEUE & QR STANDEE =================
let queueNowServing = { num: "A-101", name: "Farah binti Yusof" };
let queueNextPatient = { num: "A-102", name: "Tan Wei Lun" };

async function quickAddQueue() {
  const name = $("fq-name").value.trim();
  const phone = $("fq-phone").value.trim();
  const treatment = $("fq-treatment").value;

  if (!name || !phone) {
    toast("⚠ Sila masukkan nama dan nombor telefon pesakit.");
    return;
  }

  const payload = {
    name,
    phone,
    treatment,
    program_interest: treatment,
    source: "walkin",
    stage: "appointment",
    allergies: "Tiada",
    panel: "Sendiri"
  };

  try {
    const r = await api("/api/leads", { method: "POST", body: JSON.stringify(payload) });
    const qNum = "A-" + (100 + (r.id % 900));
    toast(`⚡ ${name} didaftarkan! No. Giliran: ${qNum}. WhatsApp dihantar.`);
    $("fq-name").value = "";
    $("fq-phone").value = "";
    queueNextPatient = { num: qNum, name };
    updateQueueDisplay();
    loadOverview();
  } catch (e) { fail(e); }
}

function updateQueueDisplay() {
  if ($("qcb-now-serving")) $("qcb-now-serving").textContent = `${queueNowServing.num} (${queueNowServing.name})`;
  if ($("qcb-next-patient")) $("qcb-next-patient").textContent = `${queueNextPatient.num} (${queueNextPatient.name})`;
}

function callNextPatient() {
  queueNowServing = { ...queueNextPatient };
  const nextNum = "A-" + (parseInt(queueNowServing.num.split("-")[1]) + 1);
  queueNextPatient = { num: nextNum, name: "Pesakit Giliran Seterusnya" };
  updateQueueDisplay();
  toast(`🔔 Giliran ${queueNowServing.num} (${queueNowServing.name}) dipanggil! Auto-WhatsApp alert dihantar.`);
}

function skipCurrentPatient() {
  toast(`⏸ ${queueNowServing.name} di-hold. Pesakit seterusnya dipanggil.`);
  callNextPatient();
}

function openQrStandeeModal() {
  $("standee-backdrop")?.classList.remove(HIDDEN);
  $("standee-modal")?.classList.remove(HIDDEN);
  renderStandeeQr();
}

function closeQrStandeeModal() {
  $("standee-backdrop")?.classList.add(HIDDEN);
  $("standee-modal")?.classList.add(HIDDEN);
}

function renderStandeeQr() {
  const box = $("standee-qr-render");
  if (!box) return;
  // Generate high-res fake QR SVG
  box.innerHTML = `<svg viewBox="0 0 100 100" width="140" height="140" fill="var(--teal)">
    <rect x="5" y="5" width="25" height="25" fill="none" stroke="var(--teal)" stroke-width="6"/>
    <rect x="11" y="11" width="13" height="13"/>
    <rect x="70" y="5" width="25" height="25" fill="none" stroke="var(--teal)" stroke-width="6"/>
    <rect x="76" y="11" width="13" height="13"/>
    <rect x="5" y="70" width="25" height="25" fill="none" stroke="var(--teal)" stroke-width="6"/>
    <rect x="11" y="76" width="13" height="13"/>
    <rect x="38" y="10" width="6" height="20"/>
    <rect x="48" y="10" width="12" height="6"/>
    <rect x="38" y="40" width="24" height="24"/>
    <rect x="10" y="38" width="20" height="6"/>
    <rect x="70" y="38" width="20" height="14"/>
    <rect x="38" y="72" width="12" height="18"/>
    <rect x="58" y="72" width="32" height="6"/>
    <rect x="70" y="84" width="20" height="10"/>
  </svg>`;
}

function simulatePatientScan() {
  closeQrStandeeModal();
  toast("📲 Simulasi: Pesakit scan QR kaunter → Alisya balas auto-tiket giliran!");
  const pName = "En. Haziq (Scan QR)";
  const qNum = "A-" + (between(110, 199));
  api("/api/leads", {
    method: "POST",
    body: JSON.stringify({
      name: pName,
      phone: "019-8877665",
      treatment: "Demam & Sakit Tekak (Self Check-In)",
      source: "whatsapp",
      stage: "appointment",
      allergies: "Tiada",
      panel: "Sendiri"
    })
  }).then(() => {
    queueNextPatient = { num: qNum, name: pName };
    updateQueueDisplay();
    loadOverview();
  });
}

function startApp() {
  fillSelects();
  const h = location.hash.slice(1);
  if (h && $(`tab-${h}`)) showTab(h); else loadOverview().catch(fail);
  listDevices();
  loadCalendar();
}

async function init() {
  try {
    await api("/api/health");
    $("login").classList.add(HIDDEN); $("app").classList.remove(HIDDEN);
    const tb = document.getElementById('mobile-topbar');
    if (tb) tb.classList.remove(HIDDEN);
    startApp();
  } catch { showLogin(); }
}
init();
