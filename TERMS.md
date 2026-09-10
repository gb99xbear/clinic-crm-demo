# Terms — WhatsApp Automation Disclosure (read before you buy)

**Effective:** 2026-09-10 · For Klinik CRM (GP & Dental) packages above.

## 1. What technology we use
Klinik CRM (GP & Dental) uses **WAHA** (`devlikeapro/waha:noweb-arm`) on `127.0.0.1:3000` — a **WhatsApp Web automation** bridge (scans QR, mirrors whatsapp.com). This is **NOT the Official WhatsApp Business API** (Meta / green-tick API).

## 2. Why we chose it
- **Cost:** Official API charges per conversation (RM0.15–0.30 / 24h window) plus BSP fees. WAHA has no per-message fee — that's why our Starter is RM99 not RM300.
- **Speed:** Setup 10 minutes via QR. No Meta business verification wait (2–14 days).
- **Fit for SME:** 2–5 numbers, <500 conversations/day is ideal.

## 3. Risks you must know
- WhatsApp's Terms allow them to temp-block or ban numbers that behave like spam (bulk blast, >30 unsolicited messages/hour, reports from recipients). This applies to any phone, even without our system — but automation amplifies the risk.
- A ban affects **your phone number**, not our server. We cannot unblock it; only WhatsApp Support can.
- Our system does NOT bypass WhatsApp encryption or limits. We queue via `alisya_jobs` + Walded `journal_mode=WAL` and intentionally delay (old human-like patch 5–15s) but cannot guarantee zero risk.

## 4. How we mitigate
- Warm-up: first 3 days ≤10 outbound msgs/day per number, only to existing leads who consented.
- Rate limit: ≤30 new conversations/hour per device, queue `memory:<event_id>` / `action:<event_id>` with retry 1s/3s/9s/27s (max 5).
- Backup: keep at least 2 numbers (Device Manager max 5) so one block doesn't halt business.
- Anti-spam: Alisya never sends duplicate within 85% similarity (`difflib 0.85` vs last 2), inbox validated `device_session` slug `^[a-z0-9_-]{1,20}$`.
- You must collect consent (PDPA MY). We provide an opt-in template for first message.

## 5. Your responsibilities
- Only message leads who gave consent. No purchased lists without consent.
- Don't blast >30 new chats/hour/number. Use Scout drip (max 600/run, daily 1/4 zone rotation).
- Keep your WhatsApp phone online and battery healthy for WAHA session sync.

## 6. Upgrade path to Official API
If you need green-tick, template approvals, or >1000 msgs/day, we can migrate you to Official WhatsApp Business API (via Meta or BSP like WATI/Respond.io). Additional costs apply (Meta per-conversation + BSP fee). Your CRM data migrates — no rebuild.

## 7. Acceptance
By signing / paying the setup invoice, you confirm you read this disclosure and accept the trade-off: **lower cost now, with manageable automation risk, vs higher cost with official guarantees.**

Questions? Ask for the warm-up checklist.

*This disclosure is included in every Starter/Pro proposal. Keep a signed copy.*


### Medical disclaimer
Alisya is an appointment assistant — not a doctor. No diagnosis, dosage or treatment promises. Refer clinical questions to qualified doctor.
