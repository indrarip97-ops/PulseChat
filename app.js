const STORAGE_KEY = "pulsechat-app";
const MESSAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const DEFAULT_THEME_ID = "sunrise";
const DB_NAME = "pulsechat-db";
const DB_VERSION = 1;
const DB_STORE = "appState";
const DB_KEY = "main";
const EMOJIS = [
  "\u{1F600}", "\u{1F602}", "\u{1F979}", "\u{1F60D}", "\u{1F60E}", "\u{1F914}", "\u{1F62D}",
  "\u{1F525}", "\u{2764}\u{FE0F}", "\u{1F44D}", "\u{1F44F}", "\u{1F64F}", "\u{1F389}", "\u{2728}",
  "\u{1F605}", "\u{1F973}", "\u{1F64C}", "\u{1F91D}", "\u{1F634}", "\u{1F92F}", "\u{1F440}",
];
const THEMES = [
  { id: "sunrise", name: "Sunrise", description: "Warm gradient", swatch: "linear-gradient(135deg, #fff2dd, #ffd1bb 52%, #ffc47b)" },
  { id: "ocean", name: "Ocean", description: "Cool blue pattern", swatch: "linear-gradient(135deg, #e8fbff, #aee7f6 52%, #4db4d8)" },
  { id: "forest", name: "Forest", description: "Natural green pattern", swatch: "linear-gradient(135deg, #f1faef, #cde6c7 52%, #6ba47e)" },
  { id: "midnight", name: "Midnight", description: "Deep dark glow", swatch: "linear-gradient(135deg, #111826, #24324e 52%, #5d7dbf)" },
  { id: "candy", name: "Candy", description: "Soft pink stripes", swatch: "linear-gradient(135deg, #fff3f7, #ffc9da 52%, #ef6c97)" },
  { id: "graphite", name: "Graphite", description: "Clean monochrome", swatch: "linear-gradient(135deg, #f8fafc, #d6dde4 52%, #7f8896)" },
];

const state = {
  users: [],
  messages: [],
  friendRequests: [],
  currentUserId: null,
  activeChatUserId: null,
  pendingAttachment: null,
  viewMode: "friends",
};
let dbPromise;

const els = {
  authView: document.getElementById("auth-view"),
  chatView: document.getElementById("chat-view"),
  signupForm: document.getElementById("signup-form"),
  loginForm: document.getElementById("login-form"),
  signupDisplayName: document.getElementById("signup-display-name"),
  signupEmail: document.getElementById("signup-email"),
  signupPassword: document.getElementById("signup-password"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  authHeading: document.getElementById("auth-heading"),
  showSignupBtn: document.getElementById("show-signup-btn"),
  showLoginBtn: document.getElementById("show-login-btn"),
  currentDisplayName: document.getElementById("current-display-name"),
  currentUsername: document.getElementById("current-username"),
  logoutBtn: document.getElementById("logout-btn"),
  friendsBtn: document.getElementById("friends-btn"),
  userSearch: document.getElementById("user-search"),
  userResults: document.getElementById("user-results"),
  chatEmpty: document.getElementById("chat-empty"),
  chatWindow: document.getElementById("chat-window"),
  backToFriendsBtn: document.getElementById("back-to-friends-btn"),
  chatTargetName: document.getElementById("chat-target-name"),
  chatTargetUsername: document.getElementById("chat-target-username"),
  messageList: document.getElementById("message-list"),
  messageForm: document.getElementById("message-form"),
  messageInput: document.getElementById("message-input"),
  sendBtn: document.getElementById("send-btn"),
  fileInput: document.getElementById("file-input"),
  uploadBtn: document.getElementById("upload-btn"),
  emojiBtn: document.getElementById("emoji-btn"),
  emojiPicker: document.getElementById("emoji-picker"),
  composerPreview: document.getElementById("composer-preview"),
  themeBtn: document.getElementById("theme-btn"),
  themePanel: document.getElementById("theme-panel"),
  themeOptions: document.getElementById("theme-options"),
  likedBanner: document.getElementById("liked-banner"),
  changeLikedBtn: document.getElementById("change-liked-btn"),
  likedEditor: document.getElementById("liked-editor"),
  likedInput: document.getElementById("liked-input"),
  saveLikedBtn: document.getElementById("save-liked-btn"),
  heroTitle: document.getElementById("hero-title"),
  toast: document.getElementById("toast"),
};
const authMode = {
  current: "signup",
};

function openDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.addEventListener("upgradeneeded", () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE);
        }
      });

      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
  }

  return dbPromise;
}

