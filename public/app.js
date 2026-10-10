const ideaInput = document.querySelector("#idea-input");
const modelSelect = document.querySelector("#model-select");
const modelPicker = document.querySelector("#model-picker");
const modelPickerTrigger = document.querySelector("#model-picker-trigger");
const modelPickerMenu = document.querySelector("#model-picker-menu");
const modelPickerName = document.querySelector("#model-picker-name");
const count = document.querySelector("#char-count");
const createButton = document.querySelector("#create-button");
const statusMessage = document.querySelector("#status-message");
const ideaCard = document.querySelector("#idea-card");
const stickyComposerInner = document.querySelector("#sticky-composer-inner");
const promptSection = document.querySelector("#prompt-section");
const promptGrid = document.querySelector("#prompt-grid");
const originalRequestText = document.querySelector("#original-request-text");
const languagePill = document.querySelector("#language-pill");
const decisionRow = document.querySelector("#decision-row");
const revisionPanel = document.querySelector("#revision-panel");
const editInput = document.querySelector("#edit-input");
const resultCard = document.querySelector("#result-card");
const resultContent = document.querySelector("#result-content");
const conversationMessages = document.querySelector("#conversation-messages");
const sidebar = document.querySelector("#feature-sidebar");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const newChatButton = document.querySelector("#new-chat-button");
let originalRequest = "";
let currentPrompts = null;
let currentResult = "";
let currentChatHistory = [];
let composerMode = "prompt";
stickyComposerInner.append(ideaCard);
setComposerMode("prompt");
initializeModelSelector();

ideaInput.addEventListener("input", () => {
  count.textContent = `${ideaInput.value.length.toLocaleString()} / 12,000`;
  resizeComposer();
});

createButton.addEventListener("click", () => {
  if (composerMode === "followup") sendFollowUp();
  else generatePrompt("/api/generate");
});
document.querySelector("#reject-button").addEventListener("click", () => generatePrompt("/api/reject"));
function toggleRevisionPanel() {
  revisionPanel.hidden = !revisionPanel.hidden;
  if (!revisionPanel.hidden) {
    revisionPanel.scrollIntoView({ behavior: "smooth", block: "center" });
    editInput.focus();
  }
}
document.querySelector("#edit-button").addEventListener("click", toggleRevisionPanel);
document.querySelector("#apply-edit-button").addEventListener("click", () => generatePrompt("/api/edit"));
document.querySelector("#start-over-button").addEventListener("click", reset);
document.querySelector("#accept-button").addEventListener("click", runAcceptedPrompt);
document.querySelector("#copy-result-button").addEventListener("click", () => copyText(currentResult));
sidebarToggle.addEventListener("click", () => {
  const collapsed = document.body.classList.toggle("sidebar-collapsed");
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggle.setAttribute("aria-label", collapsed ? "Expand menu" : "Minimize menu");
  sidebarToggle.title = collapsed ? "Expand menu" : "Minimize menu";
});
modelSelect.addEventListener("change", () => {
  try {
    localStorage.setItem("promptly-model", modelSelect.value);
  } catch {
    setStatus("The selected model could not be saved in this browser.");
  }
  updateModelPickerSelection();
});
modelPickerTrigger.addEventListener("click", () => {
  if (modelPickerTrigger.disabled) return;
  if (modelPickerMenu.hidden) openModelPicker();
  else closeModelPicker();
});
modelPickerMenu.addEventListener("click", (event) => {
  const option = event.target.closest("[data-model]");
  if (option) selectModel(option.dataset.model);
});
modelPicker.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modelPickerMenu.hidden) {
    event.preventDefault();
    closeModelPicker();
    modelPickerTrigger.focus();
    return;
  }
  if (event.target === modelPickerTrigger && ["ArrowDown", "Enter", " "].includes(event.key)) {
    event.preventDefault();
    openModelPicker();
    modelPickerMenu.querySelector('[role="menuitemradio"][aria-checked="true"]')?.focus();
    return;
  }
  if (!event.target.matches("[role='menuitemradio']")) return;
  const options = [...modelPickerMenu.querySelectorAll("[role='menuitemradio']")];
  const currentIndex = options.indexOf(event.target);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    options[(currentIndex + direction + options.length) % options.length]?.focus();
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    options[event.key === "Home" ? 0 : options.length - 1]?.focus();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    selectModel(event.target.dataset.model);
  }
});
document.addEventListener("click", (event) => {
  if (!modelPicker.contains(event.target)) closeModelPicker();
});
sidebar.addEventListener("click", (event) => {
  const action = event.target.closest(".sidebar-action");
  if (!action || action.disabled) return;
  if (action.dataset.action === "new-chat") {
    reset();
    if (window.matchMedia("(max-width: 800px)").matches && !document.body.classList.contains("sidebar-collapsed")) {
      sidebarToggle.click();
    }
    return;
  }
  if (action.dataset.action !== "about") return;
  const aboutMenu = document.querySelector(".about-menu");
  aboutMenu.open = !aboutMenu.open;
  if (aboutMenu.open) {
    if (window.matchMedia("(max-width: 800px)").matches && !document.body.classList.contains("sidebar-collapsed")) {
      sidebarToggle.click();
    }
    aboutMenu.querySelector("summary").focus();
  }
});
ideaInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (composerMode === "followup") sendFollowUp();
    else generatePrompt("/api/generate");
  }
});

