import { createIcons, icons } from "https://cdn.jsdelivr.net/npm/lucide@latest/+esm";

/* ================= CONFIGURACIÓN DE IAs ================= */

const NEXUS_ENGINE = "gpt-4o"; // motor interno de Nexus 1.3

const AIS = {
    "nexus-chat": {
        label: "Nexus 1.3", sub: "Asistente general", kind: "nexus", icon: "sparkles",
        greeting: "Soy Nexus 1.3. ¿En qué puedo ayudarte?",
        suggestions: [
            ["lightbulb", "Explícame algo interesante"],
            ["wand-sparkles", "Ayúdame a crear una idea"],
            ["code", "Ayúdame a programar"],
            ["mail", "Escribe un correo profesional"],
        ],
    },
    "nexus-support": {
        label: "Nexus 1.3", sub: "Atención al cliente", kind: "support", icon: "headset",
        greeting: "Soy el asistente de atención al cliente. ¿En qué te ayudo?",
        suggestions: [
            ["clock", "¿Cuál es su horario de atención?"],
            ["truck", "¿Hacen envíos a domicilio?"],
            ["undo-2", "¿Cómo puedo hacer una devolución?"],
            ["credit-card", "¿Qué métodos de pago aceptan?"],
        ],
    },
    "nexus-image": {
        label: "Nexus 1.3", sub: "Generador de imágenes", kind: "image", icon: "image",
        greeting: "Describe una imagen y la crearé para ti.",
        suggestions: [
            ["shapes", "Un logo minimalista de un zorro morado"],
            ["building-2", "Una ciudad futurista al atardecer"],
            ["rocket", "Un gato astronauta flotando en el espacio"],
            ["coffee", "Una taza de café sobre madera, fotografía"],
        ],
    },
    "openai/gpt-5": {
        label: "Chat GPT 5", sub: "OpenAI", kind: "external", icon: "bot",
        greeting: "Estás hablando con Chat GPT 5 a través de Nexus.",
    },
    "anthropic/claude-sonnet-4": {
        label: "Claude Sonnet 4", sub: "Anthropic", kind: "external", icon: "bot",
        greeting: "Estás hablando con Claude Sonnet 4 a través de Nexus.",
    },
    "google/gemini-2.5-pro": {
        label: "Gemini 2.5", sub: "Google", kind: "external", icon: "bot",
        greeting: "Estás hablando con Gemini 2.5 a través de Nexus.",
    },
};

const DEFAULT_SUGGESTIONS = AIS["nexus-chat"].suggestions;

/* ================= ESTADO ================= */

let chats = [];
let currentChat = null;
let busy = false;
let signedIn = false;
let user = null;
let settings = { bizName: "", bizInfo: "" };
const imgCache = {};

/* ================= ELEMENTOS ================= */

const $ = id => document.getElementById(id);
const messages = $("messages");
const input = $("messageInput");
const sendButton = $("sendButton");
const historyEl = $("history");
const sidebar = document.querySelector(".sidebar");
const overlay = $("overlay");
const aiSelector = $("aiSelector");

const icons_ = () => createIcons({ icons });
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

marked.setOptions({ breaks: true });

function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2400);
}

/* ================= ALMACENAMIENTO (Puter) ================= */

async function loadData() {
    try {
        const [c, s] = await Promise.all([
            puter.kv.get("nexus_chats_v2"),
            puter.kv.get("nexus_settings"),
        ]);
        chats = Array.isArray(c) ? c : c ? JSON.parse(c) : [];
        if (s) settings = typeof s === "string" ? JSON.parse(s) : s;
    } catch (e) {
        console.warn(e);
    }
}

let saveTimer;
function persist() {
    if (!signedIn) return;
    const clean = chats.slice(0, 40).map(chat => ({
        ...chat,
        messages: chat.messages.map(({ src, pending, ...rest }) => rest),
    }));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => puter.kv.set("nexus_chats_v2", clean).catch(console.warn), 300);
}

async function storeImage(src) {
    try {
        const blob = await (await fetch(src)).blob();
        const path = `nexus_images/${uid()}.png`;
        await puter.fs.write(path, blob, { createMissingParents: true });
        return path;
    } catch (e) {
        console.warn(e);
        return null;
    }
}

async function resolveImage(path) {
    if (imgCache[path]) return imgCache[path];
    const blob = await puter.fs.read(path);
    imgCache[path] = URL.createObjectURL(blob);
    return imgCache[path];
}

