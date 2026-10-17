const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { searchContext } = require("./lib/retrieval");
const { searchWikipedia } = require("./lib/public-search");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const KNOWLEDGE = JSON.parse(fs.readFileSync(path.join(ROOT, "knowledge.json"), "utf8"));
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { users: {}, sessions: {} };
  }
}

let store = readStore();

function saveStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporaryFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryFile, DATA_FILE);
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error("Request is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("Invalid request.")); }
    });
    request.on("error", reject);
  });
}

function cookieValue(request, name) {
  const cookies = (request.headers.cookie || "").split(";").map((item) => item.trim());
  const match = cookies.find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function getUser(request) {
  const token = cookieValue(request, "blink_session");
  const userId = store.sessions[token];
  return userId ? store.users[userId] : null;
}

function setSession(response, user) {
  const token = crypto.randomBytes(32).toString("hex");
  store.sessions[token] = user.id;
  saveStore();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("set-cookie", `blink_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`);
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, guest: user.guest };
}

function tokenize(text) {
  return (String(text || "").toLowerCase().match(/[a-z0-9']+|[.!?]/g) || []).slice(-4000);
}

function rememberFacts(user, messages) {
  const existing = new Set(user.memories || []);
  for (const message of messages) {
    if (message.role !== "user") continue;
    const match = message.content.match(/(?:remember that|my name is|i live in|i work as|i like|i love|i prefer|my goal is)\s+(.{3,140})/i);
    if (match) existing.add(match[0].trim().replace(/[.!?]+$/, ""));
  }
  user.memories = [...existing].slice(-30);
}

async function reply(user, history, prompt, usePublicLookup) {
  const lower = prompt.toLowerCase();
  const memories = user.memories || [];
  if (/\b(hello|hi|hey)\b/.test(lower)) return `Hi${user.name ? ` ${user.name.split(" ")[0]}` : ""}! What would you like to work on?`;
  if (/\bremember that\b/.test(lower)) return `Got it. I’ll remember: ${prompt.replace(/.*\bremember that\b/i, "").trim()}`;
  if (/\b(what do you remember|what do you know about me|what have i told you)\b/.test(lower)) {
    return memories.length ? `Here’s what I’ve saved from your chats: ${memories.join("; ")}.` : "I don’t have any explicit memories saved yet. Tell me “remember that …” and I’ll keep it in your account.";
  }

  const sources = KNOWLEDGE.map((item) => ({ ...item, kind: "guide" }));
  for (const document of user.documents || []) sources.push({ title: `Uploaded file: ${document.name}`, text: document.content, kind: "upload" });
  for (const memory of memories) sources.push({ title: "Saved preference", text: memory, kind: "memory" });
  for (const chat of (user.chats || []).slice(0, 15)) {
    for (const message of (chat.messages || []).slice(-20)) {
      if (message.role === "user" && message.content && message.content.trim().toLowerCase() !== prompt.trim().toLowerCase()) {
        sources.push({ title: `Your chat: ${chat.title}`, text: message.content, kind: "chat" });
      }
    }
  }
  for (const message of history.slice(-15)) {
    if (message.role === "user" && message.content) sources.push({ title: "This conversation", text: message.content, kind: "chat" });
  }
  const matches = searchContext(prompt, sources, 1);
  if (matches.length) return `I found this in your local sources:\n\n${matches[0].title}\n${matches[0].text}`;
  if (usePublicLookup) {
    const reference = await searchWikipedia(prompt);
    if (reference) return `I couldn’t find that in my saved guides, so I looked it up in a public reference. Here’s a starting point:\n\n${reference.title}\n${reference.extract}\n\nSource: ${reference.title}\n${reference.url}`;
  }
  return "I couldn’t find a grounded answer in Blink’s local guides or saved notes. You can enable public reference lookup in Settings, attach a text/Markdown note, or try a topic in Blink’s local guides.";
}

function safeMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-80).map((message) => ({
    id: String(message.id || crypto.randomUUID()),
    role: message.role === "assistant" ? "assistant" : "user",
    content: String(message.content || "").slice(0, 12000),
    files: Array.isArray(message.files) ? message.files.slice(0, 5).map((file) => ({ name: String(file.name || "File").slice(0, 100), type: String(file.type || "").slice(0, 80), data: String(file.data || "").slice(0, 2_500_000) })) : [],
    createdAt: Number(message.createdAt) || Date.now()
  }));
}

async function handleApi(request, response, url) {
  const route = `${request.method} ${url.pathname}`;
  if (route === "GET /api/health") return send(response, 200, { ok: true, model: "Blink Core local retrieval with optional public references" });
  if (route === "GET /api/session") {
    const user = getUser(request);
    return send(response, 200, { user: user ? publicUser(user) : null });
  }
  if (route === "POST /api/auth/signup" || route === "POST /api/auth/login" || route === "POST /api/auth/guest") {
    const body = await readBody(request);
    if (route.endsWith("/guest")) {
      const user = { id: crypto.randomUUID(), name: "Guest", email: "", guest: true, chats: [], memories: [] };
      store.users[user.id] = user;
      setSession(response, user);
      return send(response, 200, { user: publicUser(user) });
    }
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return send(response, 400, { error: "Enter a valid email and a password with at least 8 characters." });
    let user = Object.values(store.users).find((item) => item.email === email);
    if (route.endsWith("/signup")) {
      if (user) return send(response, 409, { error: "An account with that email already exists." });
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = crypto.scryptSync(password, salt, 64).toString("hex");
      user = { id: crypto.randomUUID(), name: String(body.name || email.split("@")[0]).trim().slice(0, 60), email, guest: false, salt, hash, chats: [], memories: [] };
      store.users[user.id] = user;
    } else {
      if (!user || !crypto.timingSafeEqual(Buffer.from(user.hash || ""), Buffer.from(crypto.scryptSync(password, user.salt || "", 64).toString("hex")))) return send(response, 401, { error: "Email or password is incorrect." });
    }
    setSession(response, user);
    return send(response, 200, { user: publicUser(user) });
  }
  if (route === "POST /api/auth/logout") {
    const token = cookieValue(request, "blink_session");
    const userId = store.sessions[token];
    delete store.sessions[token];
    if (store.users[userId]?.guest) delete store.users[userId];
    saveStore();
    return send(response, 200, { ok: true }, { "set-cookie": "blink_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
  }
  const user = getUser(request);
  if (!user) return send(response, 401, { error: "Please sign in again." });
  if (route === "GET /api/chats") return send(response, 200, { chats: user.chats || [], memories: user.memories || [], documents: (user.documents || []).map(({ name, updatedAt }) => ({ name, updatedAt })) });
  if (route === "DELETE /api/settings/knowledge") {
    user.memories = [];
    user.documents = [];
    saveStore();
    return send(response, 200, { ok: true });
  }
  if (request.method === "DELETE" && url.pathname.startsWith("/api/chats/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/chats/".length));
    user.chats = (user.chats || []).filter((chat) => chat.id !== id);
    saveStore();
    return send(response, 200, { ok: true });
  }
  if (route === "DELETE /api/chats") {
    user.chats = [];
    saveStore();
    return send(response, 200, { ok: true });
  }
  if (route === "POST /api/chats") {
    const body = await readBody(request);
    const chat = { id: String(body.id || crypto.randomUUID()), title: String(body.title || "New chat").slice(0, 80), messages: safeMessages(body.messages), updatedAt: Date.now() };
    user.chats = user.chats || [];
    user.chats = [chat, ...user.chats.filter((item) => item.id !== chat.id)].slice(0, 40);
    rememberFacts(user, chat.messages);
    saveStore();
    return send(response, 200, { chat, memories: user.memories });
  }
  if (route === "POST /api/chat") {
    const body = await readBody(request);
    const prompt = String(body.prompt || "").trim().slice(0, 12000);
    const history = safeMessages(body.history);
    const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 5).map((file) => ({ name: String(file.name || "File").slice(0, 100), type: String(file.type || "").slice(0, 80), content: String(file.content || "").slice(0, 12000) })) : [];
    if (!prompt) return send(response, 400, { error: "Write a message first." });
    user.documents = user.documents || [];
    for (const file of attachments.filter((item) => item.content)) {
      user.documents = user.documents.filter((document) => document.name !== file.name);
      user.documents.push({ name: file.name, content: file.content, updatedAt: Date.now() });
    }
    user.documents = user.documents.slice(-20);
    let answer = await reply(user, history, prompt, body.usePublicLookup === true);
    if (attachments.some((file) => file.type?.startsWith("image/"))) answer += "\n\nI received your image, but Blink Core cannot inspect image pixels yet.";
    if (attachments.some((file) => !file.content && !file.type?.startsWith("image/"))) answer += "\n\nI received the file, but can only read plain-text and Markdown files.";
    rememberFacts(user, [...history, { role: "user", content: prompt }]);
    saveStore();
    return send(response, 200, { answer, memories: user.memories });
  }
  if (route === "POST /api/settings/password") {
    if (user.guest) return send(response, 400, { error: "Create an account to change a password." });
    const body = await readBody(request);
    const current = crypto.scryptSync(String(body.current || ""), user.salt, 64).toString("hex");
    if (!crypto.timingSafeEqual(Buffer.from(user.hash), Buffer.from(current))) return send(response, 401, { error: "Current password is incorrect." });
    if (String(body.password || "").length < 8) return send(response, 400, { error: "New passwords must be at least 8 characters." });
    user.salt = crypto.randomBytes(16).toString("hex");
    user.hash = crypto.scryptSync(String(body.password), user.salt, 64).toString("hex");
    saveStore();
    return send(response, 200, { ok: true });
  }
  if (route === "POST /api/auth/forgot") {
    return send(response, 501, { error: "Password reset email is not configured. Add an email provider before deploying account recovery." });
  }
  return send(response, 404, { error: "Not found." });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    try { await handleApi(request, response, url); }
    catch (error) { if (!response.headersSent) send(response, 500, { error: error.message || "Something went wrong." }); }
    return;
  }
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = path.resolve(ROOT, "public", `.${requested}`);
  if (!file.startsWith(path.resolve(ROOT, "public") + path.sep)) return send(response, 403, { error: "Forbidden." });
  fs.readFile(file, (error, data) => {
    if (error) return send(response, 404, { error: "Not found." });
    response.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": path.extname(file) === ".html" ? "no-cache" : "public, max-age=3600" });
    response.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => console.log(`Blink.ai is ready at http://localhost:${PORT}`));