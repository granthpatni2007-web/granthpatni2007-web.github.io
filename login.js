import { auth } from "./firebase-client.js";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

const loginForm = document.querySelector("#loginForm");
const emailField = document.querySelector("#emailField");
const passwordField = document.querySelector("#passwordField");
const loginAction = document.querySelector("#loginAction");
const forgotPasswordButton = document.querySelector("#forgotPasswordButton");
const messageBox = document.querySelector("#messageBox");

let authBusy = false;

function showMessage(text, type = "info") {
  if (!messageBox) {
    return;
  }

  messageBox.hidden = false;
  messageBox.textContent = text;
  messageBox.className = "message-box";

  if (type === "error") {
    messageBox.classList.add("is-error");
  }

  if (type === "success") {
    messageBox.classList.add("is-success");
  }
}

function clearMessage() {
  if (!messageBox) {
    return;
  }

  messageBox.hidden = true;
  messageBox.textContent = "";
  messageBox.className = "message-box";
}

function setBusyState(isBusy) {
  authBusy = isBusy;

  if (loginAction) {
    loginAction.disabled = isBusy;
    loginAction.textContent = isBusy ? "Verifying..." : "Sign In";
  }

  if (emailField) {
    emailField.disabled = isBusy;
  }

  if (passwordField) {
    passwordField.disabled = isBusy;
  }

  if (forgotPasswordButton) {
    forgotPasswordButton.disabled = isBusy;
  }
}

function normalizeError(error) {
  switch (error?.code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/missing-password":
      return "Please enter your password.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a little and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your internet connection and try again.";
    case "auth/configuration-not-found":
      return "Firebase Email/Password sign-in is not enabled yet. Turn it on in Firebase Console > Authentication > Sign-in method.";
    case "auth/user-disabled":
      return "This Firebase account has been disabled.";
    default:
      return error?.message || "Sign in failed. Please try again.";
  }
}

function redirectToDashboard() {
  const target = new URL("./dashboard.html", window.location.href);
  window.location.assign(target.toString());
}

function applySearchMessage() {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason");

  if (reason === "logged-out") {
    showMessage("You have been logged out successfully.", "success");
  } else if (reason === "signin-required") {
    showMessage("Please sign in first to open the dashboard.", "error");
  }
}

async function handleLogin(event) {
  event?.preventDefault();

  if (authBusy) {
    return;
  }

  clearMessage();

  const email = emailField?.value.trim() || "";
  const password = passwordField?.value || "";

  if (!email || !password) {
    showMessage("Please enter both email and password.", "error");
    return;
  }

  setBusyState(true);

  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, email, password);
    showMessage("Login successful. Opening dashboard...", "success");
    window.setTimeout(redirectToDashboard, 900);
  } catch (error) {
    console.error(error);
    setBusyState(false);
    showMessage(normalizeError(error), "error");
  }
}

async function handlePasswordReset() {
  clearMessage();
  const email = emailField?.value.trim() || "";

  if (!email) {
    showMessage("Enter your email first, then use Forgot Password.", "error");
    emailField?.focus();
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("Password reset email sent. Please check your inbox.", "success");
  } catch (error) {
    console.error(error);
    showMessage(normalizeError(error), "error");
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user || authBusy) {
    return;
  }

  showMessage("Existing session found. Opening dashboard...", "success");
  window.setTimeout(redirectToDashboard, 700);
});

if (loginForm) {
  loginForm.addEventListener("submit", handleLogin);
}

if (loginAction) {
  loginAction.addEventListener("click", handleLogin);
}

if (forgotPasswordButton) {
  forgotPasswordButton.addEventListener("click", handlePasswordReset);
}

applySearchMessage();
