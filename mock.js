// mock.js — in-browser stand-in for Klinik CRM (GP & Dental).
// Intercepts window.fetch for /login, /logout and /api/* and answers from an in-memory DB.
// Route shapes match the real server; nothing here leaves the browser.

(function () {
  const NOW = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  // deterministic PRNG so the demo looks the same on every reload
  let seed = 20260910;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const chance = (p) => rnd() < p;
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

  const STAGES = ["new", "qualified", "appointment", "treated", "lost"];
  const STAGE_LABEL = { new: "New", qualified: "Qualified", appointment: "Appointment", treated: "Treated", lost: "Lost" };
  const ENGAGEMENT = ["new", "responding", "qualified", "not_interested", "unreachable"];
  const SOURCES = ["manual", "website", "whatsapp", "walkin", "referral", "google"];
  const DOC_TYPES = ["ic", "medical_history", "consent_form", "xray", "insurance", "other"];

  const FIRST = ["Aisyah", "Farhan", "Nadia", "Rizky", "Putri", "Adit", "Salsabila", "Fikri", "Dewi", "Bagas", "Khairul", "Intan", "Reza", "Zahra", "Hafiz", "Alya", "Dimas", "Nabila", "Yusuf", "Tiara", "Irfan", "Syifa", "Gilang", "Amira", "Raihan", "Kirana", "Fauzan", "Laila", "Arif", "Maya", "Naufal", "Hana", "Ilham", "Safira", "Rafi", "Nurul", "Bayu", "Citra", "Haikal", "Fatimah", "Andi", "Melati", "Ridwan", "Azzahra", "Iqbal", "Sekar", "Zaki", "Anisa", "Daffa", "Rania", "Faris", "Adinda", "Taufik", "Wulan", "Hakim", "Nisa"];
  const LAST = ["Pratama", "Putra", "Ramadhan", "Saputra", "Wijaya", "Hidayat", "Kusuma", "Nugroho", "Setiawan", "Maulana", "Santoso", "Firmansyah", "Rahmawati", "Anggraini", "Lestari", "Utami", "Permata", "Hakim", "Siregar", "Nasution", "Hasibuan", "Pane", "Lubis", "Harahap", "Wibowo", "Prasetyo", "Halim", "Gunawan"];
  const PROGRAMS = [
    "GP Consultation — General", "Dental Scaling — Cleaning", "Tooth Filling — Composite",
    "Tooth Extraction — Dental", "Braces Consultation — Ortho", "Whitening — Dental",
    "Child Checkup — GP", "ECG / Blood Test — GP", "Fever & Flu — GP",
    "Crown & Bridge — Dental", "Root Canal — Dental", "Health Screening — GP"
  ];
  const UNIS = ["Klinik Central", "Klinik DentalCare", "Poliklinik Sejahtera", "GP Panel A", "Dental Panel B"];
  const CHANNELS = ["whatsapp", "call", "email", "meeting"];

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const title = (s) => s.replace(/_/g, " ");

  // ---------- leads ----------
  let ids = { lead: 1, sub: 1, fu: 1, school: 1, kn: 1, pf: 1 };
  const leads = [];
  const details = {}; // id -> {documents, submissions, followups, activity}

  const stageWeights = [14, 12, 10, 9, 7, 5, 4, 3, 2];
  const weightedStage = () => {
    const total = stageWeights.reduce((a, b) => a + b, 0);
    let r = rnd() * total;
    for (let i = 0; i < STAGES.length; i++) { r -= stageWeights[i]; if (r <= 0) return STAGES[i]; }
    return "new";
  };

  for (let i = 0; i < 66; i++) {
    const id = ids.lead++;
    const first = pick(FIRST), last = pick(LAST);
    const name = `${first} ${last}`;
    const source = pick(["whatsapp", "whatsapp", "website", "website", "email", "manual"]);
    const stage = weightedStage();
    const stageIdx = STAGES.indexOf(stage);
    let engagement;
    if (stage === "lost") engagement = pick(["not_interested", "unreachable"]);
    else if (stage === "new") engagement = pick(["new", "new", "responding"]);
    else if (stageIdx >= 3 && stageIdx <= 6) engagement = pick(["qualified", "qualified", "responding"]);
    else engagement = pick(["responding", "qualified", "responding", "unreachable"]);
    const created_at = NOW - between(0, 44) * DAY - between(0, 86000);
    const updated_at = created_at + between(0, Math.max(1, Math.floor((NOW - created_at) / 3600))) * 3600;
    const program_interest = chance(.88) ? pick(PROGRAMS) : null;
    const phone = `+62 8${between(11, 99)}-${between(1000, 9999)}-${between(1000, 9999)}`;
    const email = chance(.8) ? `${first.toLowerCase()}.${last.toLowerCase()}${between(1, 99)}@gmail.com` : null;

    const followups = [];
    const nFu = stageIdx >= 1 && stageIdx <= 6 ? between(0, 3) : between(0, 1);
    for (let k = 0; k < nFu; k++) {
      const done = chance(.45);
      const scheduled_at = done ? created_at + between(1, 10) * DAY : NOW + between(-6, 9) * DAY + between(-30000, 30000);
      followups.push({ id: ids.fu++, lead_id: id, scheduled_at, channel: pick(CHANNELS), notes: pick(["Follow up on documents", "Send fee structure", "Confirm intake month", "Parent wants to talk", "Share hostel options", "Cek IELTS result", null]), done_at: done ? scheduled_at + 3600 : null });
    }
    const pendingFu = followups.filter(f => !f.done_at).sort((a, b) => a.scheduled_at - b.scheduled_at);
    const next_followup_at = pendingFu[0]?.scheduled_at || null;

    const documents = DOC_TYPES.map(t => {
      let status = "pending";
      if (stageIdx >= 3) status = chance(.6) ? "verified" : chance(.6) ? "received" : "pending";
      else if (stageIdx === 2) status = chance(.3) ? "received" : "pending";
      if (t === "other") status = "pending";
      return { doc_type: t, status, notes: status === "received" && chance(.4) ? "Scan blur — minta resend" : "" };
    });

    const submissions = [];
    if (stageIdx >= 4 && stageIdx <= 6) {
      const n = between(1, 2);
      for (let k = 0; k < n; k++) {
        const uni = pick(UNIS);
        const status = stage === "application_submitted" ? pick(["submitted", "under_review", "preparing"]) : stage === "offer_received" ? pick(["offer", "conditional_offer"]) : "offer";
        submissions.push({ id: ids.sub++, lead_id: id, university: uni, program: program_interest ? program_interest.split(" — ")[0] : null, status });
      }
    }

    const activity = [{ ts: created_at, action: "lead created", detail: `via ${source}`, actor: source === "manual" ? "staff" : "webhook" }];
    if (stageIdx >= 1) activity.push({ ts: created_at + 3600 * between(1, 20), action: "stage", detail: `new → ${STAGES[Math.min(stageIdx, 1)]}`, actor: source === "whatsapp" ? "alisya" : "staff" });
    if (stageIdx >= 2) activity.push({ ts: created_at + DAY * between(1, 4), action: "engagement", detail: `→ ${engagement}`, actor: "alisya" });
    if (stageIdx >= 3) activity.push({ ts: created_at + DAY * between(3, 8), action: "stage", detail: `→ ${stage}`, actor: "staff" });
    followups.filter(f => f.done_at).forEach(f => activity.push({ ts: f.done_at, action: "follow-up done", detail: f.channel, actor: "staff" }));
    activity.sort((a, b) => b.ts - a.ts);

    leads.push({ id, name, email, phone, source, stage, engagement, program_interest, created_at, updated_at, next_followup_at });
    details[id] = { documents, submissions, followups, activity };
  }

  const leadById = (id) => leads.find(l => l.id === Number(id));
  const touch = (l, action, detail, actor = "staff") => {
    l.updated_at = Math.floor(Date.now() / 1000);
    details[l.id].activity.unshift({ ts: l.updated_at, action, detail, actor });
  };
  const recomputeNext = (l) => {
    const p = details[l.id].followups.filter(f => !f.done_at).sort((a, b) => a.scheduled_at - b.scheduled_at);
    l.next_followup_at = p[0]?.scheduled_at || null;
  };

  // ---------- schools ----------
  const SCHOOL_STATUSES = ["prospect", "contacted", "meeting", "active", "paused", "dropped"];
  const schoolSeed = [
    ["Poliklinik Sejahtera Cheras", "Jakarta", "tier3_islamic", "active", "Ibu Ratna Dewi", "GP", "Tier 3 anchor. 18 patients/mo from referrals."],
    ["SMAN 8 Jakarta", "Jakarta", "tier4_regional", "mou_signed", "Bapak Hendra Wijaya", "Admin Humas", "MoU signed Aug. Awaiting PIC letter."],
    ["Pondok Modern Darussalam Gontor", "Ponorogo", "tier3_islamic", "meeting", "Ustadz Fauzi", "Bagian Kesiswaan", "Interested in IIUM pathway. Meeting set for next month."],
    ["Labschool Kebayoran", "Jakarta", "tier2_elite", "active", "Ibu Sari Utami", "Owner", "Strong parent network. Annual edu fair in Feb."],
    ["Sekolah Pelita Harapan Lippo Village", "Tangerang", "tier1_spk", "contacted", "Ms. Grace Tan", "University Counsellor", "Prefers premium panels, open to shared WA inbox."],
    ["Binus School Simprug", "Jakarta", "tier1_spk", "prospect", "Mr. Kevin Lim", "College Counsellor", null],
    ["MAN Insan Cendekia Serpong", "Tangerang Selatan", "tier3_islamic", "pic_appointed", "Bapak Ahmad Syafii", "GP", "PIC: Pak Syafii. WhatsApp group with 40 parents."],
    ["SMA Kharisma Bangsa", "Tangerang Selatan", "tier2_elite", "active", "Ibu Maya Anggraini", "Counsellor", "Olympiad kids — engineering / actuarial fits."],
    ["SMAN 3 Bandung", "Bandung", "tier4_regional", "contacted", "Bapak Rudi Prasetyo", "Admin", "Called twice. Asked for brochure in Bahasa."],
    ["SMAIT Nurul Fikri Depok", "Depok", "tier3_islamic", "meeting", "Ustadzah Hanifah", "Owner", "Very warm. Wants Islamic finance + medicine talk."],
    ["SMA Muhammadiyah 1 Yogyakarta", "Yogyakarta", "tier3_islamic", "prospect", "Bapak Joko Santoso", "GP", null],
    ["SMA Dwiwarna Bogor", "Bogor", "tier2_elite", "paused", "Ibu Lestari", "Humas", "Paused until new principal appointed."],
    ["SMA Semesta Semarang", "Semarang", "tier2_elite", "mou_signed", "Mr. Mehmet Yilmaz", "Principal", "Bilingual boarding. Loves UTP + APU."],
    ["Sekolah Cikal Amri Setu", "Jakarta", "tier1_spk", "dropped", "Ms. Dian", "Counsellor", "Committed to Australian pathway for now."],
    ["SMA Negeri 1 Medan", "Medan", "tier4_regional", "prospect", "Bapak Siregar", "Admin", "Sumatra pilot — close to Penang."],
    ["Al-Izhar Pondok Labu", "Jakarta", "tier3_islamic", "active", "Ibu Fitri Hasibuan", "GP", "9 leads this quarter. Wants alumni testimonial."],
  ];
  const schools = schoolSeed.map(([name, city, tier, status, contact_name, contact_role, notes], i) => {
    const id = ids.school++;
    const slug = name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 10);
    return {
      id, name, city, tier, status, contact_name, contact_role, notes,
      contact_email: `${contact_name.split(" ").slice(-1)[0].toLowerCase()}@${slug}.sch.id`,
      contact_phone: `+62 21 ${between(700, 799)} ${between(1000, 9999)}`,
      whatsapp: chance(.85) ? `+62 8${between(11, 99)}${between(1000000, 9999999)}` : null,
      website: chance(.7) ? `https://${slug}.sch.id` : null,
      created_at: NOW - between(20, 200) * DAY,
      updated_at: NOW - between(0, 30) * DAY,
    };
  });
  const schoolActivity = {};
  schools.forEach(s => {
    schoolActivity[s.id] = [{ created_at: s.created_at, action: "school added", detail: "" }];
    const idx = SCHOOL_STATUSES.indexOf(s.status);
    for (let i = 1; i <= Math.min(idx, 5); i++) schoolActivity[s.id].unshift({ created_at: s.created_at + i * between(5, 20) * DAY, action: "status", detail: `→ ${title(SCHOOL_STATUSES[i])}` });
  });

  // ---------- alisya ----------
  const devices = [
    { session: "cb", display_name: "Alisya HQ", number: "+60 12-345 6789", engine: "WEBJS", status: "WORKING", persona_mode: "share", persona_override: {} },
    { session: "cb-jakarta", display_name: "Alisya Jakarta", number: "+62 812-9988-7766", engine: "NOWEB", status: "WORKING", persona_mode: "custom", persona_override: { persona_intro: "Halo! Saya Alisya dari Campus Bridge Jakarta 😊", working_hours: "Senin–Jumat 09.00–18.00 WIB" } },
    { session: "cb-surabaya", display_name: "Alisya Surabaya", number: null, engine: "NOWEB", status: "SCAN_QR_CODE", persona_mode: "share", persona_override: {} },
  ];

  let config = {
    persona_name: "Alisya",
    working_hours: "Isnin–Jumaat 9am–6pm MYT",
    persona_tone: "Mesra, sopan, ringkas. Guna 'kakak' untuk pelajar, 'Bapak/Ibu' untuk orang tua.",
    persona_intro: "Assalamu'alaikum! Saya Alisya, education counsellor dari Campus Bridge Malaysia 🇲🇾 Boleh saya tahu program apa yang adik minat?",
    away_message: "Terima kasih atas mesej anda! Pejabat kami buka 9am–6pm MYT. Alisya akan balas secepat mungkin ya 🙏",
    active_hours: [8, 22],
    ignore_keywords: ["unsubscribe", "stop", "spam"],
    auto_reply: true, ignore_groups: true, ignore_unknown: false,
  };
  let behavior = {
    role: "Education counsellor for Malaysian universities",
    objective: "Qualify the student, collect program + intake + budget, book a counselling call",
    language: "Bahasa Indonesia / Melayu, switch to English if the student does",
    tone: "warm, big-sister, never pushy",
    response_length: "short", emoji_level: "light",
    can_answer: "Program lists, tuition ranges, intake dates, hostel, visa (EMGS) steps, scholarship basics",
    must_not: "Guarantee admission or visa. Quote exact fees older than 2025. Discuss politics.",
    handoff_rule: "Parent asks for a human, complaint, or payment questions → tag staff and stop replying.",
    lead_fields: "name, city, current school, program, intake, budget range",
    cta: "Offer a free 15-min video call with a counsellor",
    ask_followup: true, use_customer_name: true,
  };
  let knowledge = [
    { id: ids.kn++, title: "Tuition ranges 2026", category: "fees", enabled: true, content: "Foundation RM 18–28k/yr. Diploma RM 12–20k/yr. Degree (business/IT) RM 25–45k/yr. Medicine RM 90–130k/yr. Living cost KL ≈ RM 1,500–2,500/month including hostel." },
    { id: ids.kn++, title: "EMGS student visa steps", category: "visa", enabled: true, content: "1) Offer letter 2) EMGS application via university (RM ~1,500) 3) VAL issued 4–8 weeks 4) Single-entry visa at KBRI 5) Medical check in MY within 7 days 6) i-Kad issued." },
    { id: ids.kn++, title: "Intake calendar", category: "programs", enabled: true, content: "Most universities: Jan / Apr-May / Sep. Medicine: Feb & Sep only. Foundation: Jan, Apr, Jul, Sep." },
    { id: ids.kn++, title: "Scholarships", category: "fees", enabled: true, content: "Merit scholarships 10–50% for SNBT/UN ≥ 85 average. IIUM has Indonesian alumni bursary. Never promise — say 'eligible to apply'." },
    { id: ids.kn++, title: "Old 2024 fee sheet", category: "fees", enabled: false, content: "Deprecated — kept for reference. Do not quote." },
  ];
  const memory = {
    "6281299887766@c.us": { name: "Kak Amina (GP)", items: [["role", "GP", "chat"], ["school", "Poliklinik Sejahtera Cheras", "chat"], ["prefers", "Bahasa Indonesia formal", "inferred"]] },
    "628123456789@c.us": { name: "Aisyah Pratama", items: [["program", "Pharmacy — UCSI", "chat"], ["intake", "Sep 2026", "chat"], ["budget", "RM 30k/yr", "chat"], ["parent_name", "Pak Budi", "chat"]] },
    "628567890123@c.us": { name: "Rizky Saputra", items: [["program", "Computer Science — APU", "chat"], ["city", "Bandung", "chat"]] },
  };
  let training = { enabled: true, content: "Q: Berapa biaya kuliah di Malaysia?\nA: Tergantung program kak — foundation sekitar RM 18–28k/tahun, degree bisnis/IT RM 25–45k/tahun. Mau saya kirim rincian untuk program yang kakak minat?\n\nQ: Apakah ijazah Malaysia diakui di Indonesia?\nA: Ya, universitas yang terakreditasi MQA diakui Dikti. Saya bisa cek universitas spesifik untuk kakak.\n\nQ: Bisa kerja sambil kuliah?\nA: Mahasiswa internasional boleh kerja part-time maks 20 jam/minggu saat libur semester, dengan izin universitas." };
  let model = { base_url: "https://api.groq.com/openai/v1", api_key_env: "GROQ_API_KEY", chat_model: "llama-3.3-70b-versatile", memory_model: "llama-3.1-8b-instant", actions_model: "llama-3.1-8b-instant", playground_model: "llama-3.3-70b-versatile", fallback_model: "gpt-4o-mini", max_tokens: 300, fallback_enabled: true };
  let providers = { enabled: true, list: [
    { id: ids.pf++, name: "Groq", base_url: "https://api.groq.com/openai/v1", api_key_env: "GROQ_API_KEY", model: "llama-3.3-70b-versatile", priority: 10, enabled: true },
    { id: ids.pf++, name: "OpenAI", base_url: "https://api.openai.com/v1", api_key_env: "OPENAI_API_KEY", model: "gpt-4o-mini", priority: 50, enabled: true },
    { id: ids.pf++, name: "Ollama local", base_url: "http://10.0.0.2:11434/v1", api_key_env: "OLLAMA_KEY", model: "qwen2.5:14b", priority: 90, enabled: false },
  ] };
  let actions = { enabled: true, auto_create_lead: true, auto_update_lead: true, auto_followup: false, notify_team: true };

  // ---------- inbox ----------
  const inboxSeed = [
    ["628123456789@c.us", "Aisyah Pratama", "cb-jakarta", 2, [
      [-3 * DAY, false, "Assalamu'alaikum kak, saya mau tanya soal Pharmacy di UCSI"],
      [-3 * DAY + 120, true, "Wa'alaikumussalam Aisyah! 😊 Pharmacy UCSI 4 tahun, intake Sep & Jan. Boleh tahu adik dari kota mana dan target intake kapan?"],
      [-3 * DAY + 600, false, "Dari Jakarta kak. Kalau bisa Sep 2026"],
      [-3 * DAY + 700, true, "Pas banget, Sep 2026 masih buka sampai Juni. Untuk Pharmacy syaratnya Kimia + Bio minimal 80. Nilai rapor adik gimana?"],
      [-DAY, false, "Kimia 88, Bio 85 kak. Biayanya kira-kira berapa ya?"],
      [-DAY + 90, true, "Alhamdulillah kuat nilainya! Pharmacy UCSI sekitar RM 38k/tahun. Ada merit scholarship 20–30% untuk nilai di atas 85. Mau saya jadwalkan video call 15 menit dengan counsellor kami untuk bahas scholarship?"],
      [-3600, false, "Boleh kak. Ayah saya juga mau ikut"],
      [-1800, false, "Kapan bisa?"],
    ]],
    ["6281299887766@c.us", "Ibu Ratna Dewi", "cb-jakarta", 1, [
      [-5 * DAY, false, "Selamat pagi, saya Ratna dari Poliklinik Sejahtera. Mau konfirmasi jadwal edu talk bulan depan"],
      [-5 * DAY + 300, true, "Selamat pagi Ibu Ratna 🙏 Terima kasih. Untuk edu talk, tim kami sudah siapkan 12 Oktober jam 10. Apakah cocok untuk sekolah?"],
      [-5 * DAY + 3000, false, "Cocok. Kira-kira 60 siswa kelas 12 ya"],
      [-2 * DAY, true, "Baik Ibu, sudah kami catat: 12 Okt, 10.00, ±60 siswa. Kami bawa brosur Bahasa Indonesia dan alumni dari Al-Azhar 😊"],
      [-7200, false, "Bagus. Tolong kirim surat resminya ke email sekolah ya"],
    ]],
    ["628567890123@c.us", "Rizky Saputra", "cb", 0, [
      [-8 * DAY, false, "hi, CS di APU berapa"],
      [-8 * DAY + 60, true, "Hi Rizky! Computer Science APU sekitar RM 32k/tahun, 3 tahun. Ada dual degree dengan De Montfort UK. Kamu dari mana dan mau intake kapan?"],
      [-8 * DAY + 900, false, "bandung. tahun depan lah"],
      [-8 * DAY + 960, true, "Siap. Intake Jan / Apr / Sep 2027 semua ada. Kalau mau, aku kirim brosur + syarat nilainya ya? Atau mau langsung ngobrol sama counsellor?"],
      [-6 * DAY, false, "kirim aja dulu"],
      [-6 * DAY + 30, true, "Sudah aku kirim ke email kamu 📩 Kalau ada pertanyaan tinggal chat aku ya!"],
    ]],
    ["628111222333@c.us", "Pak Budi (ayah Aisyah)", "cb-jakarta", 3, [
      [-3600, false, "Selamat sore. Saya ayah Aisyah. Bisa bicara dengan orang, bukan bot?"],
      [-3500, true, "Selamat sore Bapak Budi 🙏 Tentu, saya sambungkan ke counsellor kami. Mohon tunggu sebentar ya, Bapak."],
      [-3400, false, "Baik"],
      [-900, false, "Halo?"],
      [-600, false, "Masih ada?"],
    ]],
    ["628999000111@c.us", "Nadia Wijaya", "cb", 0, [
      [-12 * DAY, false, "Kak, IIUM Islamic Finance masih buka?"],
      [-12 * DAY + 100, true, "Masih Nadia! Sep intake tutup 30 Jun. Syarat: rapor rata 80 + IELTS 6.0 (atau bisa ambil EPT IIUM). Kamu sudah ada IELTS?"],
      [-12 * DAY + 4000, false, "Belum kak. Saya ambil EPT aja"],
      [-11 * DAY, true, "Oke, EPT dijadwalkan tiap bulan online. Aku catat ya. Dokumen yang perlu: paspor, rapor, ijazah/SKL, surat sponsor. Mau aku kirim checklist?"],
      [-11 * DAY + 200, false, "Mau kak, terima kasih!"],
    ]],
    ["628444555666@c.us", "Bagas Nugroho", "cb-jakarta", 0, [
      [-20 * DAY, false, "Info kuliah kedokteran"],
      [-20 * DAY + 60, true, "Halo! Kedokteran (MBBS) di Malaysia 5 tahun, IMU / MAHSA / UCSI. Biaya RM 90–130k/tahun. Intake Feb & Sep. Boleh tau nama dan asal kota kamu?"],
      [-15 * DAY, true, "Hai, apakah masih tertarik dengan info kedokteran? Aku bisa bantu cek syarat nilai 😊"],
    ]],
  ];
  const chats = inboxSeed.map(([id, name, session, unread, msgs]) => ({
    id, name, session, unread, bot_paused: id === "628111222333@c.us",
    linked_lead_id: leads.find(l => l.name.split(" ")[0] === name.split(" ")[0])?.id || null,
    notes: id === "6281299887766@c.us" ? "Key partner contact. Kirim surat resmi via email sekolah." : "",
    messages: msgs.map(([dt, from_me, body]) => ({ ts: NOW + dt, from_me, body })),
  }));
  const lastTs = (c) => c.messages[c.messages.length - 1]?.ts || 0;

  const alisyaReply = (text) => {
    const t = text.toLowerCase();
    if (/biaya|harga|fee|berapa|kos/.test(t)) return "Tergantung program kak — foundation sekitar RM 18–28k/tahun, degree bisnis/IT RM 25–45k/tahun, kedokteran RM 90–130k/tahun. Mau saya kirim rincian untuk program yang kakak minat? 😊";
    if (/visa|emgs/.test(t)) return "Untuk visa pelajar (EMGS): universitas yang urus setelah offer letter, biaya sekitar RM 1,500, proses 4–8 minggu. Saya bisa kirim checklist dokumennya ya kak.";
    if (/intake|kapan|bulan/.test(t)) return "Kebanyakan universitas buka intake Januari, April/Mei, dan September. Kedokteran hanya Feb & Sep. Kakak target intake kapan?";
    if (/scholar|beasiswa/.test(t)) return "Ada merit scholarship 10–50% untuk nilai rata-rata ≥ 85. Kakak eligible untuk apply — saya belum bisa janji, tapi peluangnya bagus! Boleh share nilai rapor kakak?";
    if (/halo|hai|hi|assalam|salam/.test(t)) return "Assalamu'alaikum! Saya Alisya dari Campus Bridge Malaysia 🇲🇾 Boleh saya tahu program apa yang kakak minat?";
    return "Terima kasih kak! Boleh saya tahu nama, kota asal, dan program yang kakak minat? Nanti saya bantu cek syarat dan biayanya 😊";
  };

  // ---------- helpers ----------
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  const err = (detail, status = 400) => json({ detail }, status);
  const body = (opts) => { try { return opts && opts.body ? JSON.parse(opts.body) : {}; } catch { return {}; } };
  let loggedIn = sessionStorage.getItem("cb-demo-auth") === "1" || new URLSearchParams(location.search).has("demo");

  const leadSummary = (l) => ({ ...l });

  function dashboard(days) {
    const since = days ? NOW - Number(days) * DAY : 0;
    const pool = leads.filter(l => l.created_at >= since);
    const total = pool.length;
    const count = (f) => pool.filter(f).length;
    const allFu = leads.flatMap(l => details[l.id].followups.filter(f => !f.done_at).map(f => ({ ...f, name: l.name })));
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const t0 = Math.floor(startToday / 1000), t1 = t0 + DAY;
    const cards = {
      total, new: count(l => l.stage === "new"), responding: count(l => l.engagement === "responding"),
      qualified: count(l => l.engagement === "qualified"), overdue_followups: allFu.filter(f => f.scheduled_at < t0).length,
      hot_leads: count(l => l.engagement === "qualified" && ["counselling", "document_collection", "application_submitted"].includes(l.stage)),
    };
    const by_source = {}; SOURCES.forEach(s => by_source[s] = count(l => l.source === s));
    const by_engagement = {}; ENGAGEMENT.forEach(e => by_engagement[e] = count(l => l.engagement === e));
    const stages = {};
    STAGES.forEach(s => { const ls = pool.filter(l => l.stage === s).sort((a, b) => b.updated_at - a.updated_at); stages[s] = { label: STAGE_LABEL[s], count: ls.length, leads: ls.map(leadSummary) }; });
    const funnelOrder = STAGES.slice(0, 7);
    let prev = total;
    const funnel = funnelOrder.map((s, i) => {
      const reached = pool.filter(l => STAGES.indexOf(l.stage) >= i && STAGES.indexOf(l.stage) <= 6).length;
      const row = { stage: s, label: STAGE_LABEL[s], count: reached, pct_total: total ? Math.round(reached / total * 100) : 0, pct_previous: prev ? Math.round(reached / prev * 100) : 0 };
      prev = reached; return row;
    });
    const created_by_day = {};
    const span = days ? Number(days) : 14;
    for (let i = span - 1; i >= 0; i--) { const d = new Date((NOW - i * DAY) * 1000); created_by_day[d.toISOString().slice(0, 10)] = 0; }
    pool.forEach(l => { const k = new Date(l.created_at * 1000).toISOString().slice(0, 10); if (k in created_by_day) created_by_day[k]++; });
    const by_source_stage = {}; SOURCES.forEach(src => { by_source_stage[src] = {}; STAGES.forEach(s => by_source_stage[src][s] = pool.filter(l => l.source === src && l.stage === s).length); });
    const fuSorted = allFu.sort((a, b) => a.scheduled_at - b.scheduled_at);
    return {
      cards, by_source, by_engagement, stages,
      followups: { overdue: fuSorted.filter(f => f.scheduled_at < t0), today: fuSorted.filter(f => f.scheduled_at >= t0 && f.scheduled_at < t1), upcoming: fuSorted.filter(f => f.scheduled_at >= t1) },
      analytics: { funnel, created_by_day, by_source_stage },
    };
  }

  // ---------- router ----------
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, opts = {}) {
    const url = typeof input === "string" ? input : input.url;
    if (!/^\/(api|login|logout)(\/|\?|$)/.test(url)) return realFetch(input, opts);
    await new Promise(r => setTimeout(r, 60 + Math.random() * 140));
    const [pathname, qs = ""] = url.split("?");
    const q = new URLSearchParams(qs);
    const method = (opts.method || "GET").toUpperCase();
    const b = body(opts);
    const parts = pathname.split("/").filter(Boolean);

    if (pathname === "/login" && method === "POST") { loggedIn = true; sessionStorage.setItem("cb-demo-auth", "1"); return json({ ok: true }); }
    if (pathname === "/logout") { loggedIn = false; sessionStorage.removeItem("cb-demo-auth"); return json({ ok: true }); }
    if (pathname === "/api/health") return json({ ok: true, version: "demo" });
    if (!loggedIn) return json({ detail: "unauthorized" }, 401);
    if (pathname === "/api/stats") return json({ leads: leads.length, schools: schools.length });

    if (pathname === "/api/dashboard") return json(dashboard(q.get("days")));

    // leads
    if (parts[1] === "leads") {
      if (parts.length === 2 && method === "GET") {
        let out = leads.slice();
        const s = (q.get("search") || "").toLowerCase();
        if (s) out = out.filter(l => `${l.name} ${l.email || ""} ${l.phone || ""} ${l.program_interest || ""}`.toLowerCase().includes(s));
        if (q.get("source")) out = out.filter(l => l.source === q.get("source"));
        if (q.get("stage")) out = out.filter(l => l.stage === q.get("stage"));
        if (q.get("engagement")) out = out.filter(l => l.engagement === q.get("engagement"));
        if (q.get("overdue_followup") === "true") out = out.filter(l => l.next_followup_at && l.next_followup_at < NOW);
        out.sort((a, b) => b.updated_at - a.updated_at);
        return json(out);
      }
      if (parts.length === 2 && method === "POST") {
        if (!b.name || !b.name.trim()) return err("name is required");
        const now = Math.floor(Date.now() / 1000);
        const l = { id: ids.lead++, name: b.name.trim(), email: b.email || null, phone: b.phone || null, source: "manual", stage: "new", engagement: "new", program_interest: b.program_interest || null, created_at: now, updated_at: now, next_followup_at: null };
        leads.unshift(l);
        details[l.id] = { documents: DOC_TYPES.map(t => ({ doc_type: t, status: "pending", notes: "" })), submissions: [], followups: [], activity: [{ ts: now, action: "lead created", detail: "via manual", actor: "staff" }] };
        return json({ id: l.id });
      }
      const l = leadById(parts[2]);
      if (!l) return err("lead not found", 404);
      if (parts.length === 3 && method === "GET") return json({ lead: clone(l), ...clone(details[l.id]) });
      if (parts.length === 3 && method === "PATCH") {
        let warning = null;
        if (b.stage && b.stage !== l.stage) {
          if (b.stage === "application_submitted" && details[l.id].documents.filter(d => d.doc_type !== "other").some(d => d.status === "pending")) warning = "Some documents are still pending — application marked submitted anyway.";
          touch(l, "stage", `${l.stage} → ${b.stage}`); l.stage = b.stage;
        }
        if (b.engagement && b.engagement !== l.engagement) { touch(l, "engagement", `${l.engagement} → ${b.engagement}`); l.engagement = b.engagement; }
        return json({ ok: true, warning });
      }
      if (parts[3] === "documents" && method === "POST") {
        const d = details[l.id].documents.find(x => x.doc_type === parts[4]);
        if (!d) return err("unknown doc type");
        touch(l, "document", `${title(d.doc_type)}: ${d.status} → ${b.status}`); d.status = b.status;
        return json({ ok: true });
      }
      if (parts[3] === "submissions" && method === "POST") {
        if (!b.university) return err("university is required");
        const s = { id: ids.sub++, lead_id: l.id, university: b.university, program: b.program || null, status: "preparing" };
        details[l.id].submissions.push(s); touch(l, "submission added", b.university);
        return json(s);
      }
      if (parts[3] === "followups" && method === "POST") {
        const f = { id: ids.fu++, lead_id: l.id, scheduled_at: b.scheduled_at, channel: b.channel || null, notes: b.notes || null, done_at: null };
        details[l.id].followups.push(f); recomputeNext(l); touch(l, "follow-up scheduled", `${f.channel || ""} ${new Date(f.scheduled_at * 1000).toLocaleDateString()}`);
        return json(f);
      }
    }
    if (parts[1] === "submissions" && method === "PATCH") {
      for (const l of leads) { const s = details[l.id].submissions.find(x => x.id === Number(parts[2])); if (s) { touch(l, "submission", `${s.university}: ${s.status} → ${b.status}`); s.status = b.status; return json(s); } }
      return err("not found", 404);
    }
    if (parts[1] === "followups" && method === "PATCH") {
      for (const l of leads) { const f = details[l.id].followups.find(x => x.id === Number(parts[2])); if (f) { f.done_at = Math.floor(Date.now() / 1000); recomputeNext(l); touch(l, "follow-up done", f.channel || ""); return json(f); } }
      return err("not found", 404);
    }

    // schools
    if (parts[1] === "schools") {
      if (parts.length === 2 && method === "GET") {
        let out = schools.slice();
        const s = (q.get("search") || "").toLowerCase();
        if (s) out = out.filter(x => `${x.name} ${x.city} ${x.contact_name}`.toLowerCase().includes(s));
        if (q.get("status")) out = out.filter(x => x.status === q.get("status"));
        if (q.get("tier")) out = out.filter(x => x.tier === q.get("tier"));
        out.sort((a, b) => b.updated_at - a.updated_at);
        return json({ schools: out });
      }
      if (parts.length === 2 && method === "POST") {
        if (!b.name) return err("name is required");
        const now = Math.floor(Date.now() / 1000);
        const s = { id: ids.school++, ...b, created_at: now, updated_at: now };
        schools.unshift(s); schoolActivity[s.id] = [{ created_at: now, action: "school added", detail: "" }];
        return json(s);
      }
      const s = schools.find(x => x.id === Number(parts[2]));
      if (!s) return err("school not found", 404);
      if (method === "GET") return json({ school: clone(s), activity: clone(schoolActivity[s.id]) });
      if (method === "PATCH") {
        if (b.status && b.status !== s.status) { schoolActivity[s.id].unshift({ created_at: Math.floor(Date.now() / 1000), action: "status", detail: `${title(s.status)} → ${title(b.status)}` }); s.status = b.status; s.updated_at = Math.floor(Date.now() / 1000); }
        return json(s);
      }
    }

    // alisya
    if (parts[1] === "alisya") {
      const area = parts[2];
      if (area === "config") { if (method === "PATCH") Object.assign(config, b); return json(config); }
      if (area === "behavior") { if (method === "PATCH") Object.assign(behavior, b); return json(behavior); }
      if (area === "training") { if (method === "PATCH") Object.assign(training, b); return json(training); }
      if (area === "actions") { if (method === "PATCH") Object.assign(actions, b); return json(actions); }
      if (area === "model") {
        if (parts[3] === "test") return json({ ok: true, model: model.chat_model, reply: "Assalamu'alaikum, Alisya here 👋" });
        if (method === "PATCH") Object.assign(model, b); return json(model);
      }
      if (area === "knowledge") {
        if (parts.length === 3 && method === "GET") return json({ documents: knowledge });
        if (parts.length === 3 && method === "POST") { const d = { id: ids.kn++, enabled: true, category: "general", ...b }; knowledge.unshift(d); return json(d); }
        const d = knowledge.find(x => x.id === Number(parts[3]));
        if (!d) return err("not found", 404);
        if (method === "PATCH") { Object.assign(d, b); return json(d); }
        if (method === "DELETE") { knowledge = knowledge.filter(x => x !== d); return json({ ok: true }); }
      }
      if (area === "memory") {
        if (parts.length === 3) return json({ contacts: Object.entries(memory).map(([chat_id, m]) => ({ chat_id, name: m.name, fields: m.items.length })) });
        const cid = decodeURIComponent(parts[3]);
        memory[cid] = memory[cid] || { name: cid, items: [] };
        if (parts.length === 4 && method === "GET") return json({ items: memory[cid].items.map(([k, v, source]) => ({ k, v, source })) });
        if (parts.length === 4 && method === "POST") { const ex = memory[cid].items.find(i => i[0] === b.k); if (ex) ex[1] = b.v; else memory[cid].items.push([b.k, b.v, "manual"]); return json({ ok: true }); }
        if (parts.length === 5 && method === "DELETE") { memory[cid].items = memory[cid].items.filter(i => i[0] !== decodeURIComponent(parts[4])); return json({ ok: true }); }
      }
      if (area === "providers") {
        if (parts.length === 3 && method === "GET") return json({ enabled: providers.enabled, providers: providers.list.slice().sort((a, b) => a.priority - b.priority) });
        if (parts.length === 3 && method === "POST") { if (!b.name) return err("name required"); providers.list.push({ id: ids.pf++, enabled: true, ...b }); return json({ ok: true }); }
        if (parts[3] === "config") { providers.enabled = !!b.enabled; return json({ ok: true }); }
        if (parts[3] === "test-failover") { const p = providers.list.filter(x => x.enabled).sort((a, b) => a.priority - b.priority)[0]; return p ? json({ ok: true, result: { provider_name: p.name, model: p.model } }) : json({ ok: false, error: "no enabled provider" }); }
        const p = providers.list.find(x => x.id === Number(parts[3]));
        if (!p) return err("not found", 404);
        if (parts[4] === "test") return p.enabled ? json({ ok: true, provider: p.name }) : json({ ok: false, error: `${p.name} is disabled` });
        if (method === "DELETE") { providers.list = providers.list.filter(x => x !== p); return json({ ok: true }); }
      }
      if (area === "devices") {
        if (parts.length === 3 && method === "GET") return json({ devices: devices.map(d => ({ ...d })) });
        if (parts.length === 3 && method === "POST") {
          if (!b.session || !b.display_name) return err("session and display_name required");
          if (devices.find(d => d.session === b.session)) return err("session already exists");
          devices.push({ session: b.session, display_name: b.display_name, number: null, engine: "NOWEB", status: "SCAN_QR_CODE", persona_mode: "share", persona_override: {} });
          return json({ ok: true });
        }
        const d = devices.find(x => x.session === decodeURIComponent(parts[3]));
        if (!d) return err("device not found", 404);
        if (parts.length === 4 && method === "GET") return json(d);
        if (parts.length === 4 && method === "PATCH") { Object.assign(d, b); return json(d); }
        if (parts[4] === "qr") return json({ session: d.session, seed: d.session.length * 7919 });
        if (parts[4] === "start" || parts[4] === "restart") { d.status = d.number ? "WORKING" : "SCAN_QR_CODE"; return json({ ok: true }); }
        if (parts[4] === "stop") { d.status = "STOPPED"; return json({ ok: true }); }
        if (parts[4] === "logout") { d.status = "SCAN_QR_CODE"; d.number = null; return json({ ok: true }); }
      }
      if (area === "inbox") {
        if (parts.length === 3) {
          let out = chats.slice();
          if (q.get("device")) out = out.filter(c => c.session === q.get("device"));
          out.sort((a, b) => lastTs(b) - lastTs(a));
          return json({ chats: out.map(c => ({ id: c.id, name: c.name, session: c.session, unread: c.unread, bot_paused: c.bot_paused, last: c.messages[c.messages.length - 1] })) });
        }
        const c = chats.find(x => x.id === decodeURIComponent(parts[3]));
        if (!c) return err("chat not found", 404);
        if (parts.length === 4) { c.unread = 0; return json({ chat: { id: c.id, name: c.name, session: c.session, bot_paused: c.bot_paused, linked_lead_id: c.linked_lead_id, notes: c.notes }, messages: c.messages }); }
        if (parts[4] === "reply") { if (!b.text) return err("text required"); c.messages.push({ ts: Math.floor(Date.now() / 1000), from_me: true, body: b.text, by: "staff" }); return json({ ok: true }); }
        if (parts[4] === "context") { if ("linked_lead_id" in b) c.linked_lead_id = b.linked_lead_id ? Number(b.linked_lead_id) : null; if ("notes" in b) c.notes = b.notes; return json({ ok: true }); }
        if (parts[4] === "pause") { c.bot_paused = !c.bot_paused; return json({ bot_paused: c.bot_paused }); }
      }
      if (area === "playground" && parts[3] === "chat") {
        await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
        return json({ reply: alisyaReply(b.message || "") });
      }
    }

    return err(`no mock route for ${method} ${pathname}`, 404);
  };
})();
