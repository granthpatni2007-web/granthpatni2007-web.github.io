(function bootstrapOrderStore() {
  const fallbackStorageKey = "Antarmana-orders";
  const defaultPollIntervalMs = 15000;
  const defaultFirestoreCollectionName = "orders";
  const siteConfig = window.ANTARMANA_SITE_CONFIG || {};
  const normalizedBaseUrl =
    typeof siteConfig.orderApiBaseUrl === "string"
      ? siteConfig.orderApiBaseUrl.trim().replace(/\/+$/, "")
      : "";
  const configuredPollInterval = Number(siteConfig.orderPollIntervalMs);
  const normalizedCollectionName =
    typeof siteConfig.firestoreCollectionName === "string" &&
    siteConfig.firestoreCollectionName.trim()
      ? siteConfig.firestoreCollectionName.trim()
      : defaultFirestoreCollectionName;
  const configuredMode = normalizeMode(siteConfig.orderDataMode, normalizedBaseUrl);
  const config = {
    orderDataMode: configuredMode,
    orderApiBaseUrl: normalizedBaseUrl,
    firestoreCollectionName: normalizedCollectionName,
    orderPollIntervalMs:
      Number.isFinite(configuredPollInterval) && configuredPollInterval > 0
        ? configuredPollInterval
        : defaultPollIntervalMs
  };

  function normalizeMode(mode, baseUrl) {
    const normalizedMode = typeof mode === "string" ? mode.trim().toLowerCase() : "";

    if (normalizedMode === "firestore" || normalizedMode === "remote-api" || normalizedMode === "local") {
      return normalizedMode;
    }

    return baseUrl ? "remote-api" : "local";
  }

  function createError(message, status, payload = null) {
    const error = new Error(message);
    error.status = status;
    error.payload = payload;
    return error;
  }

  function isRemoteMode() {
    return config.orderDataMode !== "local";
  }

  function isFirestoreMode() {
    return config.orderDataMode === "firestore";
  }

  function isRemoteApiMode() {
    return config.orderDataMode === "remote-api";
  }

  function getMode() {
    return config.orderDataMode;
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

  function prepareOrderForRemote(order) {
    const fallbackTimestamp = Date.now();
    const placedAtMs =
      Number(order?.placedAtMs) || Number(Date.parse(order?.placedAt || "")) || fallbackTimestamp;
    const updatedAtMs = Number(order?.updatedAtMs) || fallbackTimestamp;

    return {
      ...order,
      placedAtMs,
      updatedAtMs
    };
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

  async function waitForFirebaseServices(timeoutMs = 15000) {
    if (window.antarmanaFirebase) {
      return window.antarmanaFirebase;
    }

    if (window.antarmanaFirebaseReady) {
      return window.antarmanaFirebaseReady;
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      function cleanup() {
        window.clearTimeout(timeoutId);
        window.removeEventListener("antarmana-firebase-ready", handleReady);
        window.removeEventListener("antarmana-firebase-error", handleError);
      }

      function finish(callback) {
        return (event) => {
          if (settled) {
            return;
          }

          settled = true;
          cleanup();
          callback(event);
        };
      }

      const handleReady = finish(() => resolve(window.antarmanaFirebase || null));
      const handleError = finish((event) =>
        reject(event?.detail instanceof Error ? event.detail : createError("Firebase init failed.", 500))
      );
      const timeoutId = window.setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(null);
      }, timeoutMs);

      window.addEventListener("antarmana-firebase-ready", handleReady, { once: true });
      window.addEventListener("antarmana-firebase-error", handleError, { once: true });
    });
  }

  async function getFirestoreServices() {
    const services = await waitForFirebaseServices();

    if (!services?.db || !services?.firestoreApi) {
      throw createError("Firestore is not ready.", 503);
    }

    return services;
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
      throw createError(
        (payload && payload.error) ||
          (typeof payload === "string" && payload) ||
          `Request failed with status ${response.status}`,
        response.status,
        payload
      );
    }

    return payload;
  }

  async function listFirestoreOrders() {
    const services = await getFirestoreServices();
    await services.authReady?.catch(() => null);

    if (!services.auth?.currentUser) {
      throw createError("Owner sign-in required.", 401);
    }

    const collectionRef = services.firestoreApi.collection(services.db, config.firestoreCollectionName);
    const ordersQuery = services.firestoreApi.query(
      collectionRef,
      services.firestoreApi.orderBy("placedAtMs", "desc")
    );
    const snapshot = await services.firestoreApi.getDocs(ordersQuery);

    return snapshot.docs.map((docSnapshot) => prepareOrderForRemote(docSnapshot.data()));
  }

  async function createFirestoreOrder(order) {
    const services = await getFirestoreServices();
    const normalizedOrder = prepareOrderForRemote(order);

    await services.firestoreApi.setDoc(
      services.firestoreApi.doc(services.db, config.firestoreCollectionName, normalizedOrder.id),
      normalizedOrder
    );

    return normalizedOrder;
  }

  async function replaceFirestoreOrders(orders) {
    const services = await getFirestoreServices();
    await services.authReady?.catch(() => null);

    if (!services.auth?.currentUser) {
      throw createError("Owner sign-in required.", 401);
    }

    const timestamp = Date.now();
    const normalizedOrders = normalizeOrders(orders)
      .map(prepareOrderForRemote)
      .map((order) => ({
        ...order,
        updatedAtMs: timestamp
      }));

    const snapshot = await services.firestoreApi.getDocs(
      services.firestoreApi.collection(services.db, config.firestoreCollectionName)
    );
    const nextIds = new Set(normalizedOrders.map((order) => order.id));
    const batch = services.firestoreApi.writeBatch(services.db);

    snapshot.docs.forEach((docSnapshot) => {
      if (!nextIds.has(docSnapshot.id)) {
        batch.delete(docSnapshot.ref);
      }
    });

    normalizedOrders.forEach((order) => {
      batch.set(
        services.firestoreApi.doc(services.db, config.firestoreCollectionName, order.id),
        order
      );
    });

    await batch.commit();

    return normalizedOrders.sort((left, right) => right.placedAtMs - left.placedAtMs);
  }

  async function listOrders(options = {}) {
    if (!isRemoteMode()) {
      return loadLocalOrders();
    }

    if (isFirestoreMode()) {
      return listFirestoreOrders();
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

    if (isFirestoreMode()) {
      return createFirestoreOrder(order);
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

    if (isFirestoreMode()) {
      return replaceFirestoreOrders(orders);
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
    isFirestoreMode,
    isRemoteApiMode,
    getPollIntervalMs,
    listOrders,
    createOrder,
    replaceOrders,
    waitForFirebaseServices
  };
})();