/* ================= SESIÓN ================= */

function renderAuth() {
    const box = $("authBox");
    if (signedIn) {
        const name = user?.username || "Usuario";
        box.innerHTML = `
            <div class="user-row">
                <div class="initial">${esc(name[0].toUpperCase())}</div>
                <span class="name">${esc(name)}</span>
                <button id="signOut" class="icon-btn" title="Cerrar sesión"><i data-lucide="log-out"></i></button>
            </div>`;
        $("signOut").onclick = () => { puter.auth.signOut(); location.reload(); };
    } else {
        box.innerHTML = `<button id="signIn" class="signin-btn"><i data-lucide="log-in"></i> Iniciar sesión</button>`;
        $("signIn").onclick = signIn;
    }
    $("statusText").textContent = signedIn ? "Nexus está listo" : "Inicia sesión para empezar";
    icons_();
}

async function signIn() {
    try {
        await puter.auth.signIn();
        signedIn = true;
        user = await puter.auth.getUser();
        await loadData();
        renderAuth();
        renderHistory();
        if (!currentChat) showWelcome();
        toast("Sesión iniciada");
    } catch (e) {
        toast("No se pudo iniciar sesión");
    }
}

/* ================= INTERFAZ ================= */

function updateTop() {
    const ai = AIS[aiSelector.value];
    $("topName").textContent = ai.label;
    $("topSub").textContent = ai.sub;
    input.placeholder = ai.kind === "image" ? "Describe una imagen..." : `Escribe un mensaje a ${ai.label}...`;
}

function showWelcome() {
    const ai = AIS[aiSelector.value];
    const sugg = ai.suggestions || DEFAULT_SUGGESTIONS;
    const needsCfg = ai.kind === "support" && !settings.bizInfo;
    const biz = ai.kind === "support" && settings.bizName ? ` de <b>${esc(settings.bizName)}</b>` : "";

    messages.innerHTML = `
        <div class="welcome">
            <div class="welcome-icon"><i data-lucide="${ai.icon}"></i></div>
            <h1>Hola</h1>
            <p>${esc(ai.greeting)}${biz}</p>
            ${needsCfg ? `<button class="cfg-link" id="cfgLink"><i data-lucide="settings-2"></i> Agrega la información de tu negocio</button>` : ""}
            <div class="suggestions">
                ${sugg.map(([icon, text]) => `<button data-prompt="${esc(text)}"><i data-lucide="${icon}"></i>${esc(text)}</button>`).join("")}
            </div>
        </div>`;

    messages.querySelectorAll("[data-prompt]").forEach(b =>
        b.addEventListener("click", () => { input.value = b.dataset.prompt; sendMessage(); })
    );
    if ($("cfgLink")) $("cfgLink").onclick = openSettings;
    icons_();
}

function messageHTML(msg, index) {
    const isUser = msg.role === "user";
    let body;

    if (isUser) {
        body = `<div class="message-text plain">${esc(msg.content)}</div>`;
    } else if (msg.type === "image") {
        if (msg.pending) {
            body = `<div class="img-loading"><i data-lucide="loader-2" class="spin"></i>Generando imagen...</div>`;
        } else if (msg.error) {
            body = `<div class="message-text error-text">${esc(msg.error)}</div>`;
        } else {
            body = `<img class="gen-image" data-path="${esc(msg.path || "")}" ${msg.src ? `src="${esc(msg.src)}"` : ""} alt="${esc(msg.prompt || "")}">
                <div class="msg-actions"><button class="icon-btn" data-download title="Descargar"><i data-lucide="download"></i></button></div>`;
        }
    } else if (msg.pending && !msg.content) {
        body = `<div class="typing"><span></span><span></span><span></span></div>`;
    } else {
        body = `<div class="message-text ${msg.error ? "error-text" : ""}">${marked.parse(msg.content || "")}</div>
            ${msg.pending ? "" : `<div class="msg-actions"><button class="icon-btn" data-copy="${index}" title="Copiar"><i data-lucide="copy"></i></button></div>`}`;
    }

    const tag = !isUser && msg.model ? `<span class="model-tag">${esc(msg.model)}</span>` : "";

    return `
        <div class="message">
            <div class="avatar ${isUser ? "user-avatar" : "ai-avatar"}">${isUser ? "Tú" : "N"}</div>
            <div class="message-content">
                <div class="message-name">${isUser ? "Tú" : "Nexus"} ${tag}</div>
                ${body}
            </div>
        </div>`;
}

