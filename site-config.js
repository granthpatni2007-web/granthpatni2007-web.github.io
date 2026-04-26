window.ANTARMANA_SITE_CONFIG = {
  // Available modes: "firestore", "remote-api", "local"
  orderDataMode: "firestore",
  // Firestore collection for website orders.
  firestoreCollectionName: "orders",
  // Keep blank unless you want to use the separate backend API instead of Firestore.
  orderApiBaseUrl: "",
  orderPollIntervalMs: 15000
};