async function readPersistedState() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readonly");
    const store = transaction.objectStore(DB_STORE);
    const request = store.get(DB_KEY);
    request.addEventListener("success", () => resolve(request.result || null));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function writePersistedState(snapshot) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    const store = transaction.objectStore(DB_STORE);
    store.put(snapshot, DB_KEY);
    transaction.addEventListener("complete", resolve);
    transaction.addEventListener("error", () => reject(transaction.error));
    transaction.addEventListener("abort", () => reject(transaction.error));
  });
}

async function loadState() {
  let parsed = null;

  try {
    parsed = await readPersistedState();
  } catch (error) {
    console.error("PulseChat failed to load IndexedDB state", error);
  }

  if (!parsed) {
    const legacySaved = localStorage.getItem(STORAGE_KEY);
    if (legacySaved) {
      parsed = JSON.parse(legacySaved);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  if (!parsed) {
    cleanupExpiredMessages();
    await saveState();
    return;
  }

  state.users = parsed.users || [];
  state.messages = parsed.messages || [];
  state.friendRequests = parsed.friendRequests || [];
  state.currentUserId = parsed.currentUserId || null;
  state.users = state.users.map((user) => ({
    ...user,
    themeId: user.themeId || DEFAULT_THEME_ID,
    likedThing: user.likedThing || "",
  }));
  state.friendRequests = state.friendRequests.filter((request) => (
    request &&
    request.fromUserId &&
    request.toUserId &&
    request.fromUserId !== request.toUserId &&
    state.users.some((user) => user.id === request.fromUserId) &&
    state.users.some((user) => user.id === request.toUserId)
  ));
  cleanupExpiredMessages();
  ensureActiveChatIsValid();
}

async function saveState() {
  cleanupExpiredMessages();
  await writePersistedState({
    users: state.users,
    messages: state.messages,
    friendRequests: state.friendRequests,
    currentUserId: state.currentUserId,
  });
}

function createUserRecord(displayName, email, password) {
  return {
    id: crypto.randomUUID(),
    displayName,
    email: email.trim().toLowerCase(),
    password,
    username: createUniqueUsername(displayName),
    themeId: DEFAULT_THEME_ID,
    likedThing: "",
    createdAt: new Date().toISOString(),
  };
}

function createMessageRecord(fromUserId, toUserId, text, attachment = null) {
  return {
    id: crypto.randomUUID(),
    fromUserId,
    toUserId,
    text,
    attachment,
    createdAt: new Date().toISOString(),
  };
}

function createFriendRequestRecord(fromUserId, toUserId) {
  return {
    id: crypto.randomUUID(),
    fromUserId,
    toUserId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

function cleanupExpiredMessages() {
  const cutoff = Date.now() - MESSAGE_RETENTION_MS;
  state.messages = state.messages.filter((message) => {
    const createdAt = new Date(message.createdAt).getTime();
    return Number.isFinite(createdAt) && createdAt >= cutoff;
  });
}

function createUniqueUsername(displayName) {
  const base = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 14) || "user";

  let candidate = `@${base}`;
  let counter = 1;

  while (state.users.some((user) => user.username === candidate)) {
    counter += 1;
    candidate = `@${base}${counter}`;
  }

  return candidate;
}

function getCurrentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || null;
}

function getUserById(userId) {
  return state.users.find((user) => user.id === userId) || null;
}

function getRequestBetween(userAId, userBId) {
  const statusOrder = {
    accepted: 0,
    pending: 1,
    declined: 2,
  };

  return state.friendRequests
    .filter((request) => (
      [request.fromUserId, request.toUserId].includes(userAId) &&
      [request.fromUserId, request.toUserId].includes(userBId)
    ))
    .sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3))[0] || null;
}