function bindActions(root) {
    root.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => {
        navigator.clipboard.writeText(currentChat.messages[b.dataset.copy].content);
        toast("Copiado");
    });
    root.querySelectorAll("[data-download]").forEach(b => b.onclick = () => {
        const img = b.closest(".message-content").querySelector("img");
        const a = document.createElement("a");
        a.href = img.src;
        a.download = "nexus-imagen.png";
        a.click();
    });
    root.querySelectorAll("img[data-path]").forEach(async img => {
        if (!img.getAttribute("src") && img.dataset.path) {
            try { img.src = await resolveImage(img.dataset.path); }
            catch { img.alt = "Imagen no disponible"; }
        }
    });
}

function renderConversation() {
    messages.innerHTML = currentChat.messages.map(messageHTML).join("");
    bindActions(messages);
    icons_();
    messages.scrollTop = messages.scrollHeight;
}

function updateLast() {
    const i = currentChat.messages.length - 1;
    const tmp = document.createElement("div");
    tmp.innerHTML = messageHTML(currentChat.messages[i], i);
    const node = tmp.firstElementChild;
    node.style.animation = "none";
    const last = messages.lastElementChild;
    if (last) messages.replaceChild(node, last); else messages.appendChild(node);
    bindActions(node);
    icons_();
    messages.scrollTop = messages.scrollHeight;
}

function renderHistory() {
    if (!chats.length) {
        historyEl.innerHTML = `<div class="history-empty">${signedIn ? "Aún no hay conversaciones" : "Inicia sesión para guardar tus conversaciones"}</div>`;
        return;
    }
    historyEl.innerHTML = chats.map(chat => `
        <div class="history-item ${currentChat?.id === chat.id ? "active" : ""}" data-id="${chat.id}">
            <i data-lucide="${AIS[chat.ai]?.icon || "message-square"}"></i>
            <span class="title">${esc(chat.title)}</span>
            <button class="icon-btn del" data-del="${chat.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>
        </div>`).join("");

    historyEl.querySelectorAll("[data-id]").forEach(el => el.addEventListener("click", e => {
        if (e.target.closest("[data-del]")) return;
        loadChat(el.dataset.id);
    }));
    historyEl.querySelectorAll("[data-del]").forEach(b => b.onclick = () => deleteChat(b.dataset.del));
    icons_();
}

/* ================= CHATS ================= */

function loadChat(id) {
    const chat = chats.find(c => c.id === id);
    if (!chat) return;
    currentChat = chat;
    if (AIS[chat.ai]) aiSelector.value = chat.ai;
    updateTop();
    renderConversation();
    renderHistory();
    closeSidebar();
}

function newChat() {
    currentChat = null;
    showWelcome();
    renderHistory();
    closeSidebar();
    input.focus();
}

function deleteChat(id) {
    chats = chats.filter(c => c.id !== id);
    if (currentChat?.id === id) { currentChat = null; showWelcome(); }
    persist();
    renderHistory();
}

function systemPrompt(kind) {
    if (kind === "support") {
        return `Eres Nexus 1.3, el asistente de atención al cliente${settings.bizName ? ` de "${settings.bizName}"` : ""}. Responde en el idioma del cliente, de forma amable, breve y profesional. Usa únicamente la siguiente información del negocio. Si no conoces la respuesta, dilo con cortesía y sugiere contactar con el equipo humano.\n\nINFORMACIÓN DEL NEGOCIO:\n${settings.bizInfo || "(Aún no se ha configurado información del negocio.)"}`;
    }
    if (kind === "nexus") {
        return "Eres Nexus 1.3, un asistente de inteligencia artificial útil, preciso y amable creado para esta web. Si te preguntan quién eres, responde que eres Nexus 1.3. Responde en el idioma del usuario (por defecto, español) y usa formato Markdown cuando ayude.";
    }
    return "Eres un asistente útil integrado en la plataforma Nexus. Responde en el idioma del usuario (por defecto, español) y usa formato Markdown cuando ayude.";
}