function setStatus(message, type = "error") {
  statusMessage.hidden = !message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.replaceChildren();
  if (type === "loading") {
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    statusMessage.append(spinner, document.createTextNode(message));
  } else {
    statusMessage.textContent = message;
  }
}

function setButtonsDisabled(disabled) {
  document.querySelectorAll(".workspace button").forEach((button) => {
    button.disabled = disabled;
  });
  newChatButton.disabled = disabled;
  createButton.disabled = disabled;
  ideaInput.disabled = disabled;
}

async function initializeModelSelector() {
  const preferredModel = getSavedModel();
  try {
    const response = await fetch("/api/models");
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.models) || typeof data.defaultModel !== "string") {
      throw new Error(data.error || "Available AI models could not be loaded.");
    }

    modelSelect.replaceChildren(...data.models.map((model) => {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.label;
      return option;
    }));
    modelSelect.value = data.models.some((model) => model.id === preferredModel)
      ? preferredModel
      : data.defaultModel;
    modelSelect.disabled = false;
    modelPickerTrigger.disabled = false;
    renderModelPickerOptions(data.models);
    updateModelPickerSelection();
  } catch (error) {
    modelSelect.disabled = true;
    modelPickerTrigger.disabled = true;
    modelPickerName.textContent = "Models unavailable";
    setStatus(error.message);
  }
}

function renderModelPickerOptions(models) {
  modelPickerMenu.replaceChildren(...models.map((model) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "model-picker-option";
    option.setAttribute("role", "menuitemradio");
    option.setAttribute("aria-checked", String(model.id === modelSelect.value));
    option.dataset.model = model.id;
    option.tabIndex = -1;

    const copy = document.createElement("span");
    copy.className = "model-option-copy";
    const name = document.createElement("span");
    name.className = "model-option-name";
    name.textContent = formatModelName(model.id, model.label);
    copy.append(name);
    if (model.id === "gemini-3.8-flash") {
      const description = document.createElement("span");
      description.className = "model-option-description";
      description.textContent = "Best for complex tasks";
      copy.append(description);
    } else if (model.id === "gemini-3.1-flash-lite") {
      const description = document.createElement("span");
      description.className = "model-option-description";
      description.textContent = "Fast and efficient";
      copy.append(description);
    } else if (model.id === "gemini-3.1-pro-preview") {
      const description = document.createElement("span");
      description.className = "model-option-description";
      description.textContent = "Advanced reasoning";
      copy.append(description);
    } else {
      const description = document.createElement("span");
      description.className = "model-option-description";
      description.textContent = "App default";
      copy.append(description);
    }

    const checkmark = document.createElement("span");
    checkmark.className = "model-option-check";
    checkmark.setAttribute("aria-hidden", "true");
    option.append(copy, checkmark);
    return option;
  }));
}

function updateModelPickerSelection() {
  const selectedOption = modelSelect.selectedOptions[0];
  if (!selectedOption) return;
  modelPickerName.textContent = formatModelName(selectedOption.value, selectedOption.textContent);
  for (const option of modelPickerMenu.querySelectorAll("[data-model]")) {
    option.setAttribute("aria-checked", String(option.dataset.model === modelSelect.value));
  }
}

function formatModelName(modelId, label) {
  if (!label.endsWith(" (default)")) return label;
  return modelId
    .replace(/^gemini-/i, "Gemini ")
    .replace(/-(\d)/g, " $1")
    .split("-")
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(" ");
}

