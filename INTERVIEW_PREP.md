# Adyen Implementation Engineer — case study prep

This is your companion to the demo. It covers the three things they're scoring:
the **mock technical call**, the **general technical questions**, and the
**consultative qualities** (plus the Adyen Formula). Your TAM background is an
asset here — you already run technical conversations with merchants. This is the
same muscle, pointed at an integration kickoff.

---

## 1. The 30-minute mock call

You're playing the Implementation Engineer; the panel plays a tech-savvy merchant
who wants to accept payments on their e-commerce site with Drop-in. You can't
cover everything in 30 minutes, so lead with structure and let them pull you
deeper where they're curious. A clean arc:

**(2 min) Frame the conversation.** "Before code, let me confirm a few things so I
recommend the right setup." This is the consultative move — you're scoping, not
lecturing. Ask: which markets/currencies, web only or also mobile, which payment
methods matter (cards, wallets, local methods like Pix for Brazil), and do they
want to save cards for returning shoppers. You don't need answers to proceed, but
asking signals you design integrations around the business, not a template.

**(5 min) The big picture — two decisions.** Every Adyen integration is two
independent choices:

- **Client side:** *Drop-in* (one pre-built UI listing all payment methods, least
  effort, 3DS2 built in) vs *Components* (one component per method, you compose
  the UI). Recommend Drop-in for them — fastest path, and they can move to
  Components later without re-architecting the server.
- **Server side:** *Sessions flow* (one API call, Adyen handles the rest) vs
  *Advanced flow* (`/paymentMethods` → `/payments` → `/payments/details`, full
  control). Recommend Sessions — it's Adyen's default and removes most of the
  3DS2 work. Mention Advanced exists for cases needing fine-grained control.

This "two axes" framing is the single most important thing to land. It shows you
understand the architecture, not just one happy path.

**(12 min) Walk the Sessions + Drop-in flow** using the demo. Share your screen,
add a product, go to checkout, and narrate what happens at each hop:

1. Your server calls **`/sessions`** with the amount, reference, country, and
   return URL, using the **secret API key**. Adyen returns `{ id, sessionData }`.
2. The browser initialises `AdyenCheckout({ session, clientKey })` and mounts
   Drop-in. The **clientKey is public**; the API key never leaves your server.
3. Drop-in renders the methods, collects details, and talks to Adyen directly —
   including the 3DS2 challenge — so card data never touches your server (PCI
   scope stays minimal).
4. Adyen sends the **webhook** to your server with the real outcome. You verify
   the HMAC and respond `[accepted]`. *This*, not the browser's `resultCode`, is
   when you mark the order paid.

If you have a few minutes, drop to a test card and let it authorise live. A
working payment on screen is worth more than any slide.

**(5 min) Show the code that matters.** Open `server.js` (`/sessions` call +
webhook) and `checkout.js` (session → Drop-in). Keep it to those two — resist
touring every file.

**(remaining) Hand back.** "What part would be most useful to go deeper on?"
Adapt to where they push.

---

## 2. General technical questions — quick reference

Be ready to explain these plainly. Short, correct, and able to go one level
deeper if asked.

**API / REST.** A contract for two systems to exchange data over HTTP. Adyen's
Checkout API is REST + JSON; you POST a request (e.g. to `/sessions`) with your
API key and get a structured JSON response. Authentication is via the API key in
a header.

**Client vs server.** The client (browser) renders UI and talks to the shopper;
it can't be trusted with secrets because anyone can read it. The server holds
secrets (API key), talks to Adyen, and makes the decisions that involve money.
The whole "clientKey vs apiKey" split is this principle applied.

**Webhooks.** A reverse API call: instead of you polling Adyen "is it paid yet?",
Adyen POSTs to *your* endpoint when something happens (`AUTHORISATION`, `CAPTURE`,
`REFUND`, `CHARGEBACK`). They're asynchronous and the authoritative outcome.
Two must-dos: verify the **HMAC signature** (so you only trust real Adyen calls)
and return **`[accepted]`** (or Adyen retries). Make handling **idempotent** —
the same notification can arrive more than once.

