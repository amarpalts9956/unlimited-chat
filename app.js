const APP_SIGNATURE = "memory-orbit-v1";
const META_FILE = ".memory-orbit.json";
const DATA_DIR = "memory-orbit-data";
const INDEX_FILE = "date-index.json";
const CRYPTO_FILE = "crypto.json";
const ENTRIES_DIR = "entries";
const ASSETS_DIR = "assets";
const PBKDF2_ITERATIONS = 210000;
const VERIFIER_TEXT = "MEMORY_ORBIT_OK";
const HANDLE_DB_NAME = "memory-orbit-handles";
const HANDLE_STORE_NAME = "handles";
const HANDLE_KEY = "root-folder";
const SESSION_STATE_KEY = "memory-orbit-session";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMOJIS = [
  "😀",
  "😄",
  "🥳",
  "😍",
  "🧠",
  "✨",
  "🔥",
  "💡",
  "🎯",
  "📝",
  "📸",
  "🎉",
  "🌈",
  "🚀",
  "🎵",
  "❤️",
  "🌟",
  "😌",
  "😎",
  "🤝",
  "🏆",
  "🌻",
  "🍀",
  "💬",
];

const state = {
  rootDirHandle: null,
  dataDirHandle: null,
  entriesDirHandle: null,
  assetsDirHandle: null,
  index: {},
  cache: new Map(),
  selectedDateKey: formatDateKey(new Date()),
  selectedMonthDate: startOfMonth(new Date()),
  pendingFiles: [],
  writeQueue: Promise.resolve(),
  crypto: {
    enabled: false,
    key: null,
    iterations: PBKDF2_ITERATIONS,
  },
};

const ui = {
  pickFolderBtn: document.querySelector("#pick-folder-btn"),
  reloadBtn: document.querySelector("#reload-btn"),
  changePassphraseBtn: document.querySelector("#change-passphrase-btn"),
  encryptionBadge: document.querySelector("#encryption-badge"),
  folderName: document.querySelector("#folder-name"),
  statusText: document.querySelector("#status-text"),
  clockDate: document.querySelector("#clock-date"),
  clockTime: document.querySelector("#clock-time"),
  prevMonthBtn: document.querySelector("#prev-month"),
  nextMonthBtn: document.querySelector("#next-month"),
  todayBtn: document.querySelector("#today-btn"),
  monthSelect: document.querySelector("#month-select"),
  yearSelect: document.querySelector("#year-select"),
  calendarGrid: document.querySelector("#calendar-grid"),
  selectedDateLabel: document.querySelector("#selected-date-label"),
  timelineDateTitle: document.querySelector("#timeline-date-title"),
  timelineCount: document.querySelector("#timeline-count"),
  timelineList: document.querySelector("#timeline-list"),
  messageInput: document.querySelector("#message-input"),
  imageInput: document.querySelector("#image-input"),
  imagePreviewList: document.querySelector("#image-preview-list"),
  addImageBtn: document.querySelector("#add-image-btn"),
  emojiBtn: document.querySelector("#emoji-btn"),
  emojiPicker: document.querySelector("#emoji-picker"),
  sendBtn: document.querySelector("#send-btn"),
};

init();

function init() {
  if (!("showDirectoryPicker" in window)) {
    setStatus(
      "This browser does not support local folder access. Use Chrome, Edge, or Brave on HTTPS/GitHub Pages.",
      true
    );
    ui.pickFolderBtn.disabled = true;
  }

  buildMonthYearOptions();
  buildEmojiPicker();
  startClock();
  restoreSessionState();
  renderCalendar();
  bindEvents();
  updateEncryptionBadge();
  syncSelectedDateUI();
  renderTimeline([]);

  // Attempt auto-reconnect so refresh does not reset user context.
  void tryRestoreFolderOnLoad();
}

