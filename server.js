const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const MAX_BODY_BYTES = 1_000_000;

loadEnvFile();

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const AVAILABLE_MODELS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
];
const INTERACTIONS_MODELS = new Set(AVAILABLE_MODELS.map((model) => model.id));

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request is too large."), { statusCode: 413 }));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON."), { statusCode: 400 }));
      }
    });
    request.on("error", reject);
  });
}

async function callGemini(prompt, jsonResponse = false, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(
      new Error("Gemini is not configured. Add your API key to the .env file and restart the app."),
      { statusCode: 503 },
    );
  }

  const generationConfig = { temperature: 0.7 };
  if (jsonResponse) generationConfig.responseMimeType = "application/json";

  if (INTERACTIONS_MODELS.has(options.model || MODEL)) {
    const input = options.contents
      ? options.contents.map((message) => {
        const text = message.parts.map((part) => part.text || "").join("\n");
        return `${message.role === "model" ? "Assistant" : "User"}: ${text}`;
      }).join("\n\n")
      : prompt;
    const body = {
      model: options.model || MODEL,
      input,
      system_instruction: options.systemInstruction || "You are an expert prompt engineer. Be faithful to the user's intent, preserve meaning across languages, and never invent requirements.",
      generation_config: { temperature: generationConfig.temperature },
      store: false,
    };
    if (jsonResponse) {
      body.response_format = { type: "text", mime_type: "application/json" };
    }

    const apiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify(body),
    });
    const data = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      const message = data.error?.message || `Gemini returned HTTP ${apiResponse.status}.`;
      throw Object.assign(new Error(message), { statusCode: apiResponse.status === 429 ? 429 : 502 });
    }
    const interactionText = typeof data.output_text === "string"
      ? data.output_text.trim()
      : "";
    if (!interactionText) {
      throw Object.assign(new Error("Gemini returned an empty response. Please try again."), { statusCode: 502 });
    }
    return interactionText;
  }

  const apiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model || MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: options.systemInstruction || "You are an expert prompt engineer. Be faithful to the user's intent, preserve meaning across languages, and never invent requirements.",
          }],
        },
        contents: options.contents || [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      }),
    },
  );

  const data = await apiResponse.json().catch(() => ({}));
  if (!apiResponse.ok) {
    const message = data.error?.message || `Gemini returned HTTP ${apiResponse.status}.`;
    throw Object.assign(new Error(message), { statusCode: apiResponse.status === 429 ? 429 : 502 });
  }
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
  if (!text) throw Object.assign(new Error("Gemini returned an empty response. Please try again."), { statusCode: 502 });
  return text;
}

function resolveModel(model) {
  if (model === undefined || model === null || model === "") return MODEL;
  if (typeof model !== "string" || (model !== MODEL && !AVAILABLE_MODELS.some((available) => available.id === model))) {
    throw Object.assign(new Error("Choose one of the available Gemini models."), { statusCode: 400 });
  }
  return model;
}

function getModels() {
  const models = AVAILABLE_MODELS.map((model) => ({
    ...model,
    label: model.id === MODEL ? `${model.label} (default)` : model.label,
  }));
  if (!AVAILABLE_MODELS.some((model) => model.id === MODEL)) {
    models.unshift({ id: MODEL, label: `${MODEL} (default)` });
  }
  return { defaultModel: MODEL, models };
}

function parsePromptPair(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Gemini returned an invalid prompt format. Please try again."), { statusCode: 502 });
  }

  if (
    typeof parsed.detectedLanguage !== "string" ||
    typeof parsed.originalPrompt !== "string" ||
    !parsed.originalPrompt.trim() ||
    (parsed.englishPrompt !== null && typeof parsed.englishPrompt !== "string")
  ) {
    throw Object.assign(new Error("Gemini returned an incomplete prompt. Please try again."), { statusCode: 502 });
  }
  return {
    detectedLanguage: parsed.detectedLanguage,
    originalPrompt: parsed.originalPrompt.trim(),
    englishPrompt: parsed.englishPrompt?.trim() || null,
  };
}