function hasConversationHistory(userAId, userBId) {
  return state.messages.some((message) => (
    (message.fromUserId === userAId && message.toUserId === userBId) ||
    (message.fromUserId === userBId && message.toUserId === userAId)
  ));
}

function areFriends(userAId, userBId) {
  const request = getRequestBetween(userAId, userBId);
  return request?.status === "accepted" || hasConversationHistory(userAId, userBId);
}

function getPendingIncomingRequests(userId) {
  return state.friendRequests.filter((request) => request.toUserId === userId && request.status === "pending");
}

function ensureActiveChatIsValid() {
  if (!state.currentUserId || !state.activeChatUserId) {
    return;
  }

  if (!areFriends(state.currentUserId, state.activeChatUserId)) {
    state.activeChatUserId = null;
    state.viewMode = "friends";
  }
}

function resetPeopleSearch() {
  els.userSearch.value = "";
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    els.toast.classList.add("hidden");
  }, 2400);
}

function formatTime(iso) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function getConversationMessages(userAId, userBId) {
  return state.messages
    .filter((message) => {
      const isPair =
        (message.fromUserId === userAId && message.toUserId === userBId) ||
        (message.fromUserId === userBId && message.toUserId === userAId);
      return isPair;
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function renderAuth() {
  const currentUser = getCurrentUser();
  const isLoggedIn = Boolean(currentUser);

  document.body.classList.toggle("auth-screen", !isLoggedIn);
  document.body.classList.toggle("chat-screen", isLoggedIn);
  els.authView.classList.toggle("hidden", isLoggedIn);
  els.chatView.classList.toggle("hidden", !isLoggedIn);
  applyTheme(currentUser?.themeId || DEFAULT_THEME_ID);

  if (!currentUser) {
    els.themePanel.classList.add("hidden");
    renderAuthMode();
    return;
  }

  els.currentDisplayName.textContent = currentUser.email;
  els.currentUsername.textContent = `Display name: ${currentUser.displayName}`;
  renderViewMode();
  renderLikedBanner();
  renderThemeOptions();
  renderUserList();
  renderMessages();

  if (!currentUser.likedThing) {
    showLikedPrompt();
  }
}

function setViewMode(mode) {
  state.viewMode = mode === "chat" ? "chat" : "friends";
  renderViewMode();
}

function renderViewMode() {
  const isChat = state.viewMode === "chat" && Boolean(state.activeChatUserId);
  els.chatView.classList.toggle("chat-focused", isChat);
  els.friendsBtn.classList.toggle("active", !isChat);
  els.backToFriendsBtn.classList.toggle("hidden", !isChat);
}

function setAuthMode(mode) {
  authMode.current = mode === "login" ? "login" : "signup";
  renderAuthMode();
}

function renderAuthMode() {
  const isLogin = authMode.current === "login";
  els.authHeading.textContent = isLogin ? "Log in" : "Create account";
  els.signupForm.classList.toggle("hidden", isLogin);
  els.loginForm.classList.toggle("hidden", !isLogin);
  els.showSignupBtn.classList.toggle("active", !isLogin);
  els.showLoginBtn.classList.toggle("active", isLogin);
}

function toStylizedText(value) {
  const upperStart = 0x1d63c;
  const lowerStart = 0x1d656;

  return Array.from(String(value)).map((char) => {
    const code = char.codePointAt(0);
    if (code >= 65 && code <= 90) {
      return String.fromCodePoint(upperStart + (code - 65));
    }
    if (code >= 97 && code <= 122) {
      return String.fromCodePoint(lowerStart + (code - 97));
    }
    return char;
  }).join("");
}

function getDisplayFirstName(displayName) {
  return String(displayName || "User").trim().split(/\s+/)[0] || "User";
}

function buildLikedBanner(user) {
  const styledName = toStylizedText(getDisplayFirstName(user.displayName));
  const styledLoves = toStylizedText("loves");
  const likedThing = user.likedThing ? toStylizedText(user.likedThing.toLowerCase()) : toStylizedText("what you love");

  return `˚  ⋆⁺₊✦⁺₊   ˚  .˚ .   ☁.    .   ˚  ⁺⋆₊  .˚ .\n. ✦⋆⁺₊ ☾ ⋆  ✧ ${styledName} ${styledLoves} ${likedThing} ✩₊˚. ⋆ ⁺₊✧\n.  ˚  ⁺₊ .   ˚  .   ⁺₊✦₊   ☁  ✦. ˚ .`;
}

function renderLikedBanner() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    return;
  }

  els.likedBanner.textContent = buildLikedBanner(currentUser);
  els.heroTitle.textContent = currentUser.likedThing
    ? `${getDisplayFirstName(currentUser.displayName)}'s PulseChat`
    : "PulseChat";
}

function showLikedPrompt() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    return;
  }

  const answer = window.prompt(
    "Change what you love in the banner:",
    currentUser.likedThing || "",
  );

  if (answer === null) {
    return;
  }

  saveLikedThing(answer).catch((error) => {
    console.error("PulseChat liked save failed", error);
    showToast("Could not update loved text right now.");
  });
}