function bindEvents() {
  ui.pickFolderBtn.addEventListener("click", pickFolderFlow);
  ui.reloadBtn.addEventListener("click", reloadCurrentDate);
  if (ui.changePassphraseBtn) {
    ui.changePassphraseBtn.addEventListener("click", rotateFolderPassphrase);
  }

  ui.prevMonthBtn.addEventListener("click", () => {
    state.selectedMonthDate = addMonths(state.selectedMonthDate, -1);
    renderCalendar();
  });

  ui.nextMonthBtn.addEventListener("click", () => {
    state.selectedMonthDate = addMonths(state.selectedMonthDate, 1);
    renderCalendar();
  });

  ui.todayBtn.addEventListener("click", async () => {
    const now = new Date();
    state.selectedMonthDate = startOfMonth(now);
    state.selectedDateKey = formatDateKey(now);
    syncSelectedDateUI();
    renderCalendar();
    await loadAndRenderDate(state.selectedDateKey);
  });

  ui.monthSelect.addEventListener("change", () => {
    state.selectedMonthDate = new Date(
      Number(ui.yearSelect.value),
      Number(ui.monthSelect.value),
      1
    );
    renderCalendar();
  });

  ui.yearSelect.addEventListener("change", () => {
    state.selectedMonthDate = new Date(
      Number(ui.yearSelect.value),
      Number(ui.monthSelect.value),
      1
    );
    renderCalendar();
  });

  ui.messageInput.addEventListener("input", syncSendButtonState);

  ui.addImageBtn.addEventListener("click", () => ui.imageInput.click());
  ui.imageInput.addEventListener("change", handleImageSelection);

  ui.emojiBtn.addEventListener("click", () => {
    const hidden = ui.emojiPicker.hasAttribute("hidden");
    if (hidden) ui.emojiPicker.removeAttribute("hidden");
    else ui.emojiPicker.setAttribute("hidden", "");
  });

  ui.sendBtn.addEventListener("click", saveCurrentMemory);

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      if (!ui.sendBtn.disabled) saveCurrentMemory();
    }
  });
}

async function pickFolderFlow() {
  try {
    const folderHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    await activateFolder(folderHandle, { persistHandle: true });
    setStatus("Folder ready. Select a date and start saving memories.");
  } catch (error) {
    if (error && error.name === "AbortError") {
      setStatus("Folder selection cancelled.");
      return;
    }

    if (error && /passphrase|encryption|unlock/i.test(String(error.message || ""))) {
      setStatus(error.message || "Encryption setup failed.", true);
      return;
    }

    console.error(error);
    setStatus("Failed to open folder. Check browser permissions.", true);
  }
}

async function tryRestoreFolderOnLoad() {
  try {
    const folderHandle = await getPersistedFolderHandle();
    if (!folderHandle) return;

    const permission = await folderHandle.queryPermission?.({ mode: "readwrite" });
    if (permission !== "granted") {
      setStatus("Session restored. Click Choose Folder once to re-authorize access.");
      return;
    }

    await activateFolder(folderHandle, { persistHandle: false });
    setStatus("Folder restored after refresh.");
  } catch (error) {
    console.error(error);
    setStatus("Could not auto-restore folder. Choose Folder to continue.");
  }
}

async function activateFolder(folderHandle, { persistHandle }) {
  state.rootDirHandle = folderHandle;
  state.cache.clear();
  ui.folderName.textContent = folderHandle.name;

  await setupStorageHandles(folderHandle);
  await ensureCryptoAccess();
  await loadIndex();

  ui.reloadBtn.disabled = false;
  syncSendButtonState();

  if (persistHandle) {
    try {
      await persistFolderHandle(folderHandle);
    } catch (error) {
      console.warn("Folder handle persistence failed:", error);
    }
  }

  syncSelectedDateUI();
  renderCalendar();
  await loadAndRenderDate(state.selectedDateKey);
}

