import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getAnalytics,
  isSupported as analyticsSupported,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCEw5L84gudjjEA0507sRRa-LaHngx3dNs",
  authDomain: "antarmana-sweets-and-snacks.firebaseapp.com",
  projectId: "antarmana-sweets-and-snacks",
  storageBucket: "antarmana-sweets-and-snacks.firebasestorage.app",
  messagingSenderId: "549999071461",
  appId: "1:549999071461:web:708c12df6c15d553afc40c",
  measurementId: "G-MV2T08P980",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let analytics = null;

if (typeof window !== "undefined" && /^https?:$/.test(window.location.protocol)) {
  try {
    if (await analyticsSupported()) {
      analytics = getAnalytics(app);
    }
  } catch (error) {
    console.warn("Analytics could not start in this environment.", error);
  }
}

export { app, auth, analytics };
