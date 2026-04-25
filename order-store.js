(function bootstrapOrderStore() {
  const fallbackStorageKey = "Antarmana-orders";
  const defaultPollIntervalMs = 15000;
  const siteConfig = window.ANTARMANA_SITE_CONFIG || {};
  const normalizedBaseUrl =
    typeof siteConfig.orderApiBaseUrl === "string"
      ? siteConfig.orderApiBaseUrl.trim().replace(/\/+$/, "")
      : "";
  const configuredPollInterval = Number(siteConfig.orderPollIntervalMs);
  const config = {
    orderApiBaseUrl: normalizedBaseUrl,
    orderPollIntervalMs:
      Number.isFinite(configuredPollInterval) && configuredPollInterval > 0
        ? configuredPollInterval
        : defaultPollIntervalMs
  };

  function isRemoteMode() {
    return Boolean(config.orderApiBaseUrl);
  }

  function getMode() {
    return isRemoteMode() ? "remote" : "local";
  }

  function getPollIntervalMs() {
    return config.orderPollIntervalMs;
  }

  function normalizeOrders(orders) {
    if (!Array.isArray(orders)) {
      return [];
    }

    return orders
      .filter((order) => order && typeof order === "object" && !Array.isArray(order))
      .map((order) => ({ ...order }));
  }

  function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function dispatchLocalOrdersChanged(orders) {
    window.dispatchEvent(
      new CustomEvent("antarmana-orders-changed", {
        detail: {
          orders: cloneValue(orders)
        }
      })
    );
  }

  function loadLocalOrders() {
    try {
      const savedValue = window.localStorage.getItem(fallbackStorageKey);
      return normalizeOrders(savedValue ? JSON.parse(savedValue) : []);
    } catch {
      return [];
    }
  }

  function saveLocalOrders(orders) {
    const normalizedOrders = normalizeOrders(orders);
    window.localStorage.setItem(fallbackStorageKey, JSON.stringify(normalizedOrders));
    dispatchLocalOrdersChanged(normalizedOrders);
    return normalizedOrders;
  }

  async function request(path, options = {}) {
    const endpoint = `${config.orderApiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = {
      Accept: "application/json"
    };

    if (options.ownerToken) {
      headers["X-Owner-Token"] = options.ownerToken;
    }

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await window.fetch(endpoint, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");

    if (!response.ok) {
      const error = new Error(
        (payload && payload.error) ||
          (typeof payload === "string" && payload) ||
          `Request failed with status ${response.status}`
      );
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  function extractOrders(payload) {
    if (Array.isArray(payload)) {
      return normalizeOrders(payload);
    }

    if (payload && Array.isArray(payload.orders)) {
      return normalizeOrders(payload.orders);
    }

    return [];
  }

  function extractOrder(payload) {
    if (payload && payload.order && typeof payload.order === "object") {
      return { ...payload.order };
    }

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return { ...payload };
    }

    return null;
  }

  async function listOrders(options = {}) {
    if (!isRemoteMode()) {
      return loadLocalOrders();
    }

    const payload = await request("/orders", {
      ownerToken: options.ownerToken
    });
    return extractOrders(payload);
  }

  async function createOrder(order) {
    if (!isRemoteMode()) {
      const nextOrders = [order, ...loadLocalOrders()];
      saveLocalOrders(nextOrders);
      return { ...order };
    }

    const payload = await request("/orders", {
      method: "POST",
      body: {
        order
      }
    });

    return extractOrder(payload) || { ...order };
  }

  async function replaceOrders(orders, options = {}) {
    if (!isRemoteMode()) {
      return saveLocalOrders(orders);
    }

    const payload = await request("/orders", {
      method: "PUT",
      ownerToken: options.ownerToken,
      body: {
        orders
      }
    });

    return extractOrders(payload);
  }

  window.antarmanaOrderStore = {
    storageKey: fallbackStorageKey,
    config,
    getMode,
    isRemoteMode,
    getPollIntervalMs,
    listOrders,
    createOrder,
    replaceOrders
  };
})();