**3D Secure 2 (3DS2).** An extra authentication layer (often biometrics/OTP via
the bank) that shifts fraud liability and is required under SCA in Europe. With
Sessions flow + Drop-in, it's handled for you — a strong reason to recommend that
combo.

**Idempotency.** Sending the same request twice (e.g. a retried network call)
shouldn't create two payments. You pass an idempotency key so Adyen de-dupes.

**Plugins.** Pre-built integrations for platforms like Magento, Shopify, etc., so
merchants on those don't build from scratch. Right answer when a merchant isn't
custom-coding their store.

**Tokenization.** Storing a shopper's card as a token so they can pay again
without re-entering details (and for subscriptions). The card itself stays with
Adyen; you store the token.

**Frameworks.** Adyen Web is framework-agnostic — works with plain JS (like this
demo) or React/Vue/Angular. In React you'd mount Drop-in inside a `useEffect` and
keep the instance in a ref so re-renders don't remount it. (Good place to lean on
your React background if they ask.)

**Capture / auth.** Authorisation reserves the funds; capture actually moves them.
They can be automatic or separated (e.g. capture on shipment).

---

## 3. Consultative qualities + the Adyen Formula

They're explicitly testing whether you **adapt when given new information**. Build
in moments to do that: when they add a constraint ("we're also launching in
Mexico", "we need subscriptions", "we're on Shopify"), pause and adjust your
recommendation out loud rather than pushing your prepared path. That visible
re-routing is the skill they're scoring.

A few consultative habits that read well:

- **Scope before solutioning.** The opening questions above.
- **Recommend, with a reason and a trade-off.** "I'd go Sessions because it
  handles 3DS2 for you; the trade-off is less low-level control, which you can
  get later with Advanced if you need it."
- **Translate tech into business impact.** "Drop-in keeps your PCI scope to SAQ A,
  which means less compliance burden on your team."
- **Be honest about limits.** If asked something you don't know, say how you'd
  find out ("I'd confirm in the API reference / with the team") — far better than
  guessing. Implementation Engineers are trusted precisely because they don't
  bluff.

**The Adyen Formula.** Read it on their site before the call and have one or two
real stories ready. The points that map naturally to your TAM experience:

- *"Win as a team"* — TAM work is cross-functional by nature; have an example of
  unblocking a merchant by coordinating internal teams.
- *"Make it happen"* — a time you drove a stalled integration or migration to done
  (your VTEX/webhook and merchant-onboarding work fits well).
- *"Include different perspectives"* — working across PT/ES/EN merchant
  communications is a clean example.

You don't need to recite the Formula; you need a couple of true stories that
*demonstrate* it when they ask "tell me about a time…".

---

## Likely curveballs (and a calm answer to each)

- **"Where do you store the API key?"** → Server-side, in an env var / secrets
  manager. Never in the front end. (You can show `.env` + `.gitignore`.)
- **"How do you know the payment really succeeded?"** → The webhook, after HMAC
  verification — not the browser `resultCode`.
- **"What if the webhook arrives twice?"** → Idempotent handling keyed on the PSP
  reference; don't double-fulfil.
- **"Can we customise Drop-in's look?"** → Yes, via CSS custom properties in v6;
  or move to Components for full control of the UI.
- **"We need Pix / local methods in Brazil."** → Drop-in renders whatever methods
  are enabled on the merchant account; you enable them in the Customer Area, no
  front-end change. (Nice local-knowledge point for you.)
- **"Why minor units?"** → Amounts are integers in the currency's smallest unit
  (R$ 209,99 → `20999`) to avoid floating-point rounding errors with money.

Good luck — you've got the technical base and the merchant-facing instinct this
role is built on. 🐾
