(() => {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const defaultKind = "heading";
  const defaultLevel = 1;

  const state = {
    recording: false,
    activeKind: defaultKind,
    activeLevel: defaultLevel,
    activeIndex: -1,
    blocks: [],
    recognition: null,
    micStream: null,
    restarting: false,
    resettingRecognition: false,
    clearing: false,
  };

  const els = {
    recordingPage: document.querySelector("#recordingPage"),
    controlsPage: document.querySelector("#controlsPage"),
    navLinks: document.querySelectorAll("[data-nav]"),
    recordButton: document.querySelector("#recordButton"),
    status: document.querySelector("#status"),
    activeMode: document.querySelector("#activeMode"),
    markdownView: document.querySelector("#markdownView"),
    markdown: document.querySelector("#markdown"),
    toggleRecording: document.querySelector("#toggleRecording"),
    clearBoard: document.querySelector("#clearBoard"),
    modeButtons: document.querySelectorAll("[data-mode-kind]"),
  };

  function currentPage() {
    return window.location.pathname.replace(/\/$/, "") === "/controls"
      ? "controls"
      : "recording";
  }

  function renderRoute() {
    const page = currentPage();
    els.recordingPage.hidden = page !== "recording";
    els.controlsPage.hidden = page !== "controls";
    els.navLinks.forEach((link) => {
      link.classList.toggle("active", link.dataset.nav === page);
    });
  }

  function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.classList.toggle("error", isError);
  }

  function syncControls() {
    els.toggleRecording.textContent = state.recording ? "Copy" : "Start";
    els.toggleRecording.classList.toggle("is-recording", state.recording);
    els.toggleRecording.setAttribute(
      "aria-label",
      state.recording ? "Stop and copy markdown" : "Start recording",
    );
    els.modeButtons.forEach((button) => {
      const isActive =
        button.dataset.modeKind === state.activeKind &&
        Number(button.dataset.modeLevel) === state.activeLevel;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function ensureBlock(kind = state.activeKind, level = state.activeLevel) {
    const active = state.blocks[state.activeIndex];
    if (active && active.kind === kind && active.level === level) {
      return active;
    }

    const block = { kind, level, text: "", interim: "" };
    state.blocks.push(block);
    state.activeIndex = state.blocks.length - 1;
    state.activeKind = kind;
    state.activeLevel = level;
    render();
    syncControls();
    return block;
  }

  function setMode(kind, level = 0) {
    state.activeKind = kind;
    state.activeLevel = level;
    ensureBlock(kind, level);
    els.activeMode.textContent = modeLabel(kind, level);
    setStatus(`${modeLabel(kind, level)} ready. Keep speaking.`);
    syncControls();
  }

  function resetPage() {
    state.recording = false;
    state.activeKind = defaultKind;
    state.activeLevel = defaultLevel;
    state.activeIndex = -1;
    state.blocks = [];
    state.restarting = false;
    state.resettingRecognition = false;
    state.clearing = false;

    try {
      state.recognition?.abort();
    } catch {
      // Recognition may already be stopped by the browser.
    }
    state.recognition = null;
    releaseMicrophone();

    els.recordButton.classList.remove("is-recording");
    els.recordButton.setAttribute("aria-label", "Start recording");
    els.activeMode.textContent = modeLabel(state.activeKind, state.activeLevel);
    setStatus("Ready. Press Enter to begin.");
    render();
    syncControls();
  }

  async function copyAndResetPage() {
    if (state.clearing) return;
    state.clearing = true;
    state.recording = false;
    state.blocks.forEach((block) => {
      commitBlockInterim(block);
    });

    const markdown = buildMarkdown(false);
    let copied = false;
    if (markdown) {
      try {
        await copyToClipboard(markdown);
        copied = true;
      } catch {
        copied = false;
      }
    }

    resetPage();
    if (!markdown) {
      setStatus("Nothing to copy yet.");
    } else if (copied) {
      setStatus("Markdown copied and board cleared.");
    } else {
      setStatus("Board cleared. Clipboard copy was blocked.", true);
    }
  }

  function modeLabel(kind, level) {
    if (kind === "heading") return `H${level}`;
    return "Paragraph";
  }

  function normalizeText(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function appendFinal(text) {
    const block = ensureBlock();
    const cleaned = normalizeText(text);
    if (!cleaned) return;
    block.text = block.text ? `${block.text} ${cleaned}` : cleaned;
    block.interim = "";
    render();
  }

  function commitBlockInterim(block) {
    if (!block?.interim) return;
    block.text = block.text ? `${block.text} ${block.interim}` : block.interim;
    block.interim = "";
  }

  function commitActiveInterim() {
    commitBlockInterim(state.blocks[state.activeIndex]);
  }

  function setInterim(text) {
    const block = ensureBlock();
    block.interim = normalizeText(text);
    render();
  }

  function markdownForBlock(block) {
    const text = normalizeText(`${block.text} ${block.interim}`.trim());
    if (!text) return "";
    if (block.kind === "heading") return `${"#".repeat(block.level)} ${text}`;
    return text;
  }

  function buildMarkdown(includeInterim = true) {
    return state.blocks
      .map((block) => {
        const text = includeInterim
          ? markdownForBlock(block)
          : markdownForBlock({ ...block, interim: "" });
        return text;
      })
      .filter(Boolean)
      .join("\n\n");
  }

  function scrollMarkdownToBottom() {
    requestAnimationFrame(() => {
      els.markdownView.scrollTop = els.markdownView.scrollHeight;
    });
  }

  function render() {
    const markdown = buildMarkdown(true);
    els.markdown.value = markdown;
    els.markdownView.textContent = markdown;
    scrollMarkdownToBottom();
  }

  function createRecognition() {
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onstart = () => {
      state.restarting = false;
      state.resettingRecognition = false;
      setStatus("Recording. Use 1-4 for headings, P for paragraph, \\ to end.");
    };

    recognition.onresult = (event) => {
      if (state.resettingRecognition) return;

      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || "";
        if (result.isFinal) appendFinal(transcript);
        else interim += transcript;
      }
      setInterim(interim);
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      setStatus(`Microphone error: ${event.error}`, true);
    };

    recognition.onend = () => {
      if (!state.recording) return;
      state.restarting = true;
      window.setTimeout(() => {
        if (!state.recording) return;
        try {
          recognition.start();
        } catch {
          window.setTimeout(() => state.recording && recognition.start(), 500);
        }
      }, 250);
    };

    return recognition;
  }

  function resetRecognitionResults() {
    if (!state.recording || !state.recognition) return;
    state.resettingRecognition = true;
    try {
      state.recognition.abort();
    } catch {
      state.resettingRecognition = false;
    }
  }

  async function holdMicrophoneOpen() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    if (state.micStream) return;
    state.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }

  function releaseMicrophone() {
    if (!state.micStream) return;
    state.micStream.getTracks().forEach((track) => track.stop());
    state.micStream = null;
  }

  async function startRecording() {
    if (!SpeechRecognition) {
      setStatus("Speech recognition is not available in this browser.", true);
      return;
    }

    ensureBlock();
    state.recording = true;
    els.recordButton.classList.add("is-recording");
    els.recordButton.setAttribute("aria-label", "Recording");
    syncControls();

    try {
      await holdMicrophoneOpen();
      state.recognition = state.recognition || createRecognition();
      state.recognition.start();
    } catch (error) {
      state.recording = false;
      releaseMicrophone();
      els.recordButton.classList.remove("is-recording");
      els.recordButton.setAttribute("aria-label", "Start recording");
      setStatus(error.message || "Could not start microphone.", true);
      syncControls();
    }
  }

  async function stopRecording() {
    state.recording = false;
    state.blocks.forEach((block) => {
      commitBlockInterim(block);
    });

    try {
      state.recognition?.stop();
    } catch {
      // Recognition may already be stopped by the browser.
    }
    releaseMicrophone();

    const markdown = buildMarkdown(false);
    let copied = false;
    try {
      await copyToClipboard(markdown);
      copied = true;
    } catch {
      copied = false;
    }

    els.recordButton.classList.remove("is-recording");
    els.recordButton.setAttribute("aria-label", "Start recording");
    render();
    syncControls();
    if (!markdown) {
      setStatus("Nothing to copy yet.");
    } else if (copied) {
      setStatus("Markdown copied to clipboard.");
    } else {
      setStatus("Markdown is ready. Select the text on the right to copy it.", true);
    }
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    els.markdown.focus();
    els.markdown.select();
    document.execCommand("copy");
    window.getSelection()?.removeAllRanges();
  }

  function handleKeydown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === "Enter") {
      event.preventDefault();
      if (!state.recording) startRecording();
      return;
    }

    if (event.key === "\\") {
      event.preventDefault();
      if (state.recording) stopRecording();
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      copyAndResetPage();
      return;
    }

    if (!state.recording) return;

    const key = event.key.toLowerCase();
    if (["1", "2", "3", "4"].includes(key)) {
      event.preventDefault();
      commitActiveInterim();
      setMode("heading", Number(key));
      resetRecognitionResults();
    } else if (key === "p") {
      event.preventDefault();
      commitActiveInterim();
      setMode("paragraph", 0);
      resetRecognitionResults();
    }
  }

  els.recordButton.addEventListener("click", () => {
    if (!state.recording) startRecording();
  });
  els.toggleRecording.addEventListener("click", () => {
    if (state.recording) stopRecording();
    else startRecording();
  });
  els.clearBoard.addEventListener("click", copyAndResetPage);
  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (state.recording) commitActiveInterim();
      setMode(button.dataset.modeKind, Number(button.dataset.modeLevel));
      resetRecognitionResults();
    });
  });
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("popstate", renderRoute);
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || link.origin !== window.location.origin) return;
    event.preventDefault();
    window.history.pushState(null, "", link.href);
    renderRoute();
  });

  els.activeMode.textContent = modeLabel(state.activeKind, state.activeLevel);
  syncControls();
  renderRoute();
  render();
})();
