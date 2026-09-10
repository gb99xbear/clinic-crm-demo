# Klinik CRM — Demo (Public) — GP & Dental

> ⚠️ **Demo only — mock data 66 patients.** Real Klinik CRM (isolated from CampusBridge, same engine) is private. This demo is a browser-only clone tuned for GP & Dental.

Live demo: **https://gb99xbear.github.io/clinic-crm-demo/** (once published)

## What you see
- Cream paper #f6f1e8 + teal #0f3d3e, Fraunces — same design as CampusBridge production
- Pipeline **5 stages**: New → Qualified → Appointment → Treated → Lost (GP/Dental)
- Inbox Alisya (booking/reminder/no-show), Referrals (ex-School Partners), 66 mock patients
- Pipeline kanban 8/page, dashboard, 66 mock patients (no real data)
- No backend, no secrets — all in-browser `mock.js`

## How it's different from CampusBridge
- **CampusBridge**: 9 stages (counselling → enrolled), school partners, education docs
- **Klinik**: 5 stages, referral partners, IC / history / consent / xray / insurance
- Same engine: FastAPI + vanilla HTML/CSS/JS, WAHA multi-device (max 5), Alisya 20-exchange memory

## Packages
- Starter RM599 + RM99/mo · Pro RM999 + RM199/mo · Self-host RM2,500

## Tech
- Frontend: vanilla HTML/CSS/JS (no npm)
- Demo data: `mock.js` intercepts `fetch` — `any password works` for login

## Medical note
Alisya helps with booking & reminders only — not diagnosis or prescription.