async function ensureCryptoAccess() {
  const fileHandle = await state.dataDirHandle.getFileHandle(CRYPTO_FILE, {
    create: true,
  });

  let config = await readJsonFile(fileHandle, null);

  if (!config || !config.mode) {
    const enable = window.confirm(
      "Enable passphrase encryption for this folder? Recommended for maximum privacy."
    );

    if (!enable) {
      config = {
        version: 1,
        mode: "none",
      };
      await writeJsonFile(fileHandle, config);
      state.crypto.enabled = false;
      state.crypto.key = null;
      updateEncryptionBadge();
      return;
    }

    const first = window.prompt("Create a passphrase for this folder:");
    if (!first) throw new Error("Encryption setup cancelled: no passphrase provided.");
    const confirm = window.prompt("Confirm your passphrase:");
    if (!confirm) throw new Error("Encryption setup cancelled.");
    if (first !== confirm) throw new Error("Encryption setup failed: passphrases do not match.");

    const salt = randomBytes(16);
    const key = await deriveAesKey(first, salt, PBKDF2_ITERATIONS);
    const verifier = await encryptTextWithKey(VERIFIER_TEXT, key);

    config = {
      version: 1,
      mode: "aes-gcm",
      iterations: PBKDF2_ITERATIONS,
      salt: toBase64(salt),
      verifier,
      createdAt: new Date().toISOString(),
    };

    await writeJsonFile(fileHandle, config);
    state.crypto.enabled = true;
    state.crypto.key = key;
    state.crypto.iterations = PBKDF2_ITERATIONS;
    updateEncryptionBadge();
    return;
  }

  if (config.mode === "none") {
    state.crypto.enabled = false;
    state.crypto.key = null;
    state.crypto.iterations = PBKDF2_ITERATIONS;
    updateEncryptionBadge();
    return;
  }

  if (config.mode !== "aes-gcm") {
    throw new Error("Unsupported encryption mode in this folder.");
  }

  const passphrase = window.prompt("Enter passphrase to unlock this folder:");
  if (!passphrase) throw new Error("Unlock cancelled: passphrase is required.");

  const salt = fromBase64(config.salt || "");
  const iterations = Number(config.iterations) || PBKDF2_ITERATIONS;
  const key = await deriveAesKey(passphrase, salt, iterations);

  try {
    const verifyText = await decryptTextWithKey(config.verifier, key);
    if (verifyText !== VERIFIER_TEXT) {
      throw new Error("Invalid passphrase.");
    }
  } catch {
    throw new Error("Unlock failed: incorrect passphrase.");
  }

  state.crypto.enabled = true;
  state.crypto.key = key;
  state.crypto.iterations = iterations;
  updateEncryptionBadge();
}

function updateEncryptionBadge() {
  if (!ui.encryptionBadge) return;

  ui.encryptionBadge.classList.remove("on", "off");
  if (state.crypto.enabled) {
    ui.encryptionBadge.classList.add("on");
    ui.encryptionBadge.textContent = "Encryption: On";
    if (ui.changePassphraseBtn) {
      ui.changePassphraseBtn.disabled = !state.entriesDirHandle;
    }
  } else {
    ui.encryptionBadge.classList.add("off");
    ui.encryptionBadge.textContent = "Encryption: Off";
    if (ui.changePassphraseBtn) {
      ui.changePassphraseBtn.disabled = true;
    }
  }
}

async function rotateFolderPassphrase() {
  if (!state.entriesDirHandle || !state.dataDirHandle || !state.crypto.enabled) {
    setStatus("Open an encrypted folder first.", true);
    return;
  }

  try {
    const cryptoHandle = await state.dataDirHandle.getFileHandle(CRYPTO_FILE, {
      create: false,
    });
    const config = await readJsonFile(cryptoHandle, null);

    if (!config || config.mode !== "aes-gcm") {
      setStatus("This folder is not using passphrase encryption.", true);
      return;
    }

    const currentPass = window.prompt("Enter your current passphrase:");
    if (!currentPass) {
      setStatus("Passphrase change cancelled.");
      return;
    }

    const currentSalt = fromBase64(config.salt || "");
    const currentIterations = Number(config.iterations) || PBKDF2_ITERATIONS;
    const currentKey = await deriveAesKey(currentPass, currentSalt, currentIterations);

    try {
      const verify = await decryptTextWithKey(config.verifier, currentKey);
      if (verify !== VERIFIER_TEXT) throw new Error("Invalid passphrase");
    } catch {
      setStatus("Current passphrase is incorrect.", true);
      return;
    }

    const nextPass = window.prompt("Enter your new passphrase:");
    if (!nextPass) {
      setStatus("Passphrase change cancelled.");
      return;
    }

    const nextConfirm = window.prompt("Confirm your new passphrase:");
    if (!nextConfirm) {
      setStatus("Passphrase change cancelled.");
      return;
    }

    if (nextPass !== nextConfirm) {
      setStatus("New passphrases do not match.", true);
      return;
    }

    if (nextPass === currentPass) {
      setStatus("New passphrase must be different from current one.", true);
      return;
    }

    setStatus("Re-encrypting folder with new passphrase...");

    const newSalt = randomBytes(16);
    const newIterations = PBKDF2_ITERATIONS;
    const newKey = await deriveAesKey(nextPass, newSalt, newIterations);

    await reencryptEntryFiles(currentKey, newKey);

    const verifier = await encryptTextWithKey(VERIFIER_TEXT, newKey);
    const updatedConfig = {
      ...config,
      mode: "aes-gcm",
      iterations: newIterations,
      salt: toBase64(newSalt),
      verifier,
      rotatedAt: new Date().toISOString(),
    };

    await writeJsonFile(cryptoHandle, updatedConfig);
    state.crypto.key = newKey;
    state.crypto.iterations = newIterations;
    state.cache.clear();
    await loadAndRenderDate(state.selectedDateKey);

    setStatus("Passphrase updated successfully.");
  } catch (error) {
    console.error(error);
    setStatus("Failed to change passphrase.", true);
  }
}