async function sendMessage() {
    const text = input.value.trim();
    if (!text || busy) return;

    if (!signedIn) {
        toast("Inicia sesión para hablar con Nexus");
        await signIn();
        if (!signedIn) return;
    }

    const aiKey = aiSelector.value;
    const ai = AIS[aiKey];
    const modelTag = ai.kind === "external" ? ai.label : `${ai.label} · ${ai.sub}`;

    input.value = "";
    input.style.height = "auto";

    if (!currentChat) {
        currentChat = { id: uid(), ai: aiKey, title: text.slice(0, 40), messages: [], created: Date.now() };
        chats.unshift(currentChat);
        messages.innerHTML = "";
    }
    currentChat.ai = aiKey;
    currentChat.messages.push({ role: "user", content: text });

    busy = true;
    sendButton.disabled = true;

    if (ai.kind === "image") {
        const msg = { role: "assistant", type: "image", pending: true, prompt: text, model: modelTag };
        currentChat.messages.push(msg);
        renderConversation();
        renderHistory();
        try {
            const img = await puter.ai.txt2img(text);
            msg.src = img.src;
            msg.path = await storeImage(img.src);
        } catch (e) {
            console.error(e);
            msg.error = "No se pudo generar la imagen. Inténtalo de nuevo.";
        }
        msg.pending = false;
        updateLast();
    } else {
        const msg = { role: "assistant", content: "", pending: true, model: modelTag };
        currentChat.messages.push(msg);
        renderConversation();
        renderHistory();

        const conversation = [
            { role: "system", content: systemPrompt(ai.kind) },
            ...currentChat.messages
                .filter(m => m !== msg && m.type !== "image" && m.content && !m.error)
                .slice(-20)
                .map(m => ({ role: m.role, content: m.content })),
        ];

        try {
            const model = ai.kind === "external" ? aiKey : NEXUS_ENGINE;
            const response = await puter.ai.chat(conversation, { model, stream: true });
            let lastPaint = 0;
            for await (const part of response) {
                if (part?.text) {
                    msg.content += part.text;
                    if (Date.now() - lastPaint > 60) { updateLast(); lastPaint = Date.now(); }
                }
            }
            if (!msg.content) msg.content = "No recibí respuesta. Inténtalo de nuevo.";
        } catch (error) {
            console.error(error);
            if (!msg.content) {
                msg.content = "No pude conectar con esta IA. Prueba con otra.";
                msg.error = true;
            }
        }
        msg.pending = false;
        updateLast();
    }

    busy = false;
    sendButton.disabled = false;
    persist();
    input.focus();
}

/* ================= CONFIGURACIÓN SOPORTE ================= */

function openSettings() {
    $("bizName").value = settings.bizName || "";
    $("bizInfo").value = settings.bizInfo || "";
    $("settingsModal").classList.add("open");
    closeSidebar();
}

function closeSettings() {
    $("settingsModal").classList.remove("open");
}

async function saveSettings() {
    settings = { bizName: $("bizName").value.trim(), bizInfo: $("bizInfo").value.trim() };
    if (signedIn) await puter.kv.set("nexus_settings", settings).catch(console.warn);
    closeSettings();
    toast(signedIn ? "Configuración guardada" : "Guardado solo en esta sesión. Inicia sesión para conservarlo.");
    if (!currentChat) showWelcome();
}

/* ================= EVENTOS ================= */

function openSidebar() { sidebar.classList.add("open"); overlay.classList.add("show"); }
function closeSidebar() { sidebar.classList.remove("open"); overlay.classList.remove("show"); }

sendButton.addEventListener("click", sendMessage);

input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 150) + "px";
});

aiSelector.addEventListener("change", () => {
    updateTop();
    const kind = AIS[aiSelector.value].kind;
    // Las imágenes y el soporte empiezan en un chat nuevo
    if (!currentChat || kind === "image" || kind === "support" || AIS[currentChat.ai]?.kind === "image" || AIS[currentChat.ai]?.kind === "support") {
        currentChat = null;
        showWelcome();
        renderHistory();
    }
});

$("newChat").addEventListener("click", newChat);
$("menuButton").addEventListener("click", openSidebar);
$("closeSidebar").addEventListener("click", closeSidebar);
overlay.addEventListener("click", closeSidebar);
$("openSettings").addEventListener("click", openSettings);
$("saveSettings").addEventListener("click", saveSettings);
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeSettings));
$("settingsModal").addEventListener("click", e => { if (e.target.id === "settingsModal") closeSettings(); });

/* ================= INICIO ================= */

(async function init() {
    updateTop();
    renderAuth();
    renderHistory();
    showWelcome();
    try {
        signedIn = puter.auth.isSignedIn();
        if (signedIn) {
            user = await puter.auth.getUser();
            await loadData();
        }
    } catch (e) {
        console.warn(e);
    }
    renderAuth();
    renderHistory();
    if (!currentChat) showWelcome();
})();