window.pulseChatChangeLoved = showLikedPrompt;

function openLikedEditor() {
  showLikedPrompt();
}

function closeLikedEditor() {
  els.likedEditor.classList.add("hidden");
}

async function saveLikedThing(nextValue = els.likedInput.value) {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    return;
  }

  const value = String(nextValue).trim();
  if (!value) {
    showToast("Tell PulseChat what you love first.");
    return;
  }

  currentUser.likedThing = value;
  await saveState();
  renderLikedBanner();
  closeLikedEditor();
  showToast("Loved text updated.");
}

function applyTheme(themeId) {
  document.body.dataset.theme = getTheme(themeId).id;
}

function getTheme(themeId) {
  return THEMES.find((theme) => theme.id === themeId) || THEMES[0];
}

function renderThemeOptions() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    return;
  }

  els.themeOptions.innerHTML = "";

  THEMES.forEach((theme) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = `theme-option ${currentUser.themeId === theme.id ? "active" : ""}`;
    option.innerHTML = `
      <div class="theme-option-top">
        <div class="theme-option-copy">
          <strong>${escapeHtml(theme.name)}</strong>
          <span>${escapeHtml(theme.description)}</span>
        </div>
        <span>${currentUser.themeId === theme.id ? "Selected" : "Choose"}</span>
      </div>
      <div class="theme-option-swatch" style="background: ${theme.swatch};"></div>
    `;
    option.addEventListener("click", () => {
      setCurrentUserTheme(theme.id);
    });
    els.themeOptions.appendChild(option);
  });
}

async function setCurrentUserTheme(themeId) {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    return;
  }

  currentUser.themeId = getTheme(themeId).id;
  applyTheme(currentUser.themeId);
  await saveState();
  renderThemeOptions();
  showToast(`${getTheme(themeId).name} theme applied.`);
}

function renderUserList() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    return;
  }

  const query = els.userSearch.value.trim().toLowerCase();
  const incomingRequests = getPendingIncomingRequests(currentUser.id)
    .map((request) => ({
      request,
      user: getUserById(request.fromUserId),
    }))
    .filter((item) => item.user)
    .filter(({ user }) => matchesUserSearch(user, query))
    .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));

  const friends = state.users
    .filter((user) => user.id !== currentUser.id)
    .filter((user) => areFriends(currentUser.id, user.id))
    .filter((user) => matchesUserSearch(user, query))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const discoverableUsers = query
    ? state.users
      .filter((user) => user.id !== currentUser.id)
      .filter((user) => !areFriends(currentUser.id, user.id))
      .filter((user) => !incomingRequests.some((item) => item.user.id === user.id))
      .filter((user) => matchesUserSearch(user, query))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
    : [];

  els.userResults.innerHTML = "";

  if (incomingRequests.length === 0 && friends.length === 0 && discoverableUsers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = query
      ? "No users match your search yet."
      : "Search by email to add people.";
    els.userResults.appendChild(empty);
    return;
  }

  if (incomingRequests.length > 0) {
    appendPeopleSection("Requests", incomingRequests, ({ user, request }) => {
      els.userResults.appendChild(createUserCard(user, {
        badge: "Wants to connect",
        detail: user.email,
        actions: [
          { label: "Accept", className: "primary-mini-btn", onClick: () => acceptFriendRequest(request.id) },
          { label: "Decline", className: "ghost-mini-btn", onClick: () => declineFriendRequest(request.id) },
        ],
      }));
    });
  }

  if (friends.length > 0) {
    appendPeopleSection("Friends", friends, (user) => {
      els.userResults.appendChild(createUserCard(user, {
        badge: state.activeChatUserId === user.id ? "Open" : "Message",
        detail: user.email,
        active: state.activeChatUserId === user.id,
        onClick: () => openConversation(user.id),
      }));
    });
  }

  if (discoverableUsers.length > 0) {
    appendPeopleSection("Find People", discoverableUsers, (user) => {
      const request = getRequestBetween(currentUser.id, user.id);
      const sentByCurrentUser = request?.fromUserId === currentUser.id && request.status === "pending";
      els.userResults.appendChild(createUserCard(user, {
        badge: sentByCurrentUser ? "Request sent" : "Click to add",
        detail: user.email,
        onClick: sentByCurrentUser ? null : () => sendFriendRequest(user.id),
      }));
    });
  }
}

