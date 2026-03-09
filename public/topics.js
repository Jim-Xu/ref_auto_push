import { getCurrentUser, getSourceRegistry, toggleSource } from "./shared/storage.js";
import { bootstrapSession } from "./shared/session-ui.js";

const sourceList = document.querySelector("#source-list");

let activeUser = null;

function renderSources() {
  sourceList.innerHTML = "";

  if (!activeUser) {
    sourceList.innerHTML = `<div class="empty-state">Sign in to manage data sources.</div>`;
    return;
  }

  const registry = getSourceRegistry();
  Object.values(registry).forEach((source) => {
    const enabled = Boolean(activeUser.preferences.sources[source.id]);
    const item = document.createElement("article");
    item.className = "topic-item";
    item.innerHTML = `
      <div>
        <div class="table-title">${source.label}</div>
        <div class="table-meta">${source.status === "live" ? "Browser-ready" : "Experimental browser fetch"}</div>
      </div>
      <label class="switch">
        <input type="checkbox" ${enabled ? "checked" : ""} />
        <span>${enabled ? "Enabled" : "Disabled"}</span>
      </label>
    `;

    item.querySelector("input").addEventListener("change", () => {
      activeUser = toggleSource(source.id);
      renderSources();
    });

    sourceList.appendChild(item);
  });
}

bootstrapSession({
  onAuthenticated(user) {
    activeUser = getCurrentUser() || user;
    renderSources();
  },
  onSignedOut() {
    activeUser = null;
    sourceList.innerHTML = "";
  }
});
