/**
 * Resgatinhos × Adyen — backend (Sessions flow)
 *
 * Responsibilities that MUST live on the server:
 *   - Holds the secret API key (never sent to the browser).
 *   - Creates payment sessions by calling Adyen's /sessions endpoint.
 *   - Receives asynchronous webhook notifications and verifies their HMAC.
 *
 * The browser only ever sees the public clientKey + the session {id, sessionData}.
 */

require("dotenv").config();
const express = require("express");
const path = require("path");
const { Client, CheckoutAPI, hmacValidator } = require("@adyen/api-library");

const {
  ADYEN_API_KEY,
  ADYEN_MERCHANT_ACCOUNT,
  ADYEN_CLIENT_KEY,
  ADYEN_HMAC_KEY,
  PORT = 8080,
} = process.env;

if (!ADYEN_API_KEY || !ADYEN_MERCHANT_ACCOUNT || !ADYEN_CLIENT_KEY) {
  console.warn(
    "\n[!] Missing Adyen credentials. Copy .env.example to .env and fill it in.\n"
  );
}

// --- Adyen client (TEST environment) ---
const client = new Client({ apiKey: ADYEN_API_KEY, environment: "TEST" });
const checkout = new CheckoutAPI(client);

const app = express();
// Keep the raw body so we can also inspect/verify webhooks if needed.
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/**
 * Public config for the browser. The clientKey is NOT a secret — it identifies
 * your account to the client-side SDK but cannot be used to move money.
 */
app.get("/api/config", (req, res) => {
  res.json({ clientKey: ADYEN_CLIENT_KEY, environment: "test" });
});

/**
 * Create a payment session.
 * One server call to /sessions returns { id, sessionData } which the
 * Drop-in uses to drive the whole payment (incl. 3D Secure 2) by itself.
 */
app.post("/api/sessions", async (req, res) => {
  try {
    const { amount } = req.body; // { currency: "BRL", value: 20999 }
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const response = await checkout.PaymentsApi.sessions(
      {
        merchantAccount: ADYEN_MERCHANT_ACCOUNT,
        amount, // value is in MINOR units (centavos)
        reference: "resgatinhos-" + Date.now(),
        returnUrl: `${baseUrl}/result.html`,
        countryCode: "BR",
        channel: "Web",
      },
      { idempotencyKey: "resgatinhos-" + Date.now() } // avoid duplicate sessions
    );

    // Only forward what the client needs.
    res.json({ id: response.id, sessionData: response.sessionData });
  } catch (err) {
    console.error("sessions error:", err.message);
    res.status(502).json({
      message:
        "Could not reach Adyen to create a session. Check your API key / network. (" +
        err.message +
        ")",
    });
  }
});

/**
 * Webhook endpoint. Adyen sends the REAL payment outcome here asynchronously.
 * The client-side resultCode is for UX only — this is the source of truth.
 * Always: (1) verify HMAC, (2) act on eventCode, (3) respond [accepted].
 */
const validator = new hmacValidator();

app.post("/api/webhooks", (req, res) => {
  const notification = req.body.notificationItems?.[0]?.NotificationRequestItem;

  if (!notification) {
    return res.status(400).send("Malformed notification");
  }

  // Verify the signature so you only trust genuine Adyen calls.
  if (ADYEN_HMAC_KEY) {
    const valid = validator.validateHMAC(notification, ADYEN_HMAC_KEY);
    if (!valid) {
      console.warn("HMAC validation FAILED — ignoring notification");
      return res.status(401).send("Invalid HMAC");
    }
  }

  const { eventCode, success, merchantReference, pspReference } = notification;
  console.log(
    `[webhook] ${eventCode} success=${success} ref=${merchantReference} psp=${pspReference}`
  );

  // TODO (production): update order status in your DB based on eventCode:
  //   AUTHORISATION + success=true  -> mark order paid, fulfil
  //   AUTHORISATION + success=false -> mark failed
  //   CAPTURE / REFUND / CHARGEBACK -> reconcile accordingly

  // Adyen requires this exact acknowledgement, or it will retry.
  res.send("[accepted]");
});

app.listen(PORT, () => {
  console.log(`\n🐾 Resgatinhos running at http://localhost:${PORT}\n`);
});
