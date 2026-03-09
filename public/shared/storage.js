import { DEFAULT_JOURNAL_IDS, SEEDED_JOURNALS, SOURCE_REGISTRY } from "./catalog.js";

const STORAGE_KEY = "literature-discovery/v2";

function buildDefaultPreferences() {
  return {
    subscribedJournalIds: [...DEFAULT_JOURNAL_IDS],
    customJournals: [],
    topics: [],
    sources: {
      crossref: true,
      pubmed: true,
      arxiv: false
    }
  };
}

function buildDefaultState() {
  return {
    users: [],
    currentUserId: null
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return buildDefaultState();
    }

    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      currentUserId: parsed.currentUserId || null
    };
  } catch (error) {
    console.error("Storage reset:", error.message);
    return buildDefaultState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildUserRecord({ name, email, passwordHash }) {
  return {
    id: `user-${crypto.randomUUID()}`,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash,
    preferences: buildDefaultPreferences()
  };
}

function findUserById(state, id) {
  return state.users.find((user) => user.id === id) || null;
}

export function getCurrentUser() {
  const state = loadState();
  return state.currentUserId ? findUserById(state, state.currentUserId) : null;
}

export async function createUser({ name, email, password }) {
  const state = loadState();
  const normalizedEmail = email.trim().toLowerCase();

  if (state.users.some((user) => user.email === normalizedEmail)) {
    throw new Error("That email is already registered in this browser.");
  }

  const passwordHash = await hashPassword(password);
  const user = buildUserRecord({ name, email: normalizedEmail, passwordHash });
  state.users.push(user);
  state.currentUserId = user.id;
  saveState(state);
  return user;
}

export async function signInUser({ email, password }) {
  const state = loadState();
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  const user = state.users.find((entry) => entry.email === normalizedEmail && entry.passwordHash === passwordHash);

  if (!user) {
    throw new Error("Email or password is incorrect for this browser.");
  }

  state.currentUserId = user.id;
  saveState(state);
  return user;
}

export function signOutUser() {
  const state = loadState();
  state.currentUserId = null;
  saveState(state);
}

export function getSourceRegistry() {
  return SOURCE_REGISTRY;
}

export function getJournalLibrary(user = getCurrentUser()) {
  if (!user) {
    return [...SEEDED_JOURNALS];
  }

  return [...SEEDED_JOURNALS, ...(user.preferences.customJournals || [])];
}

function patchCurrentUser(updater) {
  const state = loadState();
  const userIndex = state.users.findIndex((user) => user.id === state.currentUserId);

  if (userIndex < 0) {
    throw new Error("No signed-in user found.");
  }

  const nextUser = updater(structuredClone(state.users[userIndex]));
  state.users[userIndex] = nextUser;
  saveState(state);
  return nextUser;
}

export function toggleJournalSubscription(journalId) {
  return patchCurrentUser((user) => {
    const selected = new Set(user.preferences.subscribedJournalIds);
    if (selected.has(journalId)) {
      selected.delete(journalId);
    } else {
      selected.add(journalId);
    }
    user.preferences.subscribedJournalIds = Array.from(selected);
    return user;
  });
}

export function addCustomJournal(journal) {
  return patchCurrentUser((user) => {
    const custom = user.preferences.customJournals || [];
    const dedupeKey = `${journal.issn || ""}:${journal.title.toLowerCase()}`;
    const seededMatch = SEEDED_JOURNALS.find((entry) => `${entry.issn || ""}:${entry.title.toLowerCase()}` === dedupeKey);

    if (seededMatch) {
      user.preferences.subscribedJournalIds = Array.from(new Set([...user.preferences.subscribedJournalIds, seededMatch.id]));
      return user;
    }

    const existingCustom = custom.find((entry) => `${entry.issn || ""}:${entry.title.toLowerCase()}` === dedupeKey);

    if (!existingCustom) {
      const idBase = journal.issn ? `custom-${journal.issn}` : `custom-${journal.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const nextJournal = {
        id: idBase,
        title: journal.title.trim(),
        issn: journal.issn || "",
        source: journal.source || "crossref",
        seeded: false
      };
      user.preferences.customJournals = [...custom, nextJournal];
      user.preferences.subscribedJournalIds = Array.from(new Set([...user.preferences.subscribedJournalIds, nextJournal.id]));
      return user;
    }

    user.preferences.subscribedJournalIds = Array.from(new Set([...user.preferences.subscribedJournalIds, existingCustom.id]));
    return user;
  });
}

export function addTopic(topic) {
  const normalized = topic.trim();
  if (!normalized) {
    throw new Error("Keyword cannot be empty.");
  }

  return patchCurrentUser((user) => {
    const existing = new Set(user.preferences.topics.map((entry) => entry.toLowerCase()));
    if (!existing.has(normalized.toLowerCase())) {
      user.preferences.topics = [...user.preferences.topics, normalized];
    }
    return user;
  });
}

export function removeTopic(topic) {
  return patchCurrentUser((user) => {
    user.preferences.topics = user.preferences.topics.filter((entry) => entry !== topic);
    return user;
  });
}

export function toggleSource(sourceId) {
  return patchCurrentUser((user) => {
    user.preferences.sources = {
      ...user.preferences.sources,
      [sourceId]: !user.preferences.sources[sourceId]
    };
    return user;
  });
}