function promptGenerationRequest(input, previous = null) {
  const revision = previous
    ? `\nPrevious English prompt: ${previous.englishPrompt || "(not needed; the source language is English)"}\nPrevious prompt in the user's language: ${previous.originalPrompt}\nThe user wants these changes: ${input.editInstructions || "Make it clearer and more effective while preserving the intent."}`
    : "";
  const improvement = previous
    ? "Create a genuinely improved revision: make the prompt clearer, more specific, and more actionable than the previous version, without changing the user's intent."
    : "Turn the user's request into a polished, ready-to-use prompt.";

  return `The user's request (preserve its original language as the user's language):\n${input.request}\n${revision}

${improvement}
Write like an experienced prompt engineer. Organize the prompt into useful, clearly labeled sections when appropriate, such as Role, Objective, Context, Instructions, Constraints, and Output format. Include only sections that genuinely help; do not pad the prompt. Make the result self-contained, specific, and practical. Do not answer or carry out the request: create a prompt that another AI can use to do it.

Detect the language of the user's original request. Write originalPrompt entirely in that language. Write englishPrompt in English with the same meaning and instructions, but set it to null if the user's original request is in English. For an edit, apply the user's edit instructions to both versions so they remain equivalent.

Return ONLY a JSON object with exactly these fields: {"detectedLanguage":"language name","originalPrompt":"complete prompt in the user's language","englishPrompt":"equivalent English prompt, or null when the user's language is English"}.`;
}