async function reencryptEntryFiles(oldKey, newKey) {
  const tasks = [];

  for await (const handle of state.entriesDirHandle.values()) {
    if (handle.kind !== "file" || !handle.name.endsWith(".json")) continue;
    tasks.push(reencryptSingleEntryFile(handle, oldKey, newKey));
  }

  for (const task of tasks) {
    await task;
  }
}

async function reencryptSingleEntryFile(fileHandle, oldKey, newKey) {
  const data = await readJsonFile(fileHandle, { entries: [] });
  let payloadData;

  if (data?.encrypted && data.payload) {
    payloadData = await decryptPayload(data.payload, oldKey);
  } else {
    payloadData = {
      date: data?.date || fileHandle.name.replace(/\.json$/i, ""),
      updatedAt: data?.updatedAt || new Date().toISOString(),
      entries: Array.isArray(data?.entries) ? data.entries : [],
    };
  }

  const encryptedPayload = await encryptPayload(payloadData, newKey);

  await writeJsonFile(fileHandle, {
    date: payloadData.date,
    updatedAt: new Date().toISOString(),
    encrypted: true,
    payload: encryptedPayload,
  });
}

async function setupStorageHandles(rootDirHandle) {
  await ensureAppMeta(rootDirHandle);

  state.dataDirHandle = await rootDirHandle.getDirectoryHandle(DATA_DIR, {
    create: true,
  });

  state.entriesDirHandle = await state.dataDirHandle.getDirectoryHandle(ENTRIES_DIR, {
    create: true,
  });

  state.assetsDirHandle = await state.dataDirHandle.getDirectoryHandle(ASSETS_DIR, {
    create: true,
  });
}

async function ensureAppMeta(rootDirHandle) {
  let existingMeta = null;

  try {
    const fileHandle = await rootDirHandle.getFileHandle(META_FILE);
    existingMeta = await readJsonFile(fileHandle);
  } catch (error) {
    if (error.name !== "NotFoundError") throw error;
  }

  if (!existingMeta) {
    const meta = {
      signature: APP_SIGNATURE,
      createdAt: new Date().toISOString(),
      appName: "Memory Orbit",
    };

    const fileHandle = await rootDirHandle.getFileHandle(META_FILE, { create: true });
    await writeJsonFile(fileHandle, meta);
    return;
  }

  if (existingMeta.signature !== APP_SIGNATURE) {
    throw new Error("This folder belongs to another format/app.");
  }
}

async function loadIndex() {
  const indexHandle = await state.dataDirHandle.getFileHandle(INDEX_FILE, {
    create: true,
  });

  const indexData = await readJsonFile(indexHandle, { dates: {} });
  state.index = indexData.dates || {};
}

async function saveIndex() {
  const indexHandle = await state.dataDirHandle.getFileHandle(INDEX_FILE, {
    create: true,
  });

  const payload = {
    updatedAt: new Date().toISOString(),
    dates: state.index,
  };

  await writeJsonFile(indexHandle, payload);
}

async function getEntriesForDate(dateKey) {
  if (state.cache.has(dateKey)) {
    return state.cache.get(dateKey);
  }

  const fileHandle = await state.entriesDirHandle.getFileHandle(`${dateKey}.json`, {
    create: true,
  });

  const data = await readJsonFile(fileHandle, { entries: [] });
  let entries = [];

  if (data?.encrypted) {
    if (!state.crypto.enabled || !state.crypto.key) {
      throw new Error("This folder is encrypted and must be unlocked.");
    }

    const decrypted = await decryptPayload(data.payload, state.crypto.key);
    entries = Array.isArray(decrypted.entries) ? decrypted.entries : [];
  } else {
    entries = Array.isArray(data.entries) ? data.entries : [];
  }

  state.cache.set(dateKey, entries);
  return entries;
}