function openModelPicker() {
  modelPickerMenu.hidden = false;
  modelPickerTrigger.setAttribute("aria-expanded", "true");
}

function closeModelPicker() {
  modelPickerMenu.hidden = true;
  modelPickerTrigger.setAttribute("aria-expanded", "false");
}

function selectModel(model) {
  if (![...modelSelect.options].some((option) => option.value === model)) return;
  modelSelect.value = model;
  modelSelect.dispatchEvent(new Event("change", { bubbles: true }));
  closeModelPicker();
  modelPickerTrigger.focus();
}

function getSavedModel() {
  try {
    return localStorage.getItem("promptly-model");
  } catch {
    return null;
  }
}

function setComposerMode(mode) {
  composerMode = mode;
  const followup = mode === "followup";
  const heading = document.querySelector("#idea-card-heading");
  heading.querySelector("h2").textContent = followup ? "Keep the conversation going" : "What do you want to do?";
  heading.querySelector("p").textContent = followup
    ? "Ask a follow-up, request a change, or explore another angle."
    : "Just explain it naturally. No special wording needed.";
  ideaInput.setAttribute("aria-label", followup ? "Ask a follow-up question" : "Describe what you want your AI prompt to accomplish");
  ideaInput.placeholder = followup
    ? "Ask anything about the answer…"
    : "Describe what you want your AI prompt to accomplish. You can write in any language.";
  document.querySelector("#composer-hint").textContent = followup
    ? "I’ll reply in the language and writing style you use. Press Enter to send, or Shift+Enter for a new line."
    : "Any language. We’ll detect it for you.";
  document.querySelector("#composer-privacy").hidden = followup;
  createButton.querySelector(".button-label").textContent = followup ? "Send" : "Create my prompt";
  createButton.setAttribute("aria-label", followup ? "Send message" : "Create my prompt");
  ideaCard.classList.toggle("followup-composer", followup);
  resizeComposer();
}

function resizeComposer() {
  ideaInput.style.height = "48px";
  const maxHeight = 144;
  const nextHeight = Math.min(ideaInput.scrollHeight, maxHeight);
  ideaInput.style.height = `${nextHeight}px`;
  ideaInput.style.overflowY = ideaInput.scrollHeight > maxHeight ? "auto" : "hidden";
}

async function postJson(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `The request failed (${response.status}).`);
  return data;
}

async function generatePrompt(endpoint) {
  const isNewPrompt = endpoint === "/api/generate";
  const request = isNewPrompt ? ideaInput.value.trim() : originalRequest;
  if (!request) {
    ideaInput.focus();
    setStatus("Tell us what you want your prompt to accomplish first.");
    return;
  }

  const wasRevision = !isNewPrompt && Boolean(currentPrompts);
  const payload = { request, previous: isNewPrompt ? null : currentPrompts, model: modelSelect.value || undefined };
  if (endpoint === "/api/edit") payload.editInstructions = editInput.value.trim();
  if (endpoint === "/api/edit" && !payload.editInstructions) {
    editInput.focus();
    setStatus("Add a change you'd like us to make to the prompt.");
    return;
  }

  if (!wasRevision) originalRequest = request;
  setButtonsDisabled(true);
  setStatus(endpoint === "/api/edit" ? "Tuning your prompt to match your instructions…" : endpoint === "/api/reject" ? "Reworking your prompt into something even better…" : "Understanding your idea and crafting your prompt…", "loading");

  try {
    currentPrompts = await postJson(endpoint, payload);
    if (isNewPrompt) {
      originalRequest = request;
      ideaInput.value = "";
      count.textContent = "0 / 12,000";
      resizeComposer();
      currentChatHistory = [];
      conversationMessages.replaceChildren();
      setComposerMode("prompt");
    }
    renderPrompts();
    promptSection.hidden = false;
    decisionRow.hidden = false;
    revisionPanel.hidden = true;
    resultCard.hidden = true;
    setStatus("");
    document.querySelector("#step-two").classList.add("active");
    document.querySelector("#step-two").classList.add("complete");
    document.querySelector("#step-three").classList.remove("active", "complete");
    if (wasRevision) promptSection.scrollIntoView({ behavior: "smooth", block: "start" });
    else promptSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    setStatus(error.message);
  } finally {
    setButtonsDisabled(false);
  }
}

