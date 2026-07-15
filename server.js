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

// In-memory payment tracker (demo only — use a DB in production)
const payments = [];

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

    const reference = "resgatinhos-" + Date.now();

    const response = await checkout.PaymentsApi.sessions(
      {
        merchantAccount: ADYEN_MERCHANT_ACCOUNT,
        amount, // value is in MINOR units (centavos)
        reference,
        returnUrl: `${baseUrl}/result.html`,
        countryCode: "BR",
        channel: "Web",
      },
      { idempotencyKey: reference } // avoid duplicate sessions
    );

    // Track the payment
    payments.push({
      reference,
      sessionId: response.id,
      amount,
      status: "PENDING",
      pspReference: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [{ type: "SESSION_CREATED", time: new Date().toISOString() }],
    });

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

  // Update tracked payment
  const payment = payments.find((p) => p.reference === merchantReference);
  if (payment) {
    payment.pspReference = pspReference;
    payment.updatedAt = new Date().toISOString();
    payment.events.push({
      type: eventCode,
      success: success === "true",
      time: new Date().toISOString(),
    });

    if (eventCode === "AUTHORISATION") {
      payment.status = success === "true" ? "AUTHORISED" : "REFUSED";
    } else if (eventCode === "CAPTURE") {
      payment.status = success === "true" ? "CAPTURED" : "CAPTURE_FAILED";
    } else if (eventCode === "REFUND") {
      payment.status = success === "true" ? "REFUNDED" : "REFUND_FAILED";
    } else if (eventCode === "CANCELLATION") {
      payment.status = success === "true" ? "CANCELLED" : payment.status;
    } else if (eventCode === "CHARGEBACK") {
      payment.status = "CHARGEBACK";
    }
  }

  // Adyen requires this exact acknowledgement, or it will retry.
  res.send("[accepted]");
});

/**
 * Client-side result update. The Drop-in reports the resultCode here so we can
 * update the status before the webhook arrives (webhook is still source of truth).
 */
app.post("/api/status", (req, res) => {
  const { sessionId, resultCode } = req.body;
  const payment = payments.find((p) => p.sessionId === sessionId);
  if (payment && payment.status === "PENDING") {
    payment.status = resultCode;
    payment.updatedAt = new Date().toISOString();
    payment.events.push({
      type: "CLIENT_RESULT",
      resultCode,
      time: new Date().toISOString(),
    });
  }
  res.json({ ok: true });
});

/**
 * Payment status list for the status page.
 */
app.get("/api/payments", (req, res) => {
  res.json(payments.slice().reverse());
});

app.listen(PORT, () => {
  console.log(`\n🐾 Resgatinhos running at http://localhost:${PORT}\n`);
});