async function handleApi(request, response, pathname) {
  try {
    const input = await readJson(request);
    if (pathname === "/api/generate" || pathname === "/api/edit" || pathname === "/api/reject") {
      if (typeof input.request !== "string" || !input.request.trim()) {
        return sendJson(response, 400, { error: "Describe what you want the AI prompt to accomplish." });
      }
      if (pathname === "/api/edit" && typeof input.editInstructions !== "string") {
        return sendJson(response, 400, { error: "Add instructions describing how you want the prompt changed." });
      }
      const previous = pathname === "/api/generate" ? null : input.previous;
      const model = resolveModel(input.model);
      if (previous && (typeof previous.originalPrompt !== "string" || !previous.originalPrompt.trim())) {
        return sendJson(response, 400, { error: "The previous prompt is missing. Generate a prompt before revising it." });
      }
      if (pathname === "/api/edit" && !input.editInstructions.trim()) {
        return sendJson(response, 400, { error: "Describe at least one change to make to the prompt." });
      }
      const prompt = promptGenerationRequest(
        { request: input.request.trim(), editInstructions: input.editInstructions?.trim() },
        previous || null,
      );
      const result = parsePromptPair(await callGemini(prompt, true, { model }));
      return sendJson(response, 200, result);
    }

    if (pathname === "/api/execute") {
      if (typeof input.prompt !== "string" || !input.prompt.trim()) {
        return sendJson(response, 400, { error: "Accept a generated prompt before asking the AI to run it." });
      }
      const language = typeof input.language === "string" && input.language.trim()
        ? input.language.trim()
        : "the same language as the user's request";
      const model = resolveModel(input.model);
      const result = await callGemini(
        `Carry out the following accepted prompt. Provide the useful result directly, in ${language}. If a critical detail is missing, make a sensible assumption and state it briefly instead of asking a follow-up question.\n\n--- Accepted prompt ---\n${input.prompt.trim()}\n--- End of prompt ---`,
        false,
        { model },
      );
      return sendJson(response, 200, { result });
    }

    if (pathname === "/api/followup") {
      if (!Array.isArray(input.messages) || input.messages.length === 0 || input.messages.length > 100) {
        return sendJson(response, 400, { error: "The conversation is empty or too long to continue. Start a new prompt to begin again." });
      }
      const messages = [];
      for (const message of input.messages) {
        if (
          !message ||
          !["user", "model"].includes(message.role) ||
          typeof message.text !== "string" ||
          !message.text.trim() ||
          message.text.length > 12000
        ) {
          return sendJson(response, 400, { error: "Conversation messages must have a valid speaker and contain no more than 12,000 characters." });
        }
        messages.push({ role: message.role, parts: [{ text: message.text.trim() }] });
      }
      if (messages[0].role !== "user" || messages[messages.length - 1].role !== "user") {
        return sendJson(response, 400, { error: "Add a follow-up message to continue the conversation." });
      }
      const model = resolveModel(input.model);
      for (let index = 1; index < messages.length; index += 1) {
        if (messages[index].role === messages[index - 1].role) {
          return sendJson(response, 400, { error: "Conversation messages must alternate between you and the AI." });
        }
      }
      const result = await callGemini("", false, {
        model,
        systemInstruction: "You are a helpful conversational AI. Continue naturally from the conversation, answer the latest user message directly, and preserve relevant context. Choose the response language and writing script from the latest user message, not from the original request or earlier assistant replies. Match code-switching, transliteration, and register: when the user writes Hindi in Latin letters (Hinglish), answer in natural Hinglish using Latin letters; when the user writes Hindi in Devanagari, answer in Hindi using Devanagari; when the user mixes languages, naturally mirror that mix. If the latest message explicitly requests a different response language, follow that request. Follow the user's requests unless they conflict with safety requirements.",
        contents: messages,
      });
      return sendJson(response, 200, { result });
    }

    return sendJson(response, 404, { error: "API endpoint not found." });
  } catch (error) {
    if (!response.headersSent && !response.destroyed) {
      const status = error.statusCode || (error.name === "TimeoutError" ? 504 : 502);
      sendJson(response, status, { error: error.message || "The request failed. Please try again." });
    }
  }
}

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.resolve(PUBLIC_DIR, `.${requestedPath}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    response.writeHead(403);
    return response.end("Forbidden");
  }
  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(404);
      return response.end("Not found");
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(contents);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (request.method === "GET" && url.pathname === "/healthz") {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    return response.end("ok");
  }
  if (siteUsername && sitePassword && !hasValidSiteCredentials(request)) {
    response.writeHead(401, {
      "WWW-Authenticate": 'Basic realm="Promptly", charset="UTF-8"',
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    });
    return response.end("Sign in to use Promptly.");
  }
  if (request.method === "GET" && url.pathname === "/api/models") {
    return sendJson(response, 200, getModels());
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/")) {
    return sendJson(response, 404, { error: "API endpoint not found." });
  }
  if (request.method === "POST" && url.pathname.startsWith("/api/")) {
    return void handleApi(request, response, url.pathname);
  }
  if (request.method === "GET") return serveStatic(response, url.pathname);
  response.writeHead(405, { Allow: "GET, POST" });
  response.end("Method not allowed");
});

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";
const siteUsername = process.env.SITE_USERNAME;
const sitePassword = process.env.SITE_PASSWORD;

if (host !== "127.0.0.1" && (!siteUsername || !sitePassword || sitePassword.length < 12)) {
  throw new Error("Set SITE_USERNAME and a SITE_PASSWORD of at least 12 characters before exposing the app to the network.");
}

function matchesCredential(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function hasValidSiteCredentials(request) {
  const authorization = request.headers.authorization || "";
  const encodedCredentials = authorization.match(/^Basic\s+(.+)$/i)?.[1];
  if (!encodedCredentials) return false;

  const credentials = Buffer.from(encodedCredentials, "base64").toString("utf8");
  const separator = credentials.indexOf(":");
  if (separator < 0) return false;

  return matchesCredential(credentials.slice(0, separator), siteUsername)
    && matchesCredential(credentials.slice(separator + 1), sitePassword);
}

server.listen(port, host, () => {
  console.log(`Prompt Studio is ready at http://127.0.0.1:${port}`);
});