function matchesUserSearch(user, query) {
  if (!query) {
    return true;
  }

  return user.email.toLowerCase().includes(query);
}

function appendPeopleSection(title, items, renderItem) {
  const heading = document.createElement("p");
  heading.className = "people-section-label";
  heading.textContent = title;
  els.userResults.appendChild(heading);
  items.forEach(renderItem);
}

function createUserCard(user, options = {}) {
  const card = document.createElement(options.onClick ? "button" : "div");
  if (options.onClick) {
    card.type = "button";
  }
  card.className = `user-card ${options.active ? "active" : ""}`;
  card.innerHTML = `
    <div class="user-meta">
      <strong>${escapeHtml(user.email)}</strong>
      <p>Display name: ${escapeHtml(user.displayName)}</p>
      <span>${escapeHtml(user.username)}</span>
    </div>
    <div class="user-actions">
      <span>${escapeHtml(options.badge || "")}</span>
    </div>
  `;

  const actions = card.querySelector(".user-actions");
  (options.actions || []).forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = action.className;
    button.textContent = action.label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      Promise.resolve(action.onClick()).catch((error) => {
        console.error("PulseChat friend action failed", error);
        showToast("That friend action could not be completed.");
      });
    });
    actions.appendChild(button);
  });

  if (options.onClick) {
    card.addEventListener("click", () => {
      Promise.resolve(options.onClick()).catch((error) => {
        console.error("PulseChat user card action failed", error);
        showToast("That action could not be completed.");
      });
    });
  }

  return card;
}

function openConversation(userId) {
  const currentUser = getCurrentUser();
  if (!currentUser || !areFriends(currentUser.id, userId)) {
    showToast("Connect with this person before messaging.");
    return;
  }

  state.activeChatUserId = userId;
  setViewMode("chat");
  renderUserList();
  renderMessages();
}

async function sendFriendRequest(toUserId) {
  const currentUser = getCurrentUser();
  const targetUser = getUserById(toUserId);
  if (!currentUser || !targetUser || currentUser.id === targetUser.id) {
    return;
  }

  const existingRequest = getRequestBetween(currentUser.id, targetUser.id);
  if (existingRequest?.status === "accepted") {
    openConversation(targetUser.id);
    return;
  }

  if (existingRequest?.status === "pending") {
    showToast("There is already a pending request.");
    return;
  }

  if (existingRequest) {
    existingRequest.fromUserId = currentUser.id;
    existingRequest.toUserId = targetUser.id;
    existingRequest.status = "pending";
    existingRequest.createdAt = new Date().toISOString();
  } else {
    state.friendRequests.push(createFriendRequestRecord(currentUser.id, targetUser.id));
  }

  await saveState();
  renderUserList();
  showToast(`Friend request sent to ${targetUser.displayName}.`);
}

