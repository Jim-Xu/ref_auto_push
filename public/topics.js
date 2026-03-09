import { SUGGESTED_TOPICS } from "./shared/catalog.js";
import { addTopic, getCurrentUser, getSourceRegistry, removeTopic, toggleSource } from "./shared/storage.js";
import { bootstrapSession } from "./shared/session-ui.js";

const topicList = document.querySelector("#topic-list");
const suggestedTopics = document.querySelector("#suggested-topics");
const sourceList = document.querySelector("#source-list");
const topicForm = document.querySelector("#topic-form");
const topicInput = document.querySelector("#topic-input");

let activeUser = null;

function renderTopics() {
  topicList.innerHTML = "";

  if (!activeUser || activeUser.preferences.topics.length === 0) {
    topicList.innerHTML = `<div class="empty-state">No keyword subscriptions yet. Leave it empty for a journal-only digest.</div>`;
    return;
  }

  activeUser.preferences.topics.forEach((topic) => {
    const item = document.createElement("article");
    item.className = "topic-item";
    item.innerHTML = `
      <div>
        <div class="table-title">${topic}</div>
        <div class="table-meta">Optional filter</div>
      </div>
      <button class="tiny-button" type="button">Remove</button>
    `;

    item.querySelector("button").addEventListener("click", () => {
      activeUser = removeTopic(topic);
      renderTopics();
      renderSuggestions();
    });

    topicList.appendChild(item);
  });
}

function renderSuggestions() {
  suggestedTopics.innerHTML = "";
  const current = new Set((activeUser?.preferences.topics || []).map((topic) => topic.toLowerCase()));

  SUGGESTED_TOPICS.forEach((topic) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = current.has(topic.toLowerCase()) ? "chip is-live" : "chip";
    chip.textContent = topic;
    chip.disabled = current.has(topic.toLowerCase());
    chip.addEventListener("click", () => {
      activeUser = addTopic(topic);
      renderTopics();
      renderSuggestions();
    });
    suggestedTopics.appendChild(chip);
  });
}

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
    renderTopics();
    renderSources();
    renderSuggestions();
  },
  onSignedOut() {
    activeUser = null;
    topicList.innerHTML = "";
    sourceList.innerHTML = "";
    suggestedTopics.innerHTML = "";
  }
});

topicForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!activeUser) {
    return;
  }

  try {
    activeUser = addTopic(topicInput.value);
    topicInput.value = "";
    renderTopics();
    renderSources();
    renderSuggestions();
  } catch (error) {
    topicInput.setCustomValidity(error.message);
    topicInput.reportValidity();
    topicInput.setCustomValidity("");
  }
});