async function saveEntriesForDate(dateKey, entries) {
  state.cache.set(dateKey, entries);

  const handle = await state.entriesDirHandle.getFileHandle(`${dateKey}.json`, {
    create: true,
  });

  const updatedAt = new Date().toISOString();
  if (state.crypto.enabled && state.crypto.key) {
    const payload = await encryptPayload(
      {
        date: dateKey,
        updatedAt,
        entries,
      },
      state.crypto.key
    );

    await writeJsonFile(handle, {
      date: dateKey,
      updatedAt,
      encrypted: true,
      payload,
    });
  } else {
    await writeJsonFile(handle, {
      date: dateKey,
      updatedAt,
      entries,
    });
  }

  state.index[dateKey] = {
    count: entries.length,
    updatedAt: new Date().toISOString(),
  };

  if (entries.length === 0) {
    delete state.index[dateKey];
  }

  await saveIndex();
}

async function loadAndRenderDate(dateKey) {
  if (!state.entriesDirHandle) {
    renderTimeline([]);
    return;
  }

  setStatus(`Loading memories for ${dateKey}...`);

  try {
    const entries = await getEntriesForDate(dateKey);
    renderTimeline(entries);
    setStatus(`Loaded ${entries.length} memories for ${dateKey}.`);
  } catch (error) {
    console.error(error);
    setStatus("Could not load date entries.", true);
  }
}

async function reloadCurrentDate() {
  if (!state.entriesDirHandle) return;
  state.cache.delete(state.selectedDateKey);
  await loadAndRenderDate(state.selectedDateKey);
}

