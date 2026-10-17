const $ = (selector) => document.querySelector(selector);
const state = { user: null, chats: [], currentId: null, messages: [], files: [], view: "chat", theme: localStorage.getItem("blink-theme") || "light", authMode: "welcome", toastTimer: null };
const authScreen = $("#authScreen");
const authContent = $("#authContent");
const appShell = $("#appShell");

function api(url, options = {}) {
  return fetch(url, { ...options, headers: { "content-type": "application/json", ...options.headers }, credentials: "same-origin" }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#20241f" : "#fbfaf7";
  localStorage.setItem("blink-theme", theme);
}

function authMarkup(mode) {
  if (mode === "welcome") return `<h1>A little room<br>to <span>think.</span></h1><p>Meet Blink.ai, your own small, independent space for ideas and conversations.</p><div class="auth-actions"><button class="auth-primary" data-auth="signup">Create an account</button><button class="auth-secondary" data-auth="login">Sign in</button></div><div class="auth-divider">or keep it simple</div><div class="auth-actions"><button class="auth-secondary" data-auth="guest">Continue as guest</button></div>`;
  if (mode === "forgot") return `<button class="auth-back" data-auth="welcome">← Back</button><h1>Reset password</h1><p>Enter your account email to request a reset. Blink.ai needs an email provider to send recovery links.</p><form class="form-stack" data-form="forgot"><label class="field-label">Email address<input name="email" type="email" autocomplete="email" required></label><div class="form-error" role="alert"></div><button class="auth-primary" type="submit">Request reset link</button></form>`;
  const signup = mode === "signup";
  return `<button class="auth-back" data-auth="welcome">← Back</button><h1>${signup ? "Create your account" : "Welcome back"}</h1><p>${signup ? "Your conversations, your corner of the internet." : "Pick up where you left off."}</p><form class="form-stack" data-form="${mode}">${signup ? '<label class="field-label">Your name<input name="name" autocomplete="name" maxlength="60" required></label>' : ""}<label class="field-label">Email address<input name="email" type="email" autocomplete="email" required></label><label class="field-label">Password<input name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="8" required></label><div class="form-error" role="alert"></div><button class="auth-primary" type="submit">${signup ? "Create account" : "Sign in"}</button></form>${signup ? "" : '<div class="auth-switch"><button data-auth="forgot">Forgot password?</button></div>'}<div class="auth-switch">${signup ? "Already have an account?" : "New to Blink.ai?"}<button data-auth="${signup ? "login" : "signup"}">${signup ? "Sign in" : "Create an account"}</button></div>`;
}

function showAuth(mode = "welcome") {
  state.authMode = mode;
  authContent.innerHTML = authMarkup(mode);
  authScreen.hidden = false;
  appShell.hidden = true;
}

async function enterApp(user) {
  state.user = user;
  authScreen.hidden = true;
  appShell.hidden = false;
  $("#profileName").textContent = user.name || "Guest";
  $("#profileEmail").textContent = user.guest ? "Guest session" : user.email;
  $("#avatar").textContent = (user.name || "B").slice(0, 1).toUpperCase();
  setTheme(state.theme);
  await loadChats();
  newChat();
}

async function loadChats() {
  const data = await api("/api/chats");
  state.chats = data.chats || [];
  state.user.memories = data.memories || [];
  renderChatList();
}

function renderChatList() {
  const list = $("#chatList");
  list.replaceChildren();
  for (const chat of state.chats) {
    const item = document.createElement("div");
    item.className = `history-item${chat.id === state.currentId ? " selected" : ""}`;
    const open = document.createElement("button");
    open.className = "history-open";
    open.textContent = chat.title || "New chat";
    open.title = open.textContent;
    open.addEventListener("click", () => openChat(chat));
    const remove = document.createElement("button");
    remove.className = "history-delete";
    remove.title = "Delete chat";
    remove.textContent = "×";
    remove.addEventListener("click", async () => {
      try {
        await api(`/api/chats/${encodeURIComponent(chat.id)}`, { method: "DELETE" });
        state.chats = state.chats.filter((entry) => entry.id !== chat.id);
        if (state.currentId === chat.id) newChat();
        renderChatList();
      } catch (error) { showToast(error.message); }
    });
    item.append(open, remove);
    list.append(item);
  }
}

function newChat() {
  state.currentId = crypto.randomUUID();
  state.messages = [];
  state.files = [];
  state.view = "chat";
  $("#welcome").hidden = false;
  $("#conversation").replaceChildren();
  $("#settingsView").hidden = true;
  $("#studioView").hidden = true;
  $("#composerWrap").hidden = false;
  $("#footerNote").hidden = false;
  $("#messageInput").value = "";
  $("#messageInput").disabled = false;
  $("#messageInput").placeholder = "Message Blink.ai";
  renderAttachments();
  renderChatList();
  setActiveNav("chat");
}

function openChat(chat) {
  state.currentId = chat.id;
  state.messages = chat.messages || [];
  state.view = "chat";
  $("#welcome").hidden = state.messages.length > 0;
  $("#conversation").replaceChildren();
  state.messages.forEach(renderMessage);
  $("#settingsView").hidden = true;
  $("#studioView").hidden = true;
  $("#composerWrap").hidden = false;
  $("#footerNote").hidden = false;
  setActiveNav("chat");
  renderChatList();
  scrollConversation();
  closeMobileSidebar();
}

function setActiveNav(view) {
  document.querySelectorAll(".side-link").forEach((link) => link.classList.toggle("active", link.dataset.view === view));
}

function addMessage(role, content, files = []) {
  const message = { id: crypto.randomUUID(), role, content, files, createdAt: Date.now() };
  state.messages.push(message);
  renderMessage(message);
  return message;
}

function renderMessage(message) {
  const wrapper = document.createElement("article");
  wrapper.className = `message ${message.role}`;
  if (message.role === "user") {
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = message.content;
    wrapper.append(bubble);
  } else {
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "b.";
    const body = document.createElement("div");
    body.className = "message-body";
    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = "Blink Core";
    const text = document.createElement("div");
    text.textContent = message.content;
    body.append(label, text);
    wrapper.append(avatar, body);
  }
  if (message.files?.length) {
    const target = wrapper.querySelector(".message-bubble") || wrapper.querySelector(".message-body");
    const files = document.createElement("div");
    files.className = "message-files";
    for (const file of message.files) {
      if (file.type?.startsWith("image/") && file.data) {
        const image = document.createElement("img");
        image.className = "message-file-image";
        image.src = file.data;
        image.alt = file.name;
        files.append(image);
      } else {
        const name = document.createElement("span");
        name.className = "message-file-name";
        name.textContent = `▤ ${file.name}`;
        files.append(name);
      }
    }
    target.append(files);
  }
  $("#conversation").append(wrapper);
}

function showTyping() {
  const wrapper = document.createElement("div");
  wrapper.className = "message assistant typing";
  wrapper.innerHTML = '<div class="message-avatar">b.</div><div class="message-body"><div class="message-label">Blink Core is thinking</div><div class="typing-dots"><span></span><span></span><span></span></div></div>';
  $("#conversation").append(wrapper);
  scrollConversation();
  return wrapper;
}

function scrollConversation() {
  const panel = $("#conversation");
  panel.scrollTop = panel.scrollHeight;
}

async function saveChat() {
  const firstUserMessage = state.messages.find((message) => message.role === "user");
  const title = firstUserMessage?.content.slice(0, 42) || "New chat";
  const messages = state.messages.map((message) => ({ ...message, files: message.files?.map(({ name, type }) => ({ name, type })) || [] }));
  const data = await api("/api/chats", { method: "POST", body: JSON.stringify({ id: state.currentId, title, messages }) });
  state.chats = [data.chat, ...state.chats.filter((chat) => chat.id !== data.chat.id)];
  renderChatList();
}

async function sendMessage(text) {
  const prompt = text.trim();
  if (!prompt || $("#sendButton").disabled) return;
  $("#welcome").hidden = true;
  const files = state.files.splice(0);
  renderAttachments();
  addMessage("user", prompt, files);
  const history = state.messages.map(({ role, content }) => ({ role, content }));
  $("#messageInput").value = "";
  $("#messageInput").style.height = "auto";
  $("#sendButton").disabled = true;
  const typing = showTyping();
  try {
    const result = await api("/api/chat", { method: "POST", body: JSON.stringify({ prompt, history, attachments: files.map(({ name, type, content }) => ({ name, type, content })) }) });
    typing.remove();
    addMessage("assistant", result.answer);
    await saveChat();
  } catch (error) {
    typing.remove();
    addMessage("assistant", `I couldn’t reach Blink Core just now: ${error.message}`);
    showToast(error.message);
  } finally {
    $("#sendButton").disabled = !$("#messageInput").value.trim();
    scrollConversation();
  }
}

function renderAttachments() {
  const list = $("#attachmentList");
  list.replaceChildren();
  state.files.forEach((file, index) => {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";
    if (file.type?.startsWith("image/") && file.data) {
      const image = document.createElement("img");
      image.src = file.data;
      image.alt = "";
      chip.append(image);
    }
    const name = document.createElement("span");
    name.textContent = file.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${file.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => { state.files.splice(index, 1); renderAttachments(); });
    chip.append(name, remove);
    list.append(chip);
  });
}

async function handleFiles(fileList) {
  for (const file of [...fileList].slice(0, 5 - state.files.length)) {
    if (file.size > 2_000_000) { showToast(`${file.name} is over the 2 MB attachment limit.`); continue; }
    const textFile = ["text/plain", "text/markdown"].includes(file.type) || /\.(txt|md)$/i.test(file.name);
    const content = textFile ? (await file.text()).slice(0, 12000) : "";
    const data = await new Promise((resolve) => {
      if (!file.type.startsWith("image/")) return resolve("");
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
    state.files.push({ name: file.name, type: file.type || "application/octet-stream", data, content });
  }
  renderAttachments();
}

function showSettings() {
  state.view = "settings";
  $("#welcome").hidden = true;
  $("#conversation").replaceChildren();
  $("#studioView").hidden = true;
  $("#settingsView").hidden = false;
  $("#composerWrap").hidden = true;
  $("#footerNote").hidden = true;
  setActiveNav("");
  const theme = state.theme;
  const accountMessage = state.user.guest ? "You are browsing as a guest. Create an account to keep your chats between visits." : `Signed in as ${escapeHtml(state.user.email)}. Your local model learns only from text in your own chats.`;
  $("#settingsView").innerHTML = `<h1 class="page-heading">Settings</h1><p class="page-subtitle">A few things to make Blink feel like yours.</p><section class="settings-section"><h2>Appearance</h2><p>Choose a theme for this device.</p><div class="setting-row"><strong>Color theme</strong><div class="theme-switch"><button data-theme-choice="light" class="${theme === "light" ? "selected" : ""}">☼ Light</button><button data-theme-choice="dark" class="${theme === "dark" ? "selected" : ""}">☾ Dark</button></div></div></section><section class="settings-section"><h2>Account</h2><p>${accountMessage}</p>${state.user.guest ? '<button class="outline-button" data-auth="signup">Create an account</button>' : `<div class="setting-row"><div><strong>Change password</strong><small>Use at least 8 characters.</small></div><button class="outline-button" id="passwordButton">Update password</button></div><div id="passwordForm"></div>`}<div class="setting-row"><strong>Current session</strong><button class="outline-button" id="logoutButton">${state.user.guest ? "Exit guest session" : "Sign out"}</button></div></section><section class="settings-section"><h2>Memory</h2><p>Blink Core keeps short details you explicitly asked it to remember, plus your saved conversations.</p><div class="account-note">${(state.user.memories || []).map(escapeHtml).join("<br>") || "No personal notes saved yet."}</div></section><section class="settings-section"><h2>About Blink Core</h2><p>An experimental in-house statistical language model. It does not use external AI services, and it is not a large language model.</p></section>`;
  $("#settingsView").querySelectorAll("[data-theme-choice]").forEach((button) => button.addEventListener("click", () => { setTheme(button.dataset.themeChoice); showSettings(); }));
  $("#passwordButton")?.addEventListener("click", () => renderPasswordForm());
  $("#logoutButton").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST", body: "{}" }); state.user = null; showAuth(); });
  $("#settingsView").querySelector("[data-auth='signup']")?.addEventListener("click", () => showAuth("signup"));
  closeMobileSidebar();
}

function renderPasswordForm() {
  const target = $("#passwordForm");
  target.innerHTML = `<form class="form-stack" data-form="password"><label class="field-label">Current password<input name="current" type="password" autocomplete="current-password" required></label><label class="field-label">New password<input name="password" type="password" autocomplete="new-password" minlength="8" required></label><div class="form-error" role="alert"></div><button class="primary-button" type="submit">Save password</button></form>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function seededNumber(text) {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return () => { value += 0x6D2B79F5; let next = value; next = Math.imul(next ^ next >>> 15, next | 1); next ^= next + Math.imul(next ^ next >>> 7, next | 61); return ((next ^ next >>> 14) >>> 0) / 4294967296; };
}

function makeArtwork(prompt) {
  const random = seededNumber(prompt.toLowerCase());
  const palettes = [["#f7eee1", "#dc755c", "#557c68", "#e4bc69", "#426c88"], ["#e6e9df", "#557e70", "#d47b58", "#e8c866", "#6e789a"], ["#f2e5d9", "#b35945", "#698267", "#d5a253", "#4e7480"]];
  const colors = palettes[Math.floor(random() * palettes.length)];
  const shapes = Array.from({ length: 15 }, (_, index) => {
    const x = Math.round(random() * 1000), y = Math.round(random() * 600), size = Math.round(35 + random() * 150), color = colors[1 + Math.floor(random() * 4)];
    return index % 3 === 0 ? `<circle cx="${x}" cy="${y}" r="${size / 2}" fill="${color}" opacity=".82"/>` : index % 3 === 1 ? `<rect x="${x}" y="${y}" width="${size}" height="${Math.round(size * (.45 + random()))}" rx="${Math.round(random() * 40)}" transform="rotate(${Math.round(random() * 120 - 60)} ${x} ${y})" fill="${color}" opacity=".8"/>` : `<path d="M${x} ${y} Q${x + size} ${y - size} ${x + size * 1.4} ${y + size} T${x + size * 2.1} ${y}" fill="none" stroke="${color}" stroke-width="${Math.round(12 + random() * 26)}" stroke-linecap="round" opacity=".75"/>`;
  }).join("");
  const title = escapeHtml(prompt.slice(0, 75));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 625"><rect width="1000" height="625" fill="${colors[0]}"/><path d="M0 485 Q250 420 500 500 T1000 460 V625 H0Z" fill="#ffffff" opacity=".24"/>${shapes}<text x="54" y="555" fill="#383b33" font-family="Georgia,serif" font-size="20" opacity=".8">${title}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function showStudio() {
  state.view = "images";
  $("#welcome").hidden = true;
  $("#conversation").replaceChildren();
  $("#settingsView").hidden = true;
  $("#studioView").hidden = false;
  $("#composerWrap").hidden = true;
  $("#footerNote").hidden = true;
  setActiveNav("images");
  $("#studioView").innerHTML = `<h1 class="page-heading">Image studio</h1><p class="page-subtitle">Turn a few words into an original, downloadable geometric sketch.</p><form class="studio-form" id="studioForm"><input name="prompt" placeholder="A quiet garden after the rain" maxlength="100" required aria-label="Image prompt"><button class="primary-button" type="submit">Create image</button></form><div id="artworkResult"></div><div class="account-note">Blink sketches are drawn from scratch in your browser. They are original procedural artwork, not photorealistic or AI-generated images.</div>`;
  $("#studioForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const prompt = new FormData(event.currentTarget).get("prompt").trim();
    if (!prompt) return;
    const imageUrl = makeArtwork(prompt);
    const result = $("#artworkResult");
    result.replaceChildren();
    const card = document.createElement("div");
    card.className = "artwork";
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = `Procedural sketch inspired by ${prompt}`;
    const caption = document.createElement("div");
    caption.className = "artwork-caption";
    const label = document.createElement("span");
    label.textContent = prompt;
    const download = document.createElement("a");
    download.className = "download-link";
    download.href = imageUrl;
    download.download = "blink-sketch.svg";
    download.textContent = "Download SVG";
    caption.append(label, download);
    card.append(image, caption);
    result.append(card);
  });
  closeMobileSidebar();
}

function closeMobileSidebar() { $("#sidebar").classList.remove("mobile-open"); }

authScreen.addEventListener("click", async (event) => {
  const authButton = event.target.closest("[data-auth]");
  if (authButton) {
    const mode = authButton.dataset.auth;
    if (mode === "guest") {
      try { const { user } = await api("/api/auth/guest", { method: "POST", body: "{}" }); await enterApp(user); }
      catch (error) { showToast(error.message); }
    } else showAuth(mode);
  }
});

authScreen.addEventListener("submit", async (event) => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const error = form.querySelector(".form-error");
  const mode = form.dataset.form;
  try {
    if (mode === "forgot") {
      await api("/api/auth/forgot", { method: "POST", body: JSON.stringify(values) });
      error.textContent = "If that account exists, recovery instructions will arrive by email.";
      return;
    }
    const { user } = await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(values) });
    await enterApp(user);
  } catch (exception) { error.textContent = exception.message; }
});

$("#settingsView").addEventListener("submit", async (event) => {
  const form = event.target.closest("form[data-form='password']");
  if (!form) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const error = form.querySelector(".form-error");
  try { await api("/api/settings/password", { method: "POST", body: JSON.stringify(values) }); showToast("Password updated."); form.reset(); }
  catch (exception) { error.textContent = exception.message; }
});

$("#chatForm").addEventListener("submit", (event) => { event.preventDefault(); sendMessage($("#messageInput").value); });
$("#messageInput").addEventListener("input", (event) => {
  const input = event.currentTarget;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
  $("#sendButton").disabled = !input.value.trim();
});
$("#messageInput").addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); $("#chatForm").requestSubmit(); } });
$("#attachButton").addEventListener("click", () => $("#fileInput").click());
$("#fileInput").addEventListener("change", async (event) => { await handleFiles(event.target.files); event.target.value = ""; });
$("#newChatButton").addEventListener("click", newChat);
$("#settingsButton").addEventListener("click", showSettings);
$("#mobileSettingsButton").addEventListener("click", showSettings);
$("#mobileMenuButton").addEventListener("click", () => $("#sidebar").classList.toggle("mobile-open"));
$("#collapseButton").addEventListener("click", () => appShell.classList.toggle("sidebar-collapsed"));
$(".side-link[data-view='chat']").addEventListener("click", newChat);
$(".side-link[data-view='images']").addEventListener("click", showStudio);
$("#clearHistoryButton").addEventListener("click", async () => {
  if (!state.chats.length) return;
  try { await api("/api/chats", { method: "DELETE" }); state.chats = []; newChat(); showToast("Recent chats cleared."); }
  catch (error) { showToast(error.message); }
});
document.querySelectorAll(".prompt-card").forEach((button) => button.addEventListener("click", () => sendMessage(button.dataset.prompt)));
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); newChat(); $("#messageInput").focus(); }
  if (event.key === "Escape") closeMobileSidebar();
});
document.querySelectorAll(".side-link").forEach((button) => button.addEventListener("click", closeMobileSidebar));

setTheme(state.theme);
fetch("/api/session").then((response) => response.json()).then(({ user }) => user ? enterApp(user) : showAuth()).catch(() => showAuth());
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});