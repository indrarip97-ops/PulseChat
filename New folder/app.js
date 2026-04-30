const STORAGE_KEY = "pulsechat-app";
const MESSAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const state = {
  users: [],
  messages: [],
  currentUserId: null,
  activeChatUserId: null,
};

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
  currentDisplayName: document.getElementById("current-display-name"),
  currentUsername: document.getElementById("current-username"),
  logoutBtn: document.getElementById("logout-btn"),
  userSearch: document.getElementById("user-search"),
  userResults: document.getElementById("user-results"),
  chatEmpty: document.getElementById("chat-empty"),
  chatWindow: document.getElementById("chat-window"),
  chatTargetName: document.getElementById("chat-target-name"),
  chatTargetUsername: document.getElementById("chat-target-username"),
  messageList: document.getElementById("message-list"),
  messageForm: document.getElementById("message-form"),
  messageInput: document.getElementById("message-input"),
  toast: document.getElementById("toast"),
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    cleanupExpiredMessages();
    saveState();
    return;
  }

  const parsed = JSON.parse(saved);
  state.users = parsed.users || [];
  state.messages = parsed.messages || [];
  state.currentUserId = parsed.currentUserId || null;
  cleanupExpiredMessages();
}

function saveState() {
  cleanupExpiredMessages();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      users: state.users,
      messages: state.messages,
      currentUserId: state.currentUserId,
    }),
  );
}

function createUserRecord(displayName, email, password) {
  return {
    id: crypto.randomUUID(),
    displayName,
    email: email.trim().toLowerCase(),
    password,
    username: createUniqueUsername(displayName),
    createdAt: new Date().toISOString(),
  };
}

function createMessageRecord(fromUserId, toUserId, text) {
  return {
    id: crypto.randomUUID(),
    fromUserId,
    toUserId,
    text,
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

  if (!currentUser) {
    return;
  }

  els.currentDisplayName.textContent = currentUser.displayName;
  els.currentUsername.textContent = currentUser.username;
  renderUserList();
  renderMessages();
}

function renderUserList() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    return;
  }

  const query = els.userSearch.value.trim().toLowerCase();
  const users = state.users
    .filter((user) => user.id !== currentUser.id)
    .filter((user) => {
      if (!query) {
        return true;
      }

      return (
        user.displayName.toLowerCase().includes(query) ||
        user.username.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  els.userResults.innerHTML = "";

  if (users.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No users match your search yet.";
    els.userResults.appendChild(empty);
    return;
  }

  users.forEach((user) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `user-card ${state.activeChatUserId === user.id ? "active" : ""}`;
    card.innerHTML = `
      <div class="user-meta">
        <strong>${escapeHtml(user.displayName)}</strong>
        <p>${escapeHtml(user.username)}</p>
      </div>
      <span>Open</span>
    `;
    card.addEventListener("click", () => {
      state.activeChatUserId = user.id;
      renderUserList();
      renderMessages();
    });
    els.userResults.appendChild(card);
  });
}

function renderMessages() {
  const currentUser = getCurrentUser();
  const targetUser = getUserById(state.activeChatUserId);

  if (!currentUser || !targetUser) {
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
    const bubble = document.createElement("article");
    const sentByCurrentUser = message.fromUserId === currentUser.id;
    bubble.className = `message-bubble ${sentByCurrentUser ? "sent" : "received"}`;
    bubble.innerHTML = `
      <div class="message-text">${escapeHtml(message.text)}</div>
      <div class="message-footer">
        <div class="message-meta">${sentByCurrentUser ? "You" : escapeHtml(targetUser.displayName)} - ${formatTime(message.createdAt)}</div>
        <button type="button" class="delete-message-btn" data-message-id="${message.id}">Delete</button>
      </div>
    `;
    els.messageList.appendChild(bubble);
  });

  els.messageList.querySelectorAll(".delete-message-btn").forEach((button) => {
    button.addEventListener("click", () => {
      deleteMessage(button.dataset.messageId);
    });
  });

  els.messageList.scrollTop = els.messageList.scrollHeight;
}

function handleSignup(event) {
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
  state.activeChatUserId = state.users.find((user) => user.id !== newUser.id)?.id || null;
  saveState();
  els.signupForm.reset();
  renderAuth();
  showToast(`Account created. Your username is ${newUser.username}`);
}

function handleLogin(event) {
  event.preventDefault();

  const email = els.loginEmail.value.trim().toLowerCase();
  const password = els.loginPassword.value;
  const user = state.users.find((item) => item.email === email && item.password === password);

  if (!user) {
    showToast("Incorrect email or password.");
    return;
  }

  state.currentUserId = user.id;
  state.activeChatUserId = state.users.find((item) => item.id !== user.id)?.id || null;
  saveState();
  els.loginForm.reset();
  renderAuth();
  showToast(`Welcome back, ${user.displayName}.`);
}

function handleLogout() {
  state.currentUserId = null;
  state.activeChatUserId = null;
  saveState();
  renderAuth();
  showToast("You have logged out.");
}

function handleSendMessage(event) {
  event.preventDefault();

  const currentUser = getCurrentUser();
  const targetUser = getUserById(state.activeChatUserId);
  const text = els.messageInput.value.trim();

  if (!currentUser || !targetUser || !text) {
    return;
  }

  state.messages.push(createMessageRecord(currentUser.id, targetUser.id, text));
  saveState();
  els.messageInput.value = "";
  renderMessages();
}

function deleteMessage(messageId) {
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

  saveState();
  renderMessages();
  showToast("Message deleted.");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function attachEvents() {
  els.signupForm.addEventListener("submit", handleSignup);
  els.loginForm.addEventListener("submit", handleLogin);
  els.logoutBtn.addEventListener("click", handleLogout);
  els.userSearch.addEventListener("input", renderUserList);
  els.messageForm.addEventListener("submit", handleSendMessage);
}

function init() {
  loadState();
  attachEvents();
  renderAuth();
}

init();
