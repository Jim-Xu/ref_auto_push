import { createUser, getCurrentUser, signInUser, signOutUser } from "./storage.js";

function renderAccount(user) {
  document.querySelector("#account-name").textContent = user ? user.name : "Not signed in";
  document.querySelector("#account-email").textContent = user ? user.email : "";
}

function setMessage(message) {
  const target = document.querySelector("#auth-message");
  if (target) {
    target.textContent = message || "";
  }
}

export function bootstrapSession({ onAuthenticated, onSignedOut }) {
  const authModal = document.querySelector("#auth-modal");
  const signInForm = document.querySelector("#signin-form");
  const signUpForm = document.querySelector("#signup-form");
  const signOutButton = document.querySelector("#signout-button");

  async function finishAuth(user) {
    renderAccount(user);
    authModal.classList.add("is-hidden");
    setMessage("");
    if (onAuthenticated) {
      await onAuthenticated(user);
    }
  }

  signInForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const user = await signInUser({
        email: document.querySelector("#signin-email").value,
        password: document.querySelector("#signin-password").value
      });
      await finishAuth(user);
    } catch (error) {
      setMessage(error.message);
    }
  });

  signUpForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const user = await createUser({
        name: document.querySelector("#signup-name").value,
        email: document.querySelector("#signup-email").value,
        password: document.querySelector("#signup-password").value
      });
      await finishAuth(user);
    } catch (error) {
      setMessage(error.message);
    }
  });

  signOutButton?.addEventListener("click", () => {
    signOutUser();
    renderAccount(null);
    authModal.classList.remove("is-hidden");
    if (onSignedOut) {
      onSignedOut();
    }
  });

  const currentUser = getCurrentUser();
  if (currentUser) {
    renderAccount(currentUser);
    authModal.classList.add("is-hidden");
    onAuthenticated?.(currentUser);
    return;
  }

  renderAccount(null);
  authModal.classList.remove("is-hidden");
}