async function acceptFriendRequest(requestId) {
  const currentUser = getCurrentUser();
  const request = state.friendRequests.find((item) => item.id === requestId);
  if (!currentUser || !request || request.toUserId !== currentUser.id) {
    return;
  }

  request.status = "accepted";
  request.respondedAt = new Date().toISOString();
  state.activeChatUserId = request.fromUserId;
  await saveState();
  setViewMode("chat");
  renderUserList();
  renderMessages();
  showToast("Friend request accepted.");
}

async function declineFriendRequest(requestId) {
  const currentUser = getCurrentUser();
  const request = state.friendRequests.find((item) => item.id === requestId);
  if (!currentUser || !request || request.toUserId !== currentUser.id) {
    return;
  }

  request.status = "declined";
  request.respondedAt = new Date().toISOString();
  if (state.activeChatUserId === request.fromUserId) {
    state.activeChatUserId = null;
  }
  await saveState();
  renderUserList();
  renderMessages();
  showToast("Friend request declined.");
}

function renderMessages() {
  const currentUser = getCurrentUser();
  const targetUser = getUserById(state.activeChatUserId);

  if (!currentUser || !targetUser || !areFriends(currentUser.id, targetUser.id)) {
    els.chatEmpty.classList.remove("hidden");
    els.chatWindow.classList.add("hidden");
    return;
  }

  els.chatEmpty.classList.add("hidden");
  els.chatWindow.classList.remove("hidden");
  els.chatTargetName.textContent = targetUser.displayName;
  els.chatTargetUsername.textContent = targetUser.username;

  const messages = getConversationMessages(currentUser.id, targetUser.id);
  els.messageList.innerHTML = "";

  if (messages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No messages yet. Say hello to get started.";
    els.messageList.appendChild(empty);
    return;
  }

  messages.forEach((message) => {
    const row = document.createElement("div");
    const bubble = document.createElement("article");
    const sentByCurrentUser = message.fromUserId === currentUser.id;
    row.className = `message-row ${sentByCurrentUser ? "sent" : "received"}`;
    bubble.className = `message-bubble ${sentByCurrentUser ? "sent" : "received"}`;
    bubble.innerHTML = renderMessageContent(message, sentByCurrentUser, targetUser.displayName);
    row.appendChild(bubble);
    els.messageList.appendChild(row);
  });

  els.messageList.querySelectorAll(".delete-message-btn").forEach((button) => {
    button.addEventListener("click", () => {
      deleteMessage(button.dataset.messageId);
    });
  });

  els.messageList.scrollTop = els.messageList.scrollHeight;
}

function renderMessageContent(message, sentByCurrentUser, targetDisplayName) {
  const mediaMarkup = renderAttachment(message.attachment);
  const text = message.text ? `<div class="message-text ${message.attachment ? "has-media" : ""}">${escapeHtml(message.text)}</div>` : "";

  return `
    ${mediaMarkup}
    ${text}
    <div class="message-footer">
      <div class="message-meta">${sentByCurrentUser ? "You" : escapeHtml(targetDisplayName)} - ${formatTime(message.createdAt)}</div>
      <button type="button" class="delete-message-btn" data-message-id="${message.id}">Delete</button>
    </div>
  `;
}

function renderAttachment(attachment) {
  if (!attachment) {
    return "";
  }

  if (attachment.kind === "image") {
    return `<img class="message-media" src="${attachment.dataUrl}" alt="${escapeHtml(attachment.name)}">`;
  }

  if (attachment.kind === "video") {
    return `<video class="message-media" controls preload="metadata" src="${attachment.dataUrl}"></video>`;
  }

  return "";
}

async function handleSignup(event) {
  event.preventDefault();

  const displayName = els.signupDisplayName.value.trim();
  const email = els.signupEmail.value.trim().toLowerCase();
  const password = els.signupPassword.value;

  if (!displayName || !email || !password) {
    showToast("Please fill out all signup fields.");
    return;
  }

  const emailExists = state.users.some((user) => user.email === email);
  if (emailExists) {
    showToast("That email is already registered.");
    return;
  }

  const newUser = createUserRecord(displayName, email, password);
  state.users.push(newUser);
  state.currentUserId = newUser.id;
  state.activeChatUserId = null;
  resetPeopleSearch();
  setViewMode("friends");
  await saveState();
  els.signupForm.reset();
  setAuthMode("signup");
  renderAuth();
  showToast(`Account created. Your username is ${newUser.username}`);
}

