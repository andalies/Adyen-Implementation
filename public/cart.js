/* Resgatinhos — minimal shopping cart
   Wires the existing "Adicionar ao Carrinho" buttons to a localStorage cart,
   renders the offcanvas drawer, and feeds the total into the Adyen checkout.
   Currency is BRL; amounts are tracked in minor units (centavos). */

(function () {
  "use strict";

  var STORAGE_KEY = "resgatinhos_cart";
  var CURRENCY = "BRL";

  // "R$ 1.209,99" -> 120999 (centavos)
  function parsePriceToMinorUnits(text) {
    var cleaned = (text || "")
      .replace(/[^0-9.,]/g, "") // drop "R$" and spaces
      .replace(/\./g, "")       // drop thousands separator
      .replace(",", ".");       // decimal comma -> dot
    var value = parseFloat(cleaned);
    if (isNaN(value)) return 0;
    return Math.round(value * 100);
  }

  // 20999 -> "R$ 209,99"
  function formatBRL(minorUnits) {
    return (
      "R$ " +
      (minorUnits / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }

  function cartTotal(cart) {
    return cart.reduce(function (sum, item) {
      return sum + item.price * item.qty;
    }, 0);
  }

  function cartCount(cart) {
    return cart.reduce(function (sum, item) {
      return sum + item.qty;
    }, 0);
  }

  function addToCart(name, price) {
    var cart = loadCart();
    var existing = cart.filter(function (i) { return i.name === name; })[0];
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({ name: name, price: price, qty: 1 });
    }
    saveCart(cart);
    render();
  }

  function changeQty(name, delta) {
    var cart = loadCart();
    var item = cart.filter(function (i) { return i.name === name; })[0];
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      cart = cart.filter(function (i) { return i.name !== name; });
    }
    saveCart(cart);
    render();
  }

  function render() {
    var cart = loadCart();
    var total = cartTotal(cart);
    var count = cartCount(cart);

    // Badge
    var badge = document.getElementById("cart-badge");
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle("d-none", count === 0);
    }

    // Items
    var container = document.getElementById("cart-items");
    if (container) {
      if (cart.length === 0) {
        container.innerHTML =
          '<p id="cart-empty" class="text-center text-muted mt-4">Seu carrinho está vazio 🐾</p>';
      } else {
        container.innerHTML = cart
          .map(function (item) {
            return (
              '<div class="d-flex justify-content-between align-items-center mb-3">' +
              '<div class="me-2"><div class="fw-bold">' + item.name + "</div>" +
              '<small class="text-muted">' + formatBRL(item.price) + "</small></div>" +
              '<div class="d-flex align-items-center">' +
              '<button class="btn btn-sm btn-light qty-btn" data-name="' + item.name + '" data-delta="-1">−</button>' +
              '<span class="mx-2">' + item.qty + "</span>" +
              '<button class="btn btn-sm btn-light qty-btn" data-name="' + item.name + '" data-delta="1">+</button>' +
              "</div></div>"
            );
          })
          .join("");
      }
    }

    // Total
    var totalEl = document.getElementById("cart-total");
    if (totalEl) totalEl.textContent = formatBRL(total);

    // Checkout button enable/disable
    var checkoutBtn = document.getElementById("ir-checkout");
    if (checkoutBtn) {
      checkoutBtn.classList.toggle("disabled", cart.length === 0);
      checkoutBtn.setAttribute("aria-disabled", cart.length === 0 ? "true" : "false");
    }
  }

  function wireProductButtons() {
    var section = document.getElementById("produtos");
    if (!section) return;
    var cards = section.querySelectorAll(".card");

    Array.prototype.forEach.call(cards, function (card) {
      var titleEl = card.querySelector(".card-title");
      var btn = card.querySelector("a.btn, button.btn");
      // price = the paragraph containing "R$"
      var priceEl = Array.prototype.filter.call(
        card.querySelectorAll("p"),
        function (p) { return /R\$/.test(p.textContent); }
      )[0];

      if (!titleEl || !btn || !priceEl) return;

      var name = titleEl.textContent.trim();
      var price = parsePriceToMinorUnits(priceEl.textContent);

      btn.addEventListener("click", function (e) {
        e.preventDefault();
        addToCart(name, price);
        // Open the cart drawer so the shopper sees feedback
        var drawerEl = document.getElementById("carrinho");
        if (drawerEl && window.bootstrap) {
          window.bootstrap.Offcanvas.getOrCreateInstance(drawerEl).show();
        }
      });
    });
  }

  // Delegated handler for +/- buttons inside the drawer
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".qty-btn");
    if (!btn) return;
    changeQty(btn.getAttribute("data-name"), parseInt(btn.getAttribute("data-delta"), 10));
  });

  document.addEventListener("DOMContentLoaded", function () {
    wireProductButtons();
    render();
  });
})();
