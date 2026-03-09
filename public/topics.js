import { SUGGESTED_TOPICS } from "./shared/catalog.js";
import { addTopic, getCurrentUser, removeTopic } from "./shared/storage.js";
import { bootstrapSession } from "./shared/session-ui.js";

const topicList = document.querySelector("#topic-list");
const suggestedTopics = document.querySelector("#suggested-topics");
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

bootstrapSession({
  onAuthenticated(user) {
    activeUser = getCurrentUser() || user;
    renderTopics();
    renderSuggestions();
  },
  onSignedOut() {
    activeUser = null;
    topicList.innerHTML = "";
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
    renderSuggestions();
  } catch (error) {
    topicInput.setCustomValidity(error.message);
    topicInput.reportValidity();
    topicInput.setCustomValidity("");
  }
});
