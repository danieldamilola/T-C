# T&C Lens AI — Architecture (Current)

Credit-based. No subscriptions. No plans. Buy credits, use credits.

> **Status:** Backend live in the `tclens-web` project (Next.js). Extension client-side handler done; the extension auth/settings UI is still "Coming Soon".

---

## How It Works

```
1. User signs in with GitHub/Google (Supabase OAuth) → gets 1 free credit
2. User generates an API key (tcl_live_…) on the dashboard
3. User pastes the key into the extension → Analyze → backend calls DeepSeek → deducts 1 credit
4. Credits run out → "Buy credits" → Lemon Squeezy checkout → webhook adds credits
```

---

## Credit Pricing

| Package | Price | Credits | Per-analysis cost |
|---------|-------|---------|-------------------|
| Starter | $2 | 20 | $0.10 |
| Plus | $5 | 50 | $0.10 |
| Pro | $10 | 150 | ~$0.067 |

> Users get **1 free credit** on first signup. No free tier beyond that.
> DeepSeek (`deepseek-chat`) costs roughly $0.14/M input, $0.28/M output — per analysis ≈ $0.002.
> Server validates price/credits tiers against `VALID_TIERS` in `api/credits/buy/route.ts` — clients cannot tamper.

---

## Architecture

```
Extension (T-C)                      Backend (tclens-web, Next.js + Supabase)
┌──────────────┐                     ┌────────────────────────────────┐
│              │  POST /api/analyze  │                                │
│  Settings UI │ ──────────────────► │  Verify tcl_live_ key hash     │
│  (api key)   │  (Bearer key+text)  │  Check credits > 0             │
│              │                     │  Call DeepSeek (deepseek-chat) │
│              │  ◄───────────────── │  Deduct 1 credit               │
│              │  (analysis JSON)    │                                │
└──────────────┘                     └──────────┬─────────────────────┘
                                                │
                          ┌─────────────────────┼──────────────────────┐
                          │  Supabase            │  Lemon Squeezy        │
                          │  • OAuth (GH/Google) │  • Checkout (hosted)  │
                          │  • profiles/credits  │  • Webhook → credits  │
                          └─────────────────────┴──────────────────────┘
```

**Key model:** users generate a `tcl_live_<48-hex>` key. Only the SHA-256 hash is stored (`api_keys.key_hash`). The server hashes the incoming `Bearer` token and looks it up with a service-role (RLS-bypassing) client.

---

## Database — 3 tables

```sql
-- User profiles (extends Supabase Auth)
CREATE TABLE public.profiles (
    id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email                   TEXT NOT NULL,
    credits                 INTEGER NOT NULL DEFAULT 1,   -- 1 free on signup
    total_purchased_credits INTEGER NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Hashed API keys
CREATE TABLE public.api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    key_hash    TEXT NOT NULL UNIQUE,   -- SHA-256 of tcl_live_<secret>
    prefix      TEXT NOT NULL,          -- 'tcl_live_'
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Payment receipts (Lemon Squeezy)
CREATE TABLE public.billing_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.profiles(id),
    amount_cents    INTEGER NOT NULL,          -- e.g. 200 = $2.00
    credits_added   INTEGER NOT NULL,          -- e.g. 20
    stripe_session_id TEXT NOT NULL,           -- stores ls_<order_id> (column kept for backwards compat)
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API — 4 endpoints (plus webhook)

| Route | Auth | What it does |
|-------|------|-------------|
| `POST /api/analyze` | Bearer `tcl_live_…` | Hash key → check credits → call DeepSeek → deduct 1 → return analysis text. CORS-enabled. |
| `GET /api/credits/balance` | Bearer `tcl_live_…` | Return `{ credits, total_purchased_credits }` — used by the extension's settings credits card. CORS-enabled. |
| `POST /api/credits/buy` | None (server validates) | Validate tier → create Lemon Squeezy checkout → return hosted URL. |
| `POST /api/webhooks/lemonsqueezy` | HMAC `x-signature` | Verify signature → log order → add credits to profile. |

> Supabase Auth itself handles signup/login (`/login` page), so there are no custom `/api/auth/*` endpoints.

---

## Backend Files (tclens-web)

```
src/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts                 ← Key check + credits + DeepSeek proxy
│   │   ├── credits/buy/route.ts             ← Lemon Squeezy checkout creation
│   │   ├── credits/balance/route.ts         ← Credit balance lookup for the extension
│   │   └── webhooks/lemonsqueezy/route.ts   ← Signature-verified credit top-up
│   ├── dashboard/page.tsx                   ← Credits display, buy packs, API key generation
│   ├── dashboard/billing/page.tsx           ← Purchase history
│   ├── login/page.tsx                       ← Supabase OAuth (GitHub/Google)
│   └── page.tsx                             ← Landing page (pricing, features)
└── lib/
    └── supabase.ts                          ← Supabase client (anon key)
```

---

## Extension Changes — status

| File | Status | What |
|------|--------|------|
| `lib/providers.js` | ✅ DONE | `tclens` provider → `https://www.tclens.me/api/analyze` + `creditsUrl` |
| `lib/ai-client.js` | ✅ DONE | `analyzeWithTCLens()` + `fetchTCLensBalance()` |
| `options/options.js` | ✅ DONE | `Infinity` truncation limit; credits card wiring; dynamic tier labels (`free`/`paid`/`own AI`) |
| `options/options.html` | ✅ DONE | Credits card (balance, progress bar, free/paid badge) replaces the old "Coming Soon" banner |
| `options/renderer.js` | ✅ DONE | Dashboard provider cell shows credits left for `tclens` |
| `manifest.json` | ✅ DONE | `https://*.tclens.me` allowed in CSP `connect-src` |

**Remaining work:** none — the hosted provider is fully wired. Users paste their `tcl_live_…` key from the tclens.me dashboard and see their balance live in Settings.

---

## Error codes (from `/api/analyze`)

| Status | Body | Meaning |
|--------|------|---------|
| `400` | `Missing or invalid API key format` | Header missing or not `Bearer tcl_live_…` |
| `401` | `Invalid API key` | Key hash not found in `api_keys` |
| `402` | `Insufficient credits…` | `profiles.credits <= 0` |
| `400` | `Missing text to analyze` | Empty request body |
| `502` | `AI provider error` | DeepSeek call failed |
| `500` | `Internal Server Error` | Unhandled exception |

---

## Decisions (Locked In)

| Decision | Answer |
|----------|--------|
| **Domain** | `www.tclens.me` (landing) + `tclens.me` |
| **Auth** | Supabase OAuth — GitHub + Google, no email/password |
| **Repo** | `tclens-web/` (Next.js, TypeScript, Tailwind) — sibling of `T-C` |
| **AI Model** | DeepSeek `deepseek-chat` (`response_format: json_object`) |
| **Payments** | Lemon Squeezy (hosted checkout + HMAC webhook) — *not* Stripe |
| **Pricing** | Credit-based, no subscriptions |
