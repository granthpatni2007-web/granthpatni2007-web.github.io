const products = [
  {
    id: "bura",
    name: "Bura",
    price: 120,
    description: "Traditional recipe made with premium ingredients. Perfect for sharing or gifting."
  },
  {
    id: "bhujia",
    name: "Bhujia",
    price: 400,
    description: "Crisp, savory, and full of classic spice. A tea-time favorite for every home."
  },
  {
    id: "sawali",
    name: "Sawali",
    price: 340,
    description: "A delightful festive sweet with a smooth bite and rich traditional flavor."
  },
  {
    id: "besan-chakki",
    name: "Besan Chakki",
    price: 600,
    description: "Dense, nutty, and indulgent. Crafted for celebrations, gifting, and special occasions."
  },
  {
    id: "shakkarpara",
    name: "Shakkarpara",
    price: 360,
    description: "Golden, sweet, and crunchy. Ideal for festive snack boxes and afternoon cravings."
  },
  {
    id: "petha",
    name: "Petha",
    price: 380,
    description: "Soft and refreshing with a delicate sweetness that feels light after every bite."
  },
  {
    id: "methi-mathri",
    name: "Methi Mathri",
    price: 320,
    description: "Flaky, savory, and seasoned with fenugreek for a familiar homemade taste."
  },
  {
    id: "dry-kachori",
    name: "Dry Kachori",
    price: 450,
    description: "A bold, crunchy snack with deep masala notes and long-lasting freshness."
  }
];

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const storageKey = "Antarmana-cart";
const ordersStorageKey = "Antarmana-orders";
const cart = loadCart();

const productGrid = document.getElementById("productGrid");
const cartDrawer = document.getElementById("cartDrawer");
const overlay = document.getElementById("overlay");
const cartButton = document.getElementById("cartButton");
const closeCartButton = document.getElementById("closeCartButton");
const continueShoppingButton = document.getElementById("continueShoppingButton");
const drawerCheckoutButton = document.getElementById("drawerCheckoutButton");
const heroCheckoutButton = document.getElementById("heroCheckoutButton");
const backToCartButton = document.getElementById("backToCartButton");
const cartBadge = document.getElementById("cartBadge");
const cartItems = document.getElementById("cartItems");
const drawerSubtotal = document.getElementById("drawerSubtotal");
const drawerShipping = document.getElementById("drawerShipping");
const drawerTotal = document.getElementById("drawerTotal");
const summaryItems = document.getElementById("summaryItems");
const summarySubtotal = document.getElementById("summarySubtotal");
const summaryShipping = document.getElementById("summaryShipping");
const summaryTotal = document.getElementById("summaryTotal");
const paymentTabs = document.querySelectorAll(".payment-tab");
const paymentPanels = document.querySelectorAll(".payment-panel");
const paymentActionButtons = document.querySelectorAll("[data-complete-payment]");
const navLinks = document.querySelectorAll(".nav-link");
const checkoutForm = document.getElementById("checkoutForm");
const toast = document.getElementById("toast");
const featuredPriceLabel = document.querySelector(".hero-card-featured strong");
const placeOrderButton = document.getElementById("placeOrderButton");
const paymentStatusBox = document.getElementById("paymentStatusBox");
const paymentStatusTitle = document.getElementById("paymentStatusTitle");
const paymentStatusText = document.getElementById("paymentStatusText");
let paymentState = createPendingPaymentState("cod");

if (closeCartButton) {
  closeCartButton.innerHTML = "&times;";
}

if (featuredPriceLabel) {
  featuredPriceLabel.textContent = `${currency.format(600)} / kg`;
}

renderProducts();
renderCart();
setupScrollSpy();
updatePaymentGate();