async function handleLogin(event) {
  event.preventDefault();

  const email = els.loginEmail.value.trim().toLowerCase();
  const password = els.loginPassword.value;
  const user = state.users.find((item) => item.email === email && item.password === password);

  if (!user) {
    showToast("Incorrect email or password.");
    return;
  }

  state.currentUserId = user.id;
  state.activeChatUserId = null;
  resetPeopleSearch();
  setViewMode("friends");
  await saveState();
  els.loginForm.reset();
  setAuthMode("login");
  renderAuth();
  showToast(`Welcome back, ${user.displayName}.`);
}

async function handleLogout() {
  state.currentUserId = null;
  state.activeChatUserId = null;
  state.viewMode = "friends";
  resetPeopleSearch();
  els.themePanel.classList.add("hidden");
  await saveState();
  renderAuth();
  showToast("You have logged out.");
}

async function handleSendMessage(event) {
  if (event) {
    event.preventDefault();
  }

  const currentUser = getCurrentUser();
  const targetUser = getUserById(state.activeChatUserId);
  const text = els.messageInput.value.trim();
  const attachment = state.pendingAttachment;

  if (!currentUser || !targetUser || !areFriends(currentUser.id, targetUser.id) || (!text && !attachment)) {
    return;
  }

  try {
    state.messages.push(createMessageRecord(currentUser.id, targetUser.id, text, attachment));
    await saveState();
    els.messageInput.value = "";
    clearPendingAttachment();
    closeEmojiPicker();
    renderMessages();
  } catch (error) {
    console.error("PulseChat send failed", error);
    showToast("Message could not be sent. Please try again.");
  }
}

async function deleteMessage(messageId) {
  const currentUser = getCurrentUser();
  const targetUser = getUserById(state.activeChatUserId);

  if (!currentUser || !targetUser) {
    return;
  }

  const beforeCount = state.messages.length;
  state.messages = state.messages.filter((message) => {
    if (message.id !== messageId) {
      return true;
    }

    const belongsToOpenConversation =
      [message.fromUserId, message.toUserId].includes(currentUser.id) &&
      [message.fromUserId, message.toUserId].includes(targetUser.id);

    return !belongsToOpenConversation;
  });

  if (state.messages.length === beforeCount) {
    showToast("That message could not be deleted.");
    return;
  }

  await saveState();
  renderMessages();
  showToast("Message deleted.");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildEmojiPicker() {
  els.emojiPicker.innerHTML = "";

  EMOJIS.forEach((emoji) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "emoji-option";
    button.textContent = emoji;
    button.addEventListener("click", () => {
      insertEmoji(emoji);
      closeEmojiPicker();
    });
    els.emojiPicker.appendChild(button);
  });
}

function insertEmoji(emoji) {
  const input = els.messageInput;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
  const caret = start + emoji.length;
  input.focus();
  input.setSelectionRange(caret, caret);
}

function toggleEmojiPicker() {
  els.emojiPicker.classList.toggle("hidden");
}

function toggleThemePanel() {
  els.themePanel.classList.toggle("hidden");
}

function closeEmojiPicker() {
  els.emojiPicker.classList.add("hidden");
}

function renderComposerPreview() {
  const attachment = state.pendingAttachment;

  if (!attachment) {
    els.composerPreview.classList.add("hidden");
    els.composerPreview.innerHTML = "";
    return;
  }

  const thumb = attachment.kind === "image"
    ? `<img class="composer-preview-thumb" src="${attachment.dataUrl}" alt="${escapeHtml(attachment.name)}">`
    : `<div class="composer-preview-thumb composer-preview-video">VID</div>`;

  els.composerPreview.innerHTML = `
    <div class="composer-preview-main">
      ${thumb}
      <div class="composer-preview-copy">
        <strong>${attachment.kind === "image" ? "Image ready" : "Video ready"}</strong>
        <span>${escapeHtml(attachment.name)}</span>
      </div>
    </div>
    <button type="button" id="clear-attachment-btn" class="ghost-btn">Remove</button>
  `;
  els.composerPreview.classList.remove("hidden");
  document.getElementById("clear-attachment-btn").addEventListener("click", clearPendingAttachment);
}