function renderPrompts() {
  promptGrid.replaceChildren();
  originalRequestText.textContent = originalRequest;
  const hasEnglish = Boolean(currentPrompts.englishPrompt);
  promptGrid.classList.toggle("single", !hasEnglish);
  languagePill.textContent = currentPrompts.detectedLanguage;
  promptGrid.append(createPromptCard(
    hasEnglish ? "English" : currentPrompts.detectedLanguage,
    hasEnglish ? "EN" : shortLanguageTag(currentPrompts.detectedLanguage),
    hasEnglish ? currentPrompts.englishPrompt : currentPrompts.originalPrompt,
    hasEnglish ? "English version" : "Your prompt",
  ));
  if (hasEnglish) {
    promptGrid.append(createPromptCard(
      currentPrompts.detectedLanguage,
      shortLanguageTag(currentPrompts.detectedLanguage),
      currentPrompts.originalPrompt,
      "Your language",
    ));
  }
}

function createPromptCard(language, tag, prompt, label) {
  const card = document.createElement("article");
  card.className = "prompt-card";
  const heading = document.createElement("div");
  heading.className = "prompt-card-heading";
  const languageName = document.createElement("span");
  languageName.className = "prompt-language";
  const flag = document.createElement("span");
  flag.className = "language-flag";
  flag.textContent = tag;
  const name = document.createElement("span");
  name.textContent = language;
  languageName.append(flag, name);
  const copyButton = document.createElement("button");
  copyButton.className = "copy-button";
  copyButton.type = "button";
  copyButton.textContent = "Copy";
  copyButton.addEventListener("click", () => copyText(prompt, copyButton));
  heading.append(languageName, copyButton);
  const promptLabel = document.createElement("div");
  promptLabel.className = "prompt-label";
  promptLabel.textContent = label;
  const text = document.createElement("p");
  text.className = "prompt-text";
  renderMarkdown(text, prompt);
  card.append(heading, promptLabel, text);
  return card;
}

function renderMarkdown(container, markdown) {
  container.replaceChildren();
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```/);
    if (fence) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = codeLines.join("\n");
      pre.append(code);
      container.append(pre);
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const element = document.createElement(`h${Math.min(heading[1].length + 1, 3)}`);
      appendInlineMarkdown(element, heading[2]);
      container.append(element);
      index += 1;
      continue;
    }

    if (/^\s{0,3}(---+|___+|\*\*\*+)\s*$/.test(line)) {
      container.append(document.createElement("hr"));
      index += 1;
      continue;
    }

    const listMatch = line.match(/^\s*[-*+]\s+(.+)|^\s*\d+[.)]\s+(.+)/);
    if (listMatch) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const list = document.createElement(ordered ? "ol" : "ul");
      while (index < lines.length) {
        const item = lines[index].match(/^\s*[-*+]\s+(.+)|^\s*\d+[.)]\s+(.+)/);
        if (!item || /^\s*\d+[.)]/.test(lines[index]) !== ordered) break;
        const element = document.createElement("li");
        appendInlineMarkdown(element, item[1] || item[2]);
        list.append(element);
        index += 1;
      }
      container.append(list);
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote = document.createElement("blockquote");
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        const paragraph = document.createElement("p");
        appendInlineMarkdown(paragraph, lines[index].replace(/^\s*>\s?/, ""));
        quote.append(paragraph);
        index += 1;
      }
      container.append(quote);
      continue;
    }

    const paragraph = document.createElement("p");
    const paragraphLines = [];
    while (index < lines.length && lines[index].trim()) {
      if (
        index > 0 &&
        (/^\s{0,3}#{1,6}\s+/.test(lines[index]) ||
          /^\s*```/.test(lines[index]) ||
          /^\s*[-*+]\s+/.test(lines[index]) ||
          /^\s*\d+[.)]\s+/.test(lines[index]) ||
          /^\s*>/.test(lines[index]) ||
          /^\s{0,3}(---+|___+|\*\*\*+)\s*$/.test(lines[index]))
      ) break;
      paragraphLines.push(lines[index]);
      index += 1;
    }
    paragraphLines.forEach((paragraphLine, lineIndex) => {
      if (lineIndex) paragraph.append(document.createElement("br"));
      appendInlineMarkdown(paragraph, paragraphLine);
    });
    container.append(paragraph);
  }
}