productGrid.addEventListener("click", handleProductGridClick);
cartItems.addEventListener("click", handleCartClick);
paymentTabs.forEach((button) => button.addEventListener("click", () => setActivePayment(button.dataset.payment)));
paymentActionButtons.forEach((button) => {
  button.addEventListener("click", () => completePayment(button.dataset.completePayment));
});
checkoutForm.addEventListener("submit", handleCheckoutSubmit);
cartButton.addEventListener("click", openCart);
closeCartButton.addEventListener("click", closeCart);
continueShoppingButton.addEventListener("click", closeCart);
overlay.addEventListener("click", closeCart);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCart();
  }
});
drawerCheckoutButton.addEventListener("click", () => {
  closeCart();
  document.getElementById("payment").scrollIntoView({ behavior: "smooth", block: "start" });
});
heroCheckoutButton.addEventListener("click", () => {
  if (getCartTotals().itemCount === 0) {
    document.getElementById("price-list").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  openCart();
});
backToCartButton.addEventListener("click", openCart);

function trackAnalyticsEvent(eventName, details = {}) {
  window.siteAnalytics?.trackEvent(eventName, details);
}

function renderProducts() {
  productGrid.innerHTML = products
    .map(
      (product) => `
        <article class="product-card" data-product-id="${product.id}">
          <div class="product-card-top">
            <h3>${product.name}</h3>
            <p class="product-price">${currency.format(product.price)}/kg</p>
          </div>
          <div class="product-card-body">
            <p>${product.description}</p>
            <div class="product-footer">
              <div class="qty-control">
                <strong>Qty:</strong>
                <div class="stepper" aria-label="Quantity selector for ${product.name}">
                  <button class="qty-button" type="button" data-action="decrease">−</button>
                  <span class="qty-value">1</span>
                  <button class="qty-button" type="button" data-action="increase">+</button>
                </div>
              </div>
              <button class="primary-button add-button" type="button" data-action="add">
                Add to Cart
              </button>
            </div>
          </div>
        </article>
      `
    )
    .join("");

  productGrid.querySelectorAll('[data-action="decrease"]').forEach((button) => {
    button.textContent = "-";
  });
}

function handleProductGridClick(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }

  const card = actionButton.closest(".product-card");
  const productId = card?.dataset.productId;
  if (!productId) {
    return;
  }

  const qtyValue = card.querySelector(".qty-value");
  const currentQty = Number(qtyValue.textContent);
  const action = actionButton.dataset.action;

  if (action === "increase") {
    qtyValue.textContent = String(currentQty + 1);
    return;
  }

  if (action === "decrease") {
    qtyValue.textContent = String(Math.max(1, currentQty - 1));
    return;
  }

  if (action === "add") {
    addToCart(productId, currentQty);
    trackAnalyticsEvent("add_to_cart", {
      productId,
      productName: findProduct(productId)?.name || productId,
      quantity: currentQty
    });
    showToast(`${findProduct(productId).name} added to cart`);
    openCart();
  }
}

function addToCart(productId, quantity) {
  const product = findProduct(productId);
  if (!product) {
    return;
  }

  cart[productId] = (cart[productId] || 0) + quantity;
  saveCart();
  renderCart();
  resetPaymentState(getActivePaymentMethod());
}

function handleCartClick(event) {
  const button = event.target.closest("[data-cart-action]");
  if (!button) {
    return;
  }

  const productId = button.dataset.productId;
  const action = button.dataset.cartAction;
  if (!productId || !cart[productId]) {
    return;
  }

  if (action === "increase") {
    cart[productId] += 1;
  }

  if (action === "decrease") {
    cart[productId] -= 1;
    if (cart[productId] <= 0) {
      delete cart[productId];
    }
  }

  if (action === "remove") {
    delete cart[productId];
  }

  saveCart();
  renderCart();
  resetPaymentState(getActivePaymentMethod());
}