function clearPendingAttachment() {
  state.pendingAttachment = null;
  els.fileInput.value = "";
  renderComposerPreview();
}

function handleUploadClick() {
  els.fileInput.click();
}

function handleFileSelection(event) {
  const [file] = event.target.files || [];

  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    showToast("Please upload an image or video file.");
    clearPendingAttachment();
    return;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    showToast("Files must be 15 MB or smaller.");
    clearPendingAttachment();
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.pendingAttachment = {
      kind: file.type.startsWith("image/") ? "image" : "video",
      name: file.name,
      mimeType: file.type,
      dataUrl: reader.result,
    };
    renderComposerPreview();
  });
  reader.readAsDataURL(file);
}

function attachEvents() {
  els.signupForm.addEventListener("submit", (event) => {
    handleSignup(event).catch((error) => {
      console.error("PulseChat signup failed", error);
      showToast("Could not create that account right now.");
    });
  });
  els.loginForm.addEventListener("submit", (event) => {
    handleLogin(event).catch((error) => {
      console.error("PulseChat login failed", error);
      showToast("Could not log in right now.");
    });
  });
  els.logoutBtn.addEventListener("click", () => {
    handleLogout().catch((error) => {
      console.error("PulseChat logout failed", error);
      showToast("Could not log out right now.");
    });
  });
  els.userSearch.addEventListener("input", renderUserList);
  els.friendsBtn.addEventListener("click", () => {
    setViewMode("friends");
  });
  els.backToFriendsBtn.addEventListener("click", () => {
    setViewMode("friends");
  });
  els.showSignupBtn.addEventListener("click", () => {
    setAuthMode("signup");
  });
  els.showLoginBtn.addEventListener("click", () => {
    setAuthMode("login");
  });
  els.messageForm.addEventListener("submit", (event) => {
    handleSendMessage(event).catch((error) => {
      console.error("PulseChat send failed", error);
      showToast("Message could not be sent. Please try again.");
    });
  });
  els.sendBtn.addEventListener("click", (event) => {
    handleSendMessage(event).catch((error) => {
      console.error("PulseChat send failed", error);
      showToast("Message could not be sent. Please try again.");
    });
  });
  els.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      handleSendMessage(event).catch((error) => {
        console.error("PulseChat send failed", error);
        showToast("Message could not be sent. Please try again.");
      });
    }
  });
  els.uploadBtn.addEventListener("click", handleUploadClick);
  els.fileInput.addEventListener("change", handleFileSelection);
  els.emojiBtn.addEventListener("click", toggleEmojiPicker);
  els.themeBtn.addEventListener("click", toggleThemePanel);
  els.changeLikedBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showLikedPrompt();
  });
  els.saveLikedBtn.addEventListener("click", () => {
    saveLikedThing().catch((error) => {
      console.error("PulseChat liked save failed", error);
      showToast("Could not update loved text right now.");
    });
  });
  els.likedInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveLikedThing().catch((error) => {
        console.error("PulseChat liked save failed", error);
        showToast("Could not update loved text right now.");
      });
    }
  });
  document.addEventListener("click", (event) => {
    if (!els.emojiPicker.contains(event.target) && event.target !== els.emojiBtn) {
      closeEmojiPicker();
    }
    if (!els.themePanel.contains(event.target) && event.target !== els.themeBtn) {
      els.themePanel.classList.add("hidden");
    }
    if (!els.likedEditor.contains(event.target) && !els.changeLikedBtn.contains(event.target)) {
      if (getCurrentUser()?.likedThing) {
        closeLikedEditor();
      }
    }
  });
}

async function init() {
  await loadState();
  buildEmojiPicker();
  renderComposerPreview();
  attachEvents();
  renderAuth();
}

init().catch((error) => {
  console.error("PulseChat failed to initialize", error);
  showToast("PulseChat could not start correctly.");
});
