import { auth } from "./firebase-client.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

const sessionStatus = document.querySelector("#sessionStatus");
const logoutButton = document.querySelector("#logoutButton");
const welcomeChip = document.querySelector("#welcomeChip");
const userEmail = document.querySelector("#userEmail");
const userUid = document.querySelector("#userUid");
const userVerified = document.querySelector("#userVerified");
const userProvider = document.querySelector("#userProvider");
const userLastSignIn = document.querySelector("#userLastSignIn");
const userCreatedAt = document.querySelector("#userCreatedAt");

function formatDate(value) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleString();
}

function redirectToLogin(reason) {
  const target = new URL("./login.html", window.location.href);
  if (reason) {
    target.searchParams.set("reason", reason);
  }
  window.location.replace(target.toString());
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    redirectToLogin("signin-required");
    return;
  }

  const providerId = user.providerData?.[0]?.providerId || "password";

  if (sessionStatus) {
    sessionStatus.textContent = "Session active";
  }

  if (welcomeChip) {
    welcomeChip.textContent = user.email || "Authenticated user";
  }

  if (userEmail) {
    userEmail.textContent = user.email || "No email";
  }

  if (userUid) {
    userUid.textContent = user.uid;
  }

  if (userVerified) {
    userVerified.textContent = user.emailVerified ? "Yes" : "No";
  }

  if (userProvider) {
    userProvider.textContent = providerId;
  }

  if (userLastSignIn) {
    userLastSignIn.textContent = formatDate(user.metadata?.lastSignInTime);
  }

  if (userCreatedAt) {
    userCreatedAt.textContent = formatDate(user.metadata?.creationTime);
  }
});

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging out...";

    try {
      await signOut(auth);
      redirectToLogin("logged-out");
    } catch (error) {
      console.error(error);
      logoutButton.disabled = false;
      logoutButton.textContent = "Log Out";
      if (sessionStatus) {
        sessionStatus.textContent = "Logout failed";
      }
    }
  });
}
