/* Resgatinhos — Adyen Web Drop-in (v6) client integration, Sessions flow.
   Flow:
   1. Read the cart from localStorage and render the order summary.
   2. Ask OUR backend to create an Adyen session (POST /api/sessions).
      The backend holds the API key and calls Adyen's /sessions endpoint.
   3. Initialise AdyenCheckout with { session, clientKey } and mount Drop-in.
   The clientKey is public; the API key never reaches the browser. */

(function () {
  "use strict";

  var STORAGE_KEY = "resgatinhos_cart";

  function loadCart() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch (e) { return []; }
  }

  function formatBRL(minor) {
    return "R$ " + (minor / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }

  function cartTotal(cart) {
    return cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
  }

  function showStatus(type, html) {
    var el = document.getElementById("status-msg");
    el.className = "alert alert-" + type;
    el.innerHTML = html;
  }

  function renderSummary(cart) {
    var box = document.getElementById("resumo-itens");
    box.innerHTML = cart.map(function (i) {
      return '<div class="d-flex justify-content-between mb-2">' +
        "<span>" + i.qty + "× " + i.name + "</span>" +
        "<span>" + formatBRL(i.price * i.qty) + "</span></div>";
    }).join("");
    document.getElementById("resumo-total").textContent = formatBRL(cartTotal(cart));
  }

  async function start() {
    var cart = loadCart();

    if (!cart.length) {
      showStatus("warning",
        'Seu carrinho está vazio. <a href="./index.html" class="alert-link">Voltar à loja</a>.');
      return;
    }

    renderSummary(cart);

    var amount = { currency: "BRL", value: cartTotal(cart) };

    try {
      // 1. Public config from our server (clientKey + environment)
      var configRes = await fetch("/api/config");
      var config = await configRes.json();

      // 2. Create a payment session on our backend
      var sessionRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amount }),
      });

      if (!sessionRes.ok) {
        var err = await sessionRes.json().catch(function () { return {}; });
        throw new Error(err.message || "Não foi possível iniciar o pagamento.");
      }
      var session = await sessionRes.json(); // { id, sessionData }

      // 3. Initialise Adyen Web (v6) and mount Drop-in
      var { AdyenCheckout, Dropin } = window.AdyenWeb;

      var checkout = await AdyenCheckout({
        environment: config.environment,        // "test"
        clientKey: config.clientKey,             // public key
        countryCode: "BR",                       // mandatory in v6
        locale: "pt-BR",
        analytics: { enabled: false },           // avoid ERR_BLOCKED_BY_CLIENT crash
        session: {
          id: session.id,
          sessionData: session.sessionData,
        },
        onPaymentCompleted: function (result) {
          handleResult(result.resultCode);
        },
        onPaymentFailed: function (result) {
          handleResult(result && result.resultCode);
        },
        onError: function (error) {
          console.error(error);
          showStatus("danger", "Erro: " + error.message);
        },
      });

      new Dropin(checkout, {
        // optional: show stored cards, set order of payment methods, etc.
      }).mount("#dropin-container");

    } catch (e) {
      console.error(e);
      showStatus("danger", e.message);
    }
  }

  function handleResult(resultCode) {
    // resultCode: Authorised | Refused | Pending | Received | Cancelled | Error
    if (resultCode === "Authorised") {
      localStorage.removeItem(STORAGE_KEY);
      showStatus("success",
        '<i class="bi bi-check-circle-fill me-1"></i>Pagamento aprovado! Obrigada pela compra 🐾 ' +
        '<a href="./index.html" class="alert-link">Voltar à loja</a>.');
    } else if (resultCode === "Pending" || resultCode === "Received") {
      showStatus("info", "Pagamento pendente de confirmação. Avisaremos por e-mail.");
    } else if (resultCode === "Refused") {
      showStatus("danger", "Pagamento recusado. Tente outro método ou cartão.");
    } else {
      showStatus("warning", "Pagamento não concluído (" + (resultCode || "desconhecido") + ").");
    }
  }

  document.addEventListener("DOMContentLoaded", start);
})();
