import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getAnalytics,
  isSupported
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyCEw5L84gudjjEA0507sRRa-LaHngx3dNs",
  authDomain: "antarmana-sweets-and-snacks.firebaseapp.com",
  projectId: "antarmana-sweets-and-snacks",
  storageBucket: "antarmana-sweets-and-snacks.firebasestorage.app",
  messagingSenderId: "549999071461",
  appId: "1:549999071461:web:dd646c228b55567dafc40c",
  measurementId: "G-BY4WNTT8MC"
};

const app = initializeApp(firebaseConfig);
let analytics = null;

if (await isSupported().catch(() => false)) {
  analytics = getAnalytics(app);
}

window.antarmanaFirebase = {
  app,
  analytics,
  config: firebaseConfig
};
