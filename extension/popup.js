const DEFAULTS = {
  pagesPerTree: 8333,
  totalPages: 0,
  totalTrees: 0,
  printEvents: 0,
  avoidedEvents: 0,
  avoidedPages: 0,
  avoidedTrees: 0,
  lastEvent: null,
  lastAvoidedEvent: null,
  pendingPrint: null
};

let currentPending = null;

function cleanPageCount(value, fallback = 1) {
  return Math.max(1, Math.round(Number(value) || fallback || 1));
}

function treeCount(pages, pagesPerTree) {
  return pages / (Number(pagesPerTree) || DEFAULTS.pagesPerTree);
}

async function loadStats() {
  const data = await chrome.storage.local.get(DEFAULTS);

  document.getElementById("totalPages").textContent = Math.round(data.totalPages || 0);
  document.getElementById("totalTrees").textContent = Number(data.totalTrees || 0).toFixed(5);
  document.getElementById("printEvents").textContent = data.printEvents || 0;
  document.getElementById("avoidedEvents").textContent = data.avoidedEvents || 0;
  document.getElementById("avoidedPages").textContent = Math.round(data.avoidedPages || 0);
  document.getElementById("avoidedTrees").textContent = Number(data.avoidedTrees || 0).toFixed(5);
  document.getElementById("pagesPerTree").value = data.pagesPerTree || DEFAULTS.pagesPerTree;

  const last = data.lastEvent;
  if (!last) {
    document.getElementById("lastEvent").textContent = "No print counted yet.";
  } else {
    const date = new Date(last.time).toLocaleString();
    document.getElementById("lastEvent").textContent = `${last.pages} pages from “${last.title}” on ${date}`;
  }

  const avoided = data.lastAvoidedEvent;
  if (!avoided) {
    document.getElementById("lastAvoidedEvent").textContent = "No avoided print counted yet.";
  } else {
    const avoidedDate = new Date(avoided.time).toLocaleString();
    document.getElementById("lastAvoidedEvent").textContent = `${avoided.pages} pages avoided from “${avoided.title}” on ${avoidedDate}`;
  }

  currentPending = data.pendingPrint || null;
  renderPending(data);
}

function renderPending(data) {
  const section = document.getElementById("pendingSection");
  if (!currentPending) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  document.getElementById("pendingTitle").textContent = currentPending.title || "A print preview was detected.";
  document.getElementById("pendingPages").value = currentPending.pages || 1;
  updatePendingPreview(data.pagesPerTree || currentPending.pagesPerTree || DEFAULTS.pagesPerTree);
}

function updatePendingPreview(pagesPerTreeValue) {
  if (!currentPending) return;
  const pages = cleanPageCount(document.getElementById("pendingPages").value, currentPending.pages);
  const trees = treeCount(pages, pagesPerTreeValue || currentPending.pagesPerTree);
  document.getElementById("pendingTrees").textContent = `${pages} page${pages === 1 ? "" : "s"} ≈ ${trees.toFixed(5)} trees`;
}


function playChopAnimationInPopup(pages, trees) {
  const card = document.getElementById("chopAnimationCard");
  const message = document.getElementById("chopMessage");
  if (!card) return;

  message.textContent = `${pages} page${pages === 1 ? "" : "s"} counted ≈ ${Number(trees).toFixed(5)} trees.`;
  card.classList.remove("hidden", "playing");
  void card.offsetWidth;
  card.classList.add("playing");

  setTimeout(() => {
    card.classList.remove("playing");
  }, 1800);
}

async function saveAssumption() {
  const value = Number(document.getElementById("pagesPerTree").value);
  if (!value || value <= 0) return;
  await chrome.storage.local.set({ pagesPerTree: value });
  await loadStats();
}

async function confirmPending() {
  const data = await chrome.storage.local.get(DEFAULTS);
  const pending = data.pendingPrint;
  if (!pending) return;

  const pagesPerTree = Number(data.pagesPerTree) || Number(pending.pagesPerTree) || DEFAULTS.pagesPerTree;
  const pages = cleanPageCount(document.getElementById("pendingPages").value, pending.pages);
  const trees = treeCount(pages, pagesPerTree);

  const totalPages = Number(data.totalPages || 0) + pages;
  const totalTrees = Number(data.totalTrees || 0) + trees;
  const printEvents = Number(data.printEvents || 0) + 1;

  const lastEvent = {
    pages,
    trees,
    url: pending.url,
    title: pending.title,
    time: new Date().toISOString()
  };

  await chrome.storage.local.set({
    pagesPerTree,
    totalPages,
    totalTrees,
    printEvents,
    lastEvent,
    pendingPrint: null
  });

  await loadStats();
  playChopAnimationInPopup(pages, trees);
}

async function discardPending() {
  const data = await chrome.storage.local.get(DEFAULTS);
  const pending = data.pendingPrint;
  if (!pending) return;

  const pagesPerTree = Number(data.pagesPerTree) || Number(pending.pagesPerTree) || DEFAULTS.pagesPerTree;
  const pages = cleanPageCount(document.getElementById("pendingPages").value, pending.pages);
  const trees = treeCount(pages, pagesPerTree);

  const avoidedEvents = Number(data.avoidedEvents || 0) + 1;
  const avoidedPages = Number(data.avoidedPages || 0) + pages;
  const avoidedTrees = Number(data.avoidedTrees || 0) + trees;

  const lastAvoidedEvent = {
    pages,
    trees,
    url: pending.url,
    title: pending.title,
    time: new Date().toISOString()
  };

  await chrome.storage.local.set({
    pagesPerTree,
    avoidedEvents,
    avoidedPages,
    avoidedTrees,
    lastAvoidedEvent,
    pendingPrint: null
  });

  await loadStats();
}

async function undoLast() {
  const data = await chrome.storage.local.get(DEFAULTS);
  if (!data.lastEvent) return;

  const newTotalPages = Math.max(0, Number(data.totalPages || 0) - Number(data.lastEvent.pages || 0));
  const newTotalTrees = Math.max(0, Number(data.totalTrees || 0) - Number(data.lastEvent.trees || 0));
  const newPrintEvents = Math.max(0, Number(data.printEvents || 0) - 1);

  await chrome.storage.local.set({
    totalPages: newTotalPages,
    totalTrees: newTotalTrees,
    printEvents: newPrintEvents,
    lastEvent: null
  });
  await loadStats();
}

async function resetAll() {
  await chrome.storage.local.set(DEFAULTS);
  await loadStats();
}

document.getElementById("saveAssumption").addEventListener("click", saveAssumption);
document.getElementById("confirmPending").addEventListener("click", confirmPending);
document.getElementById("discardPending").addEventListener("click", discardPending);
document.getElementById("undoLast").addEventListener("click", undoLast);
document.getElementById("resetAll").addEventListener("click", resetAll);
document.getElementById("pendingPages").addEventListener("input", async () => {
  const data = await chrome.storage.local.get(DEFAULTS);
  updatePendingPreview(data.pagesPerTree || DEFAULTS.pagesPerTree);
});

loadStats();
