# Klinik CRM — Packages for GP & Dental (MY)

> For clinics (GP & Dental). Same trusted system, tuned for appointments, reminders & no-show follow-up. Hosting on our Oracle VPS + Cloudflare.

| | **Starter** | **Pro** | **Self-Host** |
|---|---|---|---|
| **Setup (one-time)** | **RM599** | **RM999** | **RM2,500** |
| **Monthly** | **RM99/mo** | **RM199/mo** | RM0 (you host) |
| Best for | GP / Dental 1 klinik, 1–2 nombor, 1 staff | Klinik besar / 2–3 cawangan, 3–5 nombor, 3 staff | IT team nak host sendiri |
| CRM | ✅ Patients, pipeline 5 stages (new→qualified→appointment→treated→lost), kanban 8/page, inbox, dashboard, follow-up queue | ✅ sama + priority views | ✅ source code |
| Alisya WA auto-reply | ✅ 20-exchange memory, anti-repeat, booking/reminder/no-show | ✅ sama | ✅ sama |
| WhatsApp numbers | **2 devices max** | **5 devices max** | 5 (configurable) |
| Patients/month | 200 patients/mo | 500 patients/mo | Unlimited |
| Domain | `klinikanda.care/demo` | Custom `crm.klinikanda.care` | Your domain |
| Backup | Weekly | Daily | You manage |
| Support | WA, 48h fix | WA, 24h priority | 30-day onboarding only |

**All monthly plans include:** Oracle VPS hosting, Cloudflare Tunnel (HTTPS), updates, bug fixes. No per-message fee.

### Why one-time + monthly?
One-time = setup, data migration, training (2h). Monthly = server, security patches, Scout (for referrals), support. Without monthly we'd have to charge RM2k+ upfront and leave you alone afterwards — hybrid is cheaper and you stay updated.

### Device Manager — limit berapa?
**MAX 5 devices** per account. Single WAHA `noweb-arm` on `:3000` — each device = one QR scan (session `clinic`, `clinic2` … slug `^[a-z0-9_-]{1,20}$`). Uses `GET /api/sessions` aggregate, webhook `http://127.0.0.1:8000/api/webhooks/whatsapp` exact. Starter cap 2, Pro cap 5.

### Medical disclaimer
Alisya is an **appointment assistant, not medical advice**. No diagnosis, no dosage, no promises. For clinical questions, refer to doctor.

### What's NOT included
- WhatsApp Official API fees (we use WAHA Web automation — see TERMS.md)
- Your clinic's greeting/message templates beyond initial setup
