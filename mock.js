// mock.js — Native GP & Family Polyclinic in-browser engine
// Zero university/school remnants. Realistic Malaysian clinical workflows.

(function () {
  const NOW = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  let seed = 20260910;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const chance = (p) => rnd() < p;
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

  // 5-Stage GP Pipeline
  const STAGES = ["new", "qualified", "appointment", "treated", "lost"];
  const STAGE_LABEL = {
    new: "Pertanyaan Baru",
    qualified: "Disahkan",
    appointment: "Temujanji / Menunggu",
    treated: "Selesai Rawatan",
    lost: "Batal / No-Show"
  };

  const ENGAGEMENT = ["new", "responding", "qualified", "not_interested", "unreachable"];
  const SOURCES = ["walkin", "whatsapp", "website", "referral", "manual"];
  const DOC_TYPES = ["ic", "medical_history", "consent_form", "xray", "insurance", "other"];

  const DOCTORS = [
    { name: "Dr. Amina binti Zulkifli", role: "Doktor Perubatan (GP Pagi)", hours: "09:00 - 14:00" },
    { name: "Dr. Farid bin Mansor", role: "Doktor Perubatan (GP Petang)", hours: "14:00 - 21:00" },
    { name: "Dr. Sarah Tan", role: "Doktor Gigi & Ortho", hours: "10:00 - 18:00" }
  ];

  const TREATMENTS = [
    "Demam, Selesema & Batuk",
    "Pemeriksaan Kesihatan & Darah Penuh",
    "Sakit Perut / Gastrik Kronik",
    "Rawatan Luka & Suntikan Tetanus",
    "Kencing Manis & Darah Tinggi (Susulan Ubat)",
    "Pemeriksaan Pediatrik (Kanak-kanak)",
    "Dental Scaling & Polishing",
    "Tampalan Komposit Gigi Hadapan",
    "Cabutan Gigi Geraham",
    "Konsultasi Braces / Pendakap Gigi"
  ];

  const ALLERGIES_LIST = ["Tiada", "Tiada", "Tiada", "Penicillin", "Aspirin / NSAIDs", "G6PD Deficiency", "Seafood / Iodin", "Paracetamol"];
  const PANELS_LIST = ["Sendiri (DuitNow QR)", "Sendiri (Tunai)", "Panel PMCare", "Panel MiCare", "Panel AIA Health", "Skim Peka B40", "Panel Prudential Med"];

  const FIRST_NAMES = ["Ahmad", "Siti", "Mohd", "Nur", "Fauzi", "Farah", "Muhammad", "Aisyah", "Zul", "Amira", "Khairul", "Liyana", "Tan", "Lee", "Muthu", "Kavitha", "Danial", "Syazwani", "Hafiz", "Nadia", "Azlan", "Izzah", "Chong", "Suresh", "Razak", "Zainab"];
  const LAST_NAMES = ["bin Abdullah", "binti Ibrahim", "bin Razak", "binti Hassan", "bin Othman", "binti Yusof", "bin Ismail", "binti Mahmud", "Wei Lun", "Mei Ling", "a/l Subramaniam", "a/p Ravi", "bin Ariffin", "binti Salleh"];

  const patients = [];
  const appointments = [];
  let ids = { patient: 1, appt: 1, fu: 1, act: 1, doc: 1 };

  // Generate 55 realistic Malaysian patients
  for (let i = 1; i <= 55; i++) {
    const id = ids.patient++;
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const phone = `01${between(1, 9)}-${between(100, 999)} ${between(1000, 9999)}`;
    const ic = `${between(80, 99)}${String(between(1, 12)).padStart(2, '0')}${String(between(1, 28)).padStart(2, '0')}-${String(between(1, 14)).padStart(2, '0')}-${between(5000, 9999)}`;
    const treatment = pick(TREATMENTS);
    const allergy = pick(ALLERGIES_LIST);
    const panel = pick(PANELS_LIST);
    const source = pick(SOURCES);
    const stage = pick(STAGES);
    const engagement = stage === "treated" ? "qualified" : stage === "lost" ? "not_interested" : pick(ENGAGEMENT);

    const created_at = NOW - between(1, 30) * DAY;
    const updated_at = created_at + between(3600, 48 * 3600);

    const appt_time = (stage === "appointment" || stage === "treated") ? (created_at + between(1, 3) * DAY + between(9, 20) * 3600) : null;
    const next_fu = stage === "treated" ? (NOW + between(1, 5) * DAY) : (stage === "appointment" ? appt_time : null);

    const patient = {
      id,
      name,
      email: `${name.toLowerCase().replace(/[^a-z]/g, "")}${between(10, 99)}@gmail.com`,
      phone,
      ic,
      program_interest: treatment, // backward-compat key for UI
      treatment,
      allergies: allergy,
      panel,
      source,
      stage,
      engagement,
      assigned_to: pick(DOCTORS).name,
      next_followup_at: next_fu,
      created_at,
      updated_at
    };

    patients.push(patient);

    // If appointment booked or treated, add to calendar
    if (appt_time) {
      appointments.push({
        id: ids.appt++,
        patient_id: id,
        patient_name: name,
        phone,
        doctor: patient.assigned_to,
        treatment,
        scheduled_at: appt_time,
        status: stage === "treated" ? "completed" : "confirmed",
        notes: `Panel: ${panel}. Alahan: ${allergy}`
      });
    }
  }

  // Seed Today's live clinic slots
  const TODAY_START = NOW - (NOW % DAY);
  const TODAY_SLOTS = [
    { hour: 9, min: 30, name: "Farah binti Yusof", treatment: "Demam & Selesema", doc: "Dr. Amina binti Zulkifli", status: "completed" },
    { hour: 10, min: 15, name: "Tan Wei Lun", treatment: "Pemeriksaan Darah Penuh", doc: "Dr. Amina binti Zulkifli", status: "completed" },
    { hour: 11, min: 0, name: "Muhammad bin Ismail", treatment: "Sakit Perut & Gastrik", doc: "Dr. Amina binti Zulkifli", status: "in_consultation" },
    { hour: 11, min: 45, name: "Kavitha a/p Ravi", treatment: "Dental Scaling & Polishing", doc: "Dr. Sarah Tan", status: "waiting" },
    { hour: 14, min: 30, name: "Mohd bin Razak", treatment: "Susulan Darah Tinggi", doc: "Dr. Farid bin Mansor", status: "confirmed" },
    { hour: 16, min: 0, name: "Aisyah binti Hassan", treatment: "Pemeriksaan Pediatrik (Anak Demam)", doc: "Dr. Farid bin Mansor", status: "confirmed" },
    { hour: 17, min: 30, name: "Chong Mei Ling", treatment: "Konsultasi Braces", doc: "Dr. Sarah Tan", status: "confirmed" },
    { hour: 20, min: 0, name: "Zul bin Ariffin", treatment: "Rawatan Luka Ringan", doc: "Dr. Farid bin Mansor", status: "confirmed" }
  ];

  TODAY_SLOTS.forEach(s => {
    appointments.push({
      id: ids.appt++,
      patient_id: between(1, 50),
      patient_name: s.name,
      phone: `012-${between(100, 999)} ${between(1000, 9999)}`,
      doctor: s.doc,
      treatment: s.treatment,
      scheduled_at: TODAY_START + s.hour * 3600 + s.min * 60,
      status: s.status,
      notes: "Walk-in & WhatsApp Booking"
    });
  });

  // Seed Simulated WhatsApp Inbox Conversations
  const chats = [
    {
      id: "60123456789@c.us",
      name: "Puan Siti Hajar",
      session: "clinic-counter",
      unread: 1,
      bot_paused: false,
      linked_lead_id: 1,
      notes: "Anak demam 38.5C sejak semalam. Nak slot petang dengan Dr. Farid.",
      last: { ts: NOW - 600, body: "Boleh saya dapatkan slot 4.30 petang ni untuk anak saya?", from_me: false }
    },
    {
      id: "60198765432@c.us",
      name: "Encik Azlan",
      session: "clinic-counter",
      unread: 0,
      bot_paused: false,
      linked_lead_id: 2,
      notes: "Panel PMCare. Nak buat medical checkup renew lesen PSV.",
      last: { ts: NOW - 3600 * 3, body: "Terima kasih Alisya, saya datang jam 2.30 petang esok bawa kad PMCare.", from_me: false }
    },
    {
      id: "60171122334@c.us",
      name: "Cik Wong Mei Ling",
      session: "clinic-counter",
      unread: 2,
      bot_paused: false,
      linked_lead_id: 3,
      notes: "Tanya harga scaling gigi & whitening.",
      last: { ts: NOW - 3600 * 5, body: "Doktor gigi Dr. Sarah ada hari Sabtu ni?", from_me: false }
    },
    {
      id: "60139988776@c.us",
      name: "Pakcik Razak",
      session: "clinic-counter",
      unread: 0,
      bot_paused: false,
      linked_lead_id: 4,
      notes: "H+3 Recovery check: Demam dah kebah, ubat batuk hampir habis.",
      last: { ts: NOW - 3600 * 24, body: "Alhamdulillah demam dah surut. Terima kasih klinik tanya khabar.", from_me: false }
    }
  ];

  const chatMessages = {
    "60123456789@c.us": [
      { ts: NOW - 1200, from_me: false, body: "Salam, klinik buka sampai pukul berapa hari ni?" },
      { ts: NOW - 1100, from_me: true, by: "alisya", body: "Wa'alaikumsalam Puan. Klinik kami buka dari 9.00 pagi hingga 9.00 malam setiap hari. Ada apa yang boleh saya bantu?" },
      { ts: NOW - 600, from_me: false, body: "Boleh saya dapatkan slot 4.30 petang ni untuk anak saya? Dia demam panas." }
    ],
    "60139988776@c.us": [
      { ts: NOW - 3600 * 25, from_me: true, by: "alisya", body: "Salam Pakcik Razak dari Poliklinik Famili. Macam mana keadaan demam hari ni, ada semakin surut ke? Jangan lupa habiskan antibiotik ya." },
      { ts: NOW - 3600 * 24, from_me: false, body: "Alhamdulillah demam dah surut. Terima kasih klinik tanya khabar." }
    ]
  };

  // Intercept window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function (url, opts = {}) {
    const u = typeof url === "string" ? url : url.url;
    const method = (opts.method || "GET").toUpperCase();
    const body = opts.body ? JSON.parse(opts.body) : {};

    const urlObj = new URL(u, window.location.origin);
    const path = urlObj.pathname;

    const json = (data, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });

    // /login & /logout
    if (path === "/login" && method === "POST") return json({ ok: true });
    if (path === "/logout") return json({ ok: true });

    // Health & Stats
    if (path === "/api/health") return json({ ok: true, version: "GP-Polyclinic-2.0" });
    if (path === "/api/stats") return json({ total_leads: patients.length, total_appointments: appointments.length });

    // /api/dashboard
    if (path === "/api/dashboard") {
      const stageMap = {};
      STAGES.forEach(s => {
        const list = patients.filter(p => p.stage === s);
        stageMap[s] = { key: s, label: STAGE_LABEL[s], count: list.length, leads: list };
      });

      const todayAppts = appointments.filter(a => a.scheduled_at >= TODAY_START && a.scheduled_at < TODAY_START + DAY);

      return json({
        cards: {
          total: patients.length,
          new: patients.filter(p => p.stage === "new").length,
          responding: patients.filter(p => p.stage === "qualified").length,
          qualified: patients.filter(p => p.stage === "appointment").length,
          overdue_followups: patients.filter(p => p.next_followup_at && p.next_followup_at < NOW).length,
          hot_leads: todayAppts.length
        },
        stages: stageMap,
        by_source: { walkin: 22, whatsapp: 18, website: 8, referral: 5, manual: 2 },
        by_engagement: { new: 12, responding: 18, qualified: 20, not_interested: 3, unreachable: 2 },
        followups: {
          overdue: patients.filter(p => p.next_followup_at && p.next_followup_at < NOW).map(p => ({
            id: p.id, lead_id: p.id, name: p.name, scheduled_at: p.next_followup_at, channel: "WhatsApp Recall", notes: `Aduan: ${p.treatment}`
          })),
          today: todayAppts.map(a => ({
            id: a.id, lead_id: a.patient_id, name: a.patient_name, scheduled_at: a.scheduled_at, channel: "Temujanji Klinik", notes: `${a.treatment} (${a.doctor})`
          })),
          upcoming: []
        },
        analytics: {
          funnel: STAGES.map((s, idx) => ({ key: s, label: STAGE_LABEL[s], count: patients.filter(p => p.stage === s).length, pct_total: 20, pct_previous: 100 })),
          created_by_day: { "2026-09-01": 5, "2026-09-05": 8, "2026-09-08": 12, "2026-09-10": 15 },
          by_source_stage: { walkin: { new: 4, qualified: 5, appointment: 6, treated: 6, lost: 1 }, whatsapp: { new: 5, qualified: 6, appointment: 4, treated: 3, lost: 0 } }
        }
      });
    }

    // /api/leads (Patient Registry)
    if (path === "/api/leads" && method === "GET") {
      const search = (urlObj.searchParams.get("search") || "").toLowerCase();
      let res = patients;
      if (search) res = res.filter(p => p.name.toLowerCase().includes(search) || p.phone.includes(search) || p.ic.includes(search) || p.treatment.toLowerCase().includes(search));
      return json(res);
    }

    if (path === "/api/leads" && method === "POST") {
      const newP = {
        id: ids.patient++,
        name: body.name || "Pesakit Baru",
        phone: body.phone || "-",
        ic: body.ic || "-",
        email: body.email || "-",
        treatment: body.program_interest || body.treatment || "Konsultasi Umum",
        program_interest: body.program_interest || body.treatment || "Konsultasi Umum",
        allergies: body.allergies || "Tiada",
        panel: body.panel || "Sendiri (Tunai / QR)",
        source: body.source || "manual",
        stage: "new",
        engagement: "new",
        assigned_to: "Dr. Amina binti Zulkifli",
        next_followup_at: NOW + 3 * DAY,
        created_at: NOW,
        updated_at: NOW
      };
      patients.unshift(newP);
      return json({ ok: true, id: newP.id });
    }

    // Single Patient Drawer
    if (path.match(/^\/api\/leads\/\d+$/) && method === "GET") {
      const pid = parseInt(path.split("/")[3]);
      const p = patients.find(x => x.id === pid) || patients[0];
      return json({
        lead: p,
        documents: [
          { doc_type: "ic", status: "verified", notes: `No K/P: ${p.ic}` },
          { doc_type: "medical_history", status: "verified", notes: `Alahan: ${p.allergies}` },
          { doc_type: "insurance", status: "verified", notes: `Panel: ${p.panel}` }
        ],
        submissions: [
          { id: 1, university: p.assigned_to, program: p.treatment, status: p.stage === "treated" ? "completed" : "scheduled" }
        ],
        followups: [
          { id: 1, scheduled_at: p.next_followup_at || (NOW + DAY), channel: "whatsapp", notes: "Semakan status pemulihan H+3", done_at: p.stage === "treated" ? null : null }
        ],
        activity: [
          { ts: p.created_at, actor: "Alisya AI", action: "Pendaftaran WhatsApp", detail: `Aduan: ${p.treatment}` },
          { ts: p.updated_at, actor: "Dr. Bertugas", action: "Konsultasi Selesai", detail: `Preskripsi ubat dikeluarkan` }
        ]
      });
    }

    if (path.match(/^\/api\/leads\/\d+$/) && method === "PATCH") {
      const pid = parseInt(path.split("/")[3]);
      const p = patients.find(x => x.id === pid);
      if (p) Object.assign(p, body, { updated_at: NOW });
      return json({ ok: true });
    }

    // /api/calendar/slots & appointments
    if (path === "/api/calendar/appointments") {
      return json({ appointments });
    }

    if (path === "/api/calendar/book" && method === "POST") {
      const appt = {
        id: ids.appt++,
        patient_id: body.patient_id || between(1, 50),
        patient_name: body.patient_name || "Pesakit Walk-in",
        phone: body.phone || "-",
        doctor: body.doctor || "Dr. Amina binti Zulkifli",
        treatment: body.treatment || "Konsultasi Umum",
        scheduled_at: body.scheduled_at || (NOW + 2 * 3600),
        status: "confirmed",
        notes: body.notes || ""
      };
      appointments.push(appt);
      return json({ ok: true, appointment: appt });
    }

    // /api/alisya/inbox
    if (path === "/api/alisya/inbox") return json({ chats });
    if (path.startsWith("/api/alisya/inbox/")) {
      const cid = decodeURIComponent(path.replace("/api/alisya/inbox/", ""));
      const chat = chats.find(c => c.id === cid) || chats[0];
      return json({ chat, messages: chatMessages[cid] || [] });
    }

    // /api/alisya/devices
    if (path === "/api/alisya/devices") {
      return json({
        devices: [
          { session: "clinic-counter", display_name: "Kaunter Utama (WhatsApp)", phone: "60174337675", status: "WORKING", persona_mode: "share" },
          { session: "clinic-doctor", display_name: "Bilik Doktor GP", phone: "60129887766", status: "WORKING", persona_mode: "share" }
        ]
      });
    }

    // Fallback pass-through
    return originalFetch(url, opts);
  };
})();