function appendInlineMarkdown(container, text) {
  const inlinePattern = /(\*\*[^*]+\*\*|__[^_]+__|(?<!\*)\*[^*\n]+\*(?!\*)|(?<!_)_[^_\n]+_(?!_)|`[^`\n]+`)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(inlinePattern)) {
    container.append(document.createTextNode(text.slice(lastIndex, match.index)));
    const token = match[0];
    const content = token.slice(2, -2);
    const element = document.createElement(token.startsWith("`") ? "code" : token.startsWith("**") || token.startsWith("__") ? "strong" : "em");
    element.textContent = token.startsWith("`") ? token.slice(1, -1) : content;
    container.append(element);
    lastIndex = match.index + token.length;
  }
  container.append(document.createTextNode(text.slice(lastIndex)));
}

function shortLanguageTag(language) {
  const words = language.trim().split(/\s+/);
  return words.length > 1
    ? words.map((word) => word[0]).join("").slice(0, 2).toUpperCase()
    : language.slice(0, 2).toUpperCase();
}

async function runAcceptedPrompt() {
  if (!currentPrompts) return;
  const prompt = currentPrompts.englishPrompt || currentPrompts.originalPrompt;
  setButtonsDisabled(true);
  setStatus("Running your accepted prompt…", "loading");
  try {
    const data = await postJson("/api/execute", {
      prompt,
      language: currentPrompts.detectedLanguage,
      model: modelSelect.value || undefined,
    });
    currentResult = data.result;
    renderMarkdown(resultContent, currentResult);
    currentChatHistory = [
      { role: "user", text: `Accepted prompt:\n${prompt}` },
      { role: "model", text: currentResult },
    ];
    conversationMessages.replaceChildren();
    setComposerMode("followup");
    resultCard.hidden = false;
    decisionRow.hidden = true;
    revisionPanel.hidden = true;
    document.querySelector("#step-three").classList.add("active", "complete");
    setStatus("");
    resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    setStatus(error.message);
  } finally {
    setButtonsDisabled(false);
  }
}

async function sendFollowUp() {
  const message = ideaInput.value.trim();
  if (!message || createButton.disabled) return;

  const messages = [...currentChatHistory, { role: "user", text: message }];
  setButtonsDisabled(true);
  setStatus("Thinking about your follow-up…", "loading");
  appendConversationMessage("user", message);

  try {
    const data = await postJson("/api/followup", { messages, model: modelSelect.value || undefined });
    currentChatHistory = [...messages, { role: "model", text: data.result }];
    appendConversationMessage("model", data.result);
    ideaInput.value = "";
    count.textContent = "0 / 12,000";
    resizeComposer();
    setStatus("");
    resultCard.scrollIntoView({ behavior: "smooth", block: "end" });
  } catch (error) {
    conversationMessages.lastElementChild?.remove();
    setStatus(error.message);
  } finally {
    setButtonsDisabled(false);
  }
}

function appendConversationMessage(role, text) {
  const message = document.createElement("article");
  message.className = `conversation-message ${role === "user" ? "conversation-message-user" : "conversation-message-assistant"}`;
  const label = document.createElement("div");
  label.className = "conversation-message-label";
  label.textContent = role === "user" ? "You" : "Promptly";
  const content = document.createElement("div");
  content.className = "conversation-message-content";
  if (role === "user") {
    content.textContent = text;
  } else {
    renderMarkdown(content, text);
  }
  message.append(label, content);
  conversationMessages.append(message);
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    if (!button) {
      button = document.querySelector("#copy-result-button");
    }
    const previousLabel = button.textContent;
    button.textContent = "Copied!";
    setTimeout(() => { button.textContent = previousLabel; }, 1600);
  } catch {
    setStatus("Could not copy to clipboard. Select the text and copy it manually.");
  }
}

function reset() {
  originalRequest = "";
  currentPrompts = null;
  currentResult = "";
  currentChatHistory = [];
  conversationMessages.replaceChildren();
  setComposerMode("prompt");
  ideaInput.value = "";
  editInput.value = "";
  count.textContent = "0 / 12,000";
  resizeComposer();
  promptSection.hidden = true;
  revisionPanel.hidden = true;
  resultCard.hidden = true;
  decisionRow.hidden = false;
  document.querySelector("#step-two").classList.remove("active", "complete");
  document.querySelector("#step-three").classList.remove("active", "complete");
  document.querySelector("#step-one").classList.add("active");
  document.querySelector(".about-menu").open = false;
  setStatus("");
  ideaInput.focus();
}