async function saveCurrentMemory() {
  if (!state.entriesDirHandle) {
    setStatus("Choose a folder to save your message.");
    await pickFolderFlow();
    if (!state.entriesDirHandle) {
      setStatus("Message not saved. Folder was not selected.", true);
      return;
    }
  }

  const text = ui.messageInput.value.trim();
  const hasText = text.length > 0;
  const hasImages = state.pendingFiles.length > 0;

  if (!hasText && !hasImages) {
    setStatus("Write a message or add an image first.", true);
    return;
  }

  const dateKey = state.selectedDateKey;

  queueWrite(async () => {
    const entries = [...(await getEntriesForDate(dateKey))];

    if (hasText) {
      entries.push({
        id: createId("txt"),
        type: "text",
        text,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    for (const item of state.pendingFiles) {
      const savedFileName = await saveImageBlob(item.file);
      entries.push({
        id: createId("img"),
        type: "image",
        text: item.caption || "",
        imageFile: savedFileName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    await saveEntriesForDate(dateKey, entries);

    ui.messageInput.value = "";
    state.pendingFiles = [];
    renderSelectedFileChips();
    syncSendButtonState();
    renderCalendar();
    renderTimeline(entries);
    setStatus(`Saved memory to ${dateKey}.`);
  });
}

function queueWrite(action) {
  state.writeQueue = state.writeQueue
    .then(() => action())
    .catch((error) => {
      console.error(error);
      setStatus("Save failed. Check folder permission.", true);
    });
}

async function saveImageBlob(file) {
  const ext = getExtension(file.name, file.type);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const handle = await state.assetsDirHandle.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();
  return fileName;
}

function handleImageSelection(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;

    state.pendingFiles.push({
      id: createId("pending"),
      file,
      caption: "",
    });
  }

  renderSelectedFileChips();
  syncSendButtonState();
  ui.imageInput.value = "";
}

function renderSelectedFileChips() {
  ui.imagePreviewList.innerHTML = "";

  if (state.pendingFiles.length === 0) {
    return;
  }

  state.pendingFiles.forEach((item) => {
    const chip = document.createElement("div");
    chip.className = "image-chip";

    const name = document.createElement("span");
    name.textContent = item.file.name;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "x";
    removeBtn.addEventListener("click", () => {
      state.pendingFiles = state.pendingFiles.filter((f) => f.id !== item.id);
      renderSelectedFileChips();
      syncSendButtonState();
    });

    chip.append(name, removeBtn);
    ui.imagePreviewList.appendChild(chip);
  });
}

function renderTimeline(entries) {
  ui.timelineList.innerHTML = "";
  ui.timelineCount.textContent = `${entries.length} item${entries.length === 1 ? "" : "s"}`;

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent =
      "No memories for this date. Write one in the chat panel and save.";
    ui.timelineList.appendChild(empty);
    return;
  }

  entries
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .forEach((entry) => {
      const card = document.createElement("article");
      card.className = "memory-card";

      const meta = document.createElement("div");
      meta.className = "memory-meta";
      meta.textContent = `Created ${formatDateTime(entry.createdAt)}`;

      card.appendChild(meta);

      if (entry.type === "text") {
        const p = document.createElement("p");
        p.className = "memory-text";
        p.textContent = entry.text || "";
        p.contentEditable = "true";
        p.spellcheck = true;
        p.addEventListener("blur", () => {
          updateEntryText(entry.id, p.textContent || "");
        });
        p.addEventListener("keydown", (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            p.blur();
          }
        });
        card.appendChild(p);
      }

      if (entry.type === "image") {
        const caption = document.createElement("p");
        caption.className = "memory-text";
        caption.textContent = entry.text || "Image memory";
        caption.contentEditable = "true";
        caption.spellcheck = true;
        caption.addEventListener("blur", () => {
          updateEntryText(entry.id, caption.textContent || "");
        });

        const img = document.createElement("img");
        img.className = "memory-image";
        img.alt = entry.text || "Memory image";
        resolveImageObjectUrl(entry.imageFile)
          .then((url) => {
            if (url) img.src = url;
          })
          .catch((error) => console.error(error));

        card.append(caption, img);
      }

      ui.timelineList.appendChild(card);
    });
}

function updateEntryText(entryId, text) {
  if (!state.entriesDirHandle) return;

  queueWrite(async () => {
    const dateKey = state.selectedDateKey;
    const entries = [...(await getEntriesForDate(dateKey))];
    const idx = entries.findIndex((x) => x.id === entryId);
    if (idx === -1) return;

    entries[idx] = {
      ...entries[idx],
      text,
      updatedAt: new Date().toISOString(),
    };

    await saveEntriesForDate(dateKey, entries);
    renderTimeline(entries);
    renderCalendar();
    setStatus("Memory updated.");
  });
}

async function resolveImageObjectUrl(fileName) {
  if (!fileName || !state.assetsDirHandle) return null;
  const handle = await state.assetsDirHandle.getFileHandle(fileName);
  const file = await handle.getFile();
  return URL.createObjectURL(file);
}

function renderCalendar() {
  const month = state.selectedMonthDate.getMonth();
  const year = state.selectedMonthDate.getFullYear();

  ui.monthSelect.value = String(month);
  ui.yearSelect.value = String(year);

  ui.calendarGrid.innerHTML = "";
  for (const day of WEEKDAYS) {
    const cell = document.createElement("div");
    cell.className = "calendar-weekday";
    cell.textContent = day;
    ui.calendarGrid.appendChild(cell);
  }

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const todayKey = formatDateKey(new Date());

  for (let i = 0; i < firstDay; i += 1) {
    const dayNum = prevMonthDays - firstDay + i + 1;
    const date = new Date(year, month - 1, dayNum);
    ui.calendarGrid.appendChild(createCalendarDayCell(date, true, todayKey));
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    ui.calendarGrid.appendChild(createCalendarDayCell(date, false, todayKey));
  }

  const totalCells = firstDay + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= remaining; i += 1) {
    const date = new Date(year, month + 1, i);
    ui.calendarGrid.appendChild(createCalendarDayCell(date, true, todayKey));
  }
}

function createCalendarDayCell(date, muted, todayKey) {
  const dateKey = formatDateKey(date);
  const el = document.createElement("button");
  el.type = "button";
  el.className = "calendar-day";
  if (muted) el.classList.add("muted");
  if (dateKey === state.selectedDateKey) el.classList.add("selected");
  if (dateKey === todayKey) el.classList.add("today");
  if (state.index[dateKey]?.count > 0) el.classList.add("has-entry");

  el.textContent = String(date.getDate());

  el.addEventListener("click", async () => {
    state.selectedDateKey = dateKey;
    state.selectedMonthDate = startOfMonth(date);
    syncSelectedDateUI();
    renderCalendar();
    await loadAndRenderDate(dateKey);
  });

  return el;
}

function syncSelectedDateUI() {
  const humanDate = formatHumanDate(state.selectedDateKey);
  ui.selectedDateLabel.textContent = `Selected: ${humanDate}`;
  ui.timelineDateTitle.textContent = `Memories - ${humanDate}`;
  persistSessionState();
}

function buildMonthYearOptions() {
  MONTHS.forEach((name, index) => {
    const opt = document.createElement("option");
    opt.value = String(index);
    opt.textContent = name;
    ui.monthSelect.appendChild(opt);
  });

  const currentYear = new Date().getFullYear();
  for (let year = currentYear - 30; year <= currentYear + 30; year += 1) {
    const opt = document.createElement("option");
    opt.value = String(year);
    opt.textContent = String(year);
    ui.yearSelect.appendChild(opt);
  }
}

function startClock() {
  const update = () => {
    const now = new Date();
    ui.clockDate.textContent = now.toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    ui.clockTime.textContent = now.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  update();
  setInterval(update, 1000);
}

function buildEmojiPicker() {
  EMOJIS.forEach((emoji) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = emoji;
    btn.addEventListener("click", () => {
      const start = ui.messageInput.selectionStart;
      const end = ui.messageInput.selectionEnd;
      const text = ui.messageInput.value;
      ui.messageInput.value = text.slice(0, start) + emoji + text.slice(end);
      const next = start + emoji.length;
      ui.messageInput.setSelectionRange(next, next);
      ui.messageInput.focus();
      syncSendButtonState();
    });
    ui.emojiPicker.appendChild(btn);
  });
}

function syncSendButtonState() {
  const ready = ui.messageInput.value.trim().length > 0 || state.pendingFiles.length > 0;

  ui.sendBtn.disabled = !ready;
}

function setStatus(message, isError = false) {
  ui.statusText.textContent = message;
  ui.statusText.style.color = isError ? "#ff9eb2" : "var(--muted)";
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatHumanDate(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(value) {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function readJsonFile(fileHandle, fallback = {}) {
  const file = await fileHandle.getFile();
  if (file.size === 0) return fallback;

  const text = await file.text();
  if (!text.trim()) return fallback;

  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(fileHandle, data) {
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

function getExtension(fileName, mimeType) {
  const nameParts = (fileName || "").split(".");
  if (nameParts.length > 1) return nameParts[nameParts.length - 1].toLowerCase();

  if (!mimeType) return "bin";
  const typeParts = mimeType.split("/");
  return typeParts[1] || "bin";
}

async function deriveAesKey(passphrase, saltBytes, iterations) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptPayload(data, key) {
  const text = JSON.stringify(data);
  return encryptTextWithKey(text, key);
}

async function decryptPayload(payload, key) {
  const text = await decryptTextWithKey(payload, key);
  return JSON.parse(text);
}

async function encryptTextWithKey(text, key) {
  const iv = randomBytes(12);
  const encoded = new TextEncoder().encode(text);
  const cipherBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encoded
  );

  return {
    iv: toBase64(iv),
    cipher: toBase64(new Uint8Array(cipherBuffer)),
  };
}

async function decryptTextWithKey(payload, key) {
  const iv = fromBase64(payload.iv || "");
  const cipher = fromBase64(payload.cipher || "");
  const plainBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    cipher
  );

  return new TextDecoder().decode(plainBuffer);
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function persistSessionState() {
  try {
    const payload = {
      selectedDateKey: state.selectedDateKey,
      selectedMonth: state.selectedMonthDate.getMonth(),
      selectedYear: state.selectedMonthDate.getFullYear(),
    };
    localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors without blocking app usage.
  }
}

function restoreSessionState() {
  try {
    const raw = localStorage.getItem(SESSION_STATE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);

    if (typeof data.selectedDateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.selectedDateKey)) {
      state.selectedDateKey = data.selectedDateKey;
    }

    if (
      Number.isInteger(data.selectedYear) &&
      Number.isInteger(data.selectedMonth) &&
      data.selectedMonth >= 0 &&
      data.selectedMonth <= 11
    ) {
      state.selectedMonthDate = new Date(data.selectedYear, data.selectedMonth, 1);
    }
  } catch {
    // Ignore corrupted local state.
  }
}

async function persistFolderHandle(handle) {
  const db = await openHandleDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Could not persist folder handle."));
    };
    tx.objectStore(HANDLE_STORE_NAME).put(handle, HANDLE_KEY);
  });
}

async function getPersistedFolderHandle() {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, "readonly");
    const req = tx.objectStore(HANDLE_STORE_NAME).get(HANDLE_KEY);

    req.onsuccess = () => {
      db.close();
      resolve(req.result || null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error || new Error("Could not read persisted folder handle."));
    };
  });
}

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        db.createObjectStore(HANDLE_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed."));
  });
}
