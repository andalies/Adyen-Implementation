# Resgatinhos × Adyen — Web Drop-in demo

A working **Adyen Web Drop-in** integration (Sessions flow) built on top of the
Resgatinhos cat-store front end. Built for the Adyen Implementation Engineer
case study: a real, runnable artifact you can screen-share and walk through.

## What it shows

- A shopper adds cat products to a cart (BRL).
- At checkout, the browser asks **our** server to create an Adyen session.
- Adyen's Drop-in renders the available payment methods and handles the whole
  payment — including 3D Secure 2 — by itself.
- A webhook endpoint receives the real, asynchronous outcome and verifies its HMAC.

## Run it

```bash
npm install
npm start
```

Then open **http://localhost:8080**.

Credentials are already in `.env` (the test account from the case study).
`.env` is gitignored — don't commit it.

## Test it

Add something to the cart → **Finalizar compra**. Use an Adyen test card:

| Field        | Value                                   |
| ------------ | --------------------------------------- |
| Card number  | `4111 1111 1111 1111` (Visa)            |
| Expiry       | any future date, e.g. `03/30`           |
| CVC          | `737`                                   |
| 3DS password | `password` (if challenged)              |

Full list: https://docs.adyen.com/development-resources/testing/test-card-numbers

## Architecture (who does what)

```
Browser (public)                         Your server (secret)            Adyen
─────────────────                        ────────────────────            ─────
cart.js  ── total ──▶ checkout.js
                         │  POST /api/sessions ─────▶ server.js
                         │                              │  apiKey ──▶ POST /sessions
                         │                              │   ◀── { id, sessionData }
                         │  ◀── { id, sessionData } ────┘
                         ▼
              AdyenCheckout({ session, clientKey })
              new Dropin(...).mount("#dropin-container")
              (Drop-in talks to Adyen directly, incl. 3DS2)
                         │
                         ▼ payment outcome (UX only)
              onPaymentCompleted / onPaymentFailed

                                          server.js  ◀── POST /api/webhooks ── Adyen
                                          (verify HMAC, [accepted])   ← source of truth
```

The two non-negotiables this demo makes concrete:

1. **The API key is server-side only.** The browser gets the *public* clientKey.
   Anyone can read clientKey in dev tools; it can't move money.
2. **The webhook is the source of truth.** The `resultCode` the shopper sees is
   for UX. The order is only truly paid when the `AUTHORISATION` webhook arrives
   with `success: true`.

## Files

| File                    | Role                                                        |
| ----------------------- | ----------------------------------------------------------- |
| `server.js`             | Express: `/api/config`, `/api/sessions`, `/api/webhooks`    |
| `public/index.html`     | The store (cart button + drawer added)                      |
| `public/cart.js`        | Cart logic (localStorage, BRL minor units)                  |
| `public/checkout.html`  | Order summary + Drop-in mount point                         |
| `public/checkout.js`    | Creates the session, initialises Drop-in (v6 Sessions flow) |
| `public/result.html`    | Return URL — finalises redirect-based methods (3DS, Pix)    |

## Versions

- Adyen Web **6.39** (loaded from Adyen's test CDN)
- `@adyen/api-library` **30.x** (server)
- Checkout API session endpoint