function renderCart() {
  const entries = Object.entries(cart);
  const totals = getCartTotals();

  cartBadge.textContent = String(totals.itemCount);
  cartBadge.hidden = totals.itemCount === 0;

  drawerSubtotal.textContent = currency.format(totals.subtotal);
  drawerShipping.textContent = currency.format(totals.shipping);
  drawerTotal.textContent = currency.format(totals.total);

  summarySubtotal.textContent = currency.format(totals.subtotal);
  summaryShipping.textContent = currency.format(totals.shipping);
  summaryTotal.textContent = currency.format(totals.total);

  drawerCheckoutButton.disabled = totals.itemCount === 0;
  drawerCheckoutButton.style.opacity = totals.itemCount === 0 ? "0.6" : "1";
  drawerCheckoutButton.style.pointerEvents = totals.itemCount === 0 ? "none" : "auto";
  updatePaymentGate();

  if (!entries.length) {
    const emptyMarkup = `
      <div class="empty-state">
        Your cart is empty. Add sweets or snacks from the price list to start building your order.
      </div>
    `;

    cartItems.innerHTML = emptyMarkup;
    summaryItems.innerHTML = emptyMarkup;
    return;
  }

  cartItems.innerHTML = entries
    .map(([productId, quantity]) => {
      const product = findProduct(productId);
      const lineTotal = product.price * quantity;

      return `
        <article class="cart-item">
          <div class="cart-item-top">
            <div>
              <strong>${product.name}</strong>
              <span>${currency.format(product.price)}/kg</span>
            </div>
            <strong>${currency.format(lineTotal)}</strong>
          </div>
          <div class="cart-item-footer">
            <div class="cart-item-actions">
              <button class="mini-button" type="button" data-cart-action="decrease" data-product-id="${productId}">−</button>
              <span>${quantity} kg</span>
              <button class="mini-button" type="button" data-cart-action="increase" data-product-id="${productId}">+</button>
            </div>
            <button class="mini-button remove-button" type="button" data-cart-action="remove" data-product-id="${productId}">
              Remove
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  cartItems.querySelectorAll('[data-cart-action="decrease"]').forEach((button) => {
    button.textContent = "-";
  });

  summaryItems.innerHTML = entries
    .map(([productId, quantity]) => {
      const product = findProduct(productId);
      const lineTotal = product.price * quantity;

      return `
        <article class="summary-item">
          <div class="summary-item-top">
            <div>
              <strong>${product.name}</strong>
              <span>${quantity} kg</span>
            </div>
            <strong>${currency.format(lineTotal)}</strong>
          </div>
        </article>
      `;
    })
    .join("");
}

function getCartTotals() {
  const subtotal = Object.entries(cart).reduce((sum, [productId, quantity]) => {
    const product = findProduct(productId);
    return sum + (product ? product.price * quantity : 0);
  }, 0);

  const itemCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const shipping = 0;
  const total = subtotal + shipping;

  return { subtotal, shipping, total, itemCount };
}

function findProduct(productId) {
  return products.find((product) => product.id === productId);
}

function openCart() {
  const totals = getCartTotals();
  cartDrawer.classList.add("open");
  cartDrawer.setAttribute("aria-hidden", "false");
  cartButton.setAttribute("aria-expanded", "true");
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  trackAnalyticsEvent("cart_opened", {
    itemCount: totals.itemCount,
    total: totals.total
  });
}

function closeCart() {
  cartDrawer.classList.remove("open");
  cartDrawer.setAttribute("aria-hidden", "true");
  cartButton.setAttribute("aria-expanded", "false");
  overlay.hidden = true;
  document.body.style.overflow = "";
}

function setActivePayment(paymentType) {
  paymentTabs.forEach((button) => {
    const isActive = button.dataset.payment === paymentType;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  paymentPanels.forEach((panel) => {
    const isActive = panel.id === `payment-${paymentType}`;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });

  if (paymentState.method !== paymentType) {
    resetPaymentState(paymentType);
    return;
  }

  updatePaymentGate();
}

function createPendingPaymentState(method) {
  return {
    method,
    paid: false,
    paidAt: "",
    reference: ""
  };
}

function resetPaymentState(method) {
  paymentState = createPendingPaymentState(method);
  updatePaymentGate();
}

function getActivePaymentMethod() {
  return document.querySelector(".payment-tab.active")?.dataset.payment || "cod";
}

function isPaymentCompleted(method) {
  return paymentState.paid && paymentState.method === method;
}

function completePayment(method) {
  const totals = getCartTotals();
  if (totals.itemCount === 0) {
    showToast("Add products to the cart before completing payment");
    return;
  }

  paymentState = {
    method,
    paid: true,
    paidAt: new Date().toISOString(),
    reference: createPaymentReference(method)
  };

  trackAnalyticsEvent("payment_completed", {
    method,
    reference: paymentState.reference,
    total: totals.total
  });
  updatePaymentGate();
  showToast(
    method === "cod"
      ? "Cash on delivery selected"
      : `${getPaymentLabel(method)} confirmed`
  );
}

function createPaymentReference(method) {
  const prefix = method.toUpperCase();
  const stamp = Date.now().toString().slice(-8);
  return `${prefix}-${stamp}`;
}

function updatePaymentGate() {
  const activePayment = getActivePaymentMethod();
  const totals = getCartTotals();
  const hasItems = totals.itemCount > 0;
  const paymentReady = hasItems && isPaymentCompleted(activePayment);

  placeOrderButton.disabled = !paymentReady;
  placeOrderButton.style.opacity = paymentReady ? "1" : "0.6";
  placeOrderButton.style.pointerEvents = paymentReady ? "auto" : "none";

  paymentActionButtons.forEach((button) => {
    button.disabled = !hasItems;
    button.style.opacity = hasItems ? "1" : "0.6";
    button.style.pointerEvents = hasItems ? "auto" : "none";
  });

  paymentStatusBox.classList.toggle("is-paid", paymentReady);

  if (!hasItems) {
    paymentStatusTitle.textContent = "Payment Method Pending";
    paymentStatusText.textContent =
      "Add items to the cart before choosing cash on delivery or QR payment.";
    return;
  }

  if (paymentReady) {
    if (activePayment === "cod") {
      paymentStatusTitle.textContent = "Cash on Delivery Selected";
      paymentStatusText.textContent =
        "Cash on delivery is selected. You can place the order now.";
      return;
    }

    paymentStatusTitle.textContent = "QR Payment Confirmed";
    paymentStatusText.textContent = `Payment reference ${paymentState.reference} confirmed. You can place the order now.`;
    return;
  }

  paymentStatusTitle.textContent =
    activePayment === "cod" ? "Cash on Delivery Pending" : "QR Payment Pending";
  paymentStatusText.textContent =
    activePayment === "cod"
      ? "Select cash on delivery first to unlock order placement."
      : "Confirm QR payment first to unlock order placement.";
}

function handleCheckoutSubmit(event) {
  event.preventDefault();

  const totals = getCartTotals();
  if (totals.itemCount === 0) {
    showToast("Add products to the cart before placing an order");
    return;
  }

  if (!checkoutForm.reportValidity()) {
    return;
  }

  const activePayment = document.querySelector(".payment-tab.active")?.dataset.payment || "cod";
  if (!isPaymentCompleted(activePayment)) {
    showToast(
      activePayment === "cod"
        ? "Select cash on delivery first before placing the order"
        : "Confirm QR payment first before placing the order"
    );
    updatePaymentGate();
    return;
  }

  const formData = new FormData(checkoutForm);
  const order = buildOrderPayload(formData, activePayment, totals);

  saveOrder(order);
  trackAnalyticsEvent("order_submitted", {
    orderId: order.id,
    paymentMethod: order.paymentMethod,
    total: order.total,
    itemCount: order.items.length
  });
  showToast(`Order ${order.id} saved for the owner dashboard`);
  checkoutForm.reset();
  closeCart();

  Object.keys(cart).forEach((key) => delete cart[key]);
  saveCart();
  renderCart();
  resetPaymentState("cod");
  setActivePayment("cod");
  document.getElementById("home").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function loadCart() {
  try {
    const savedValue = window.localStorage.getItem(storageKey);
    return savedValue ? JSON.parse(savedValue) : {};
  } catch {
    return {};
  }
}

function saveCart() {
  window.localStorage.setItem(storageKey, JSON.stringify(cart));
}

function loadOrders() {
  try {
    const savedValue = window.localStorage.getItem(ordersStorageKey);
    return savedValue ? JSON.parse(savedValue) : [];
  } catch {
    return [];
  }
}

function saveOrder(order) {
  const orders = loadOrders();
  orders.unshift(order);
  window.localStorage.setItem(ordersStorageKey, JSON.stringify(orders));
}

function buildOrderPayload(formData, paymentType, totals) {
  const items = Object.entries(cart).map(([productId, quantity]) => {
    const product = findProduct(productId);

    return {
      id: product.id,
      name: product.name,
      price: product.price,
      quantity,
      lineTotal: product.price * quantity
    };
  });

  const customer = {
    name: String(formData.get("fullName") || "").trim(),
    phone: String(formData.get("phone") || "").trim()
  };

  const address = {
    street: String(formData.get("street") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    postalCode: String(formData.get("postalCode") || "").trim(),
    instructions: String(formData.get("instructions") || "").trim()
  };

  return {
    id: createOrderId(),
    placedAt: new Date().toISOString(),
    source: "Website checkout",
    status: "new",
    paymentMethod: paymentType,
    paymentLabel: getPaymentLabel(paymentType),
    paymentStatus: paymentType === "cod" ? "pending" : "paid",
    paymentReference: paymentType === "cod" ? "" : paymentState.reference,
    paymentPaidAt: paymentType === "cod" ? "" : paymentState.paidAt,
    customer,
    address,
    items,
    subtotal: totals.subtotal,
    shipping: totals.shipping,
    total: totals.total
  };
}

function createOrderId() {
  const stamp = Date.now().toString().slice(-6);
  return `SP-${stamp}`;
}

function getPaymentLabel(paymentType) {
  if (paymentType === "cod") {
    return "Cash on Delivery";
  }

  return "QR Payment";
}

function setupScrollSpy() {
  const sections = ["home", "price-list", "payment", "contact"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  const observer = new IntersectionObserver(
    (entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

      if (!visibleEntry) {
        return;
      }

      navLinks.forEach((link) => {
        const isActive = link.getAttribute("href") === `#${visibleEntry.target.id}`;
        link.classList.toggle("active", isActive);
      });
    },
    {
      rootMargin: "-35% 0px -45% 0px",
      threshold: [0.2, 0.45, 0.7]
    }
  );

  sections.forEach((section) => observer.observe(section));
}
