import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getAnalytics,
  isSupported
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  setDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCEw5L84gudjjEA0507sRRa-LaHngx3dNs",
  authDomain: "antarmana-sweets-and-snacks.firebaseapp.com",
  projectId: "antarmana-sweets-and-snacks",
  storageBucket: "antarmana-sweets-and-snacks.firebasestorage.app",
  messagingSenderId: "549999071461",
  appId: "1:549999071461:web:dd646c228b55567dafc40c",
  measurementId: "G-BY4WNTT8MC"
};

window.antarmanaFirebaseReady = (async () => {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);
  let analytics = null;

  if (await isSupported().catch(() => false)) {
    analytics = getAnalytics(app);
  }

  const authReady = new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      () => {
        unsubscribe();
        resolve(null);
      }
    );
  });

  const services = {
    app,
    auth,
    authReady,
    db,
    analytics,
    config: firebaseConfig,
    authApi: {
      signInWithEmailAndPassword,
      signOut
    },
    firestoreApi: {
      collection,
      doc,
      getDocs,
      orderBy,
      query,
      setDoc,
      writeBatch
    }
  };

  window.antarmanaFirebase = services;
  window.dispatchEvent(
    new CustomEvent("antarmana-firebase-ready", {
      detail: services
    })
  );

  return services;
})().catch((error) => {
  console.error("Firebase initialization failed.", error);
  window.dispatchEvent(
    new CustomEvent("antarmana-firebase-error", {
      detail: error
    })
  );
  throw error;
});
