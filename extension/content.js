// EcoPrint Reminder - content script v0.4
// v0.2 idea:
// 1. Detect print preview/print attempt using beforeprint.
// 2. Store a pending estimate, but DO NOT add it to totals yet.
// 3. After print preview closes, ask the user to confirm/correct page count.
// 4. Only confirmed prints are added to cumulative totals.

const ECOPRINT_DEFAULTS = {
  // Rough, editable assumption: 1 tree -> about 8,333 sheets of paper.
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

let pendingEstimate = null;
let lastBeforePrintTime = 0;
const BEFORE_PRINT_DEBOUNCE_MS = 3000;

function ensurePrintSafeStyles() {
  if (document.getElementById("ecoprint-print-safe-style")) return;
  const style = document.createElement("style");
  style.id = "ecoprint-print-safe-style";
  style.textContent = `
    @media print {
      #ecoprint-confirm-overlay,
      #ecoprint-confirm-box,
      #ecoprint-chop-overlay,
      #ecoprint-chop-box,
      .ecoprint-ui {
        display: none !important;
        visibility: hidden !important;
      }
    }
  `;
  document.documentElement.appendChild(style);
}

function estimatePages() {
  const bodyText = document.body ? document.body.innerText || "" : "";
  const visibleTextLength = bodyText.replace(/\s+/g, " ").trim().length;

  // Simple estimate: around 2500 visible text characters per printed page.
  const textPages = Math.ceil(visibleTextLength / 2500);

  // Images can increase print length. Add a small contribution.
  const imageCount = document.images ? document.images.length : 0;
  const imagePages = Math.ceil(imageCount / 4);

  return Math.max(1, textPages + imagePages);
}

async function buildPendingEstimate() {
  const stored = await chrome.storage.local.get(ECOPRINT_DEFAULTS);
  const pagesPerTree = Number(stored.pagesPerTree) || ECOPRINT_DEFAULTS.pagesPerTree;
  const pages = estimatePages();

  return {
    pages,
    pagesPerTree,
    trees: pages / pagesPerTree,
    url: location.href,
    title: document.title || location.hostname || "Untitled page",
    time: new Date().toISOString()
  };
}

async function addConfirmedPrint(pages, estimate) {
  const stored = await chrome.storage.local.get(ECOPRINT_DEFAULTS);
  const pagesPerTree = Number(stored.pagesPerTree) || Number(estimate.pagesPerTree) || ECOPRINT_DEFAULTS.pagesPerTree;
  const cleanPages = Math.max(1, Math.round(Number(pages) || estimate.pages || 1));
  const trees = cleanPages / pagesPerTree;

  const totalPages = Number(stored.totalPages || 0) + cleanPages;
  const totalTrees = Number(stored.totalTrees || 0) + trees;
  const printEvents = Number(stored.printEvents || 0) + 1;

  const lastEvent = {
    pages: cleanPages,
    trees,
    url: estimate.url,
    title: estimate.title,
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

  pendingEstimate = null;
}

async function discardPendingPrint() {
  pendingEstimate = null;
  await chrome.storage.local.set({ pendingPrint: null });
}

async function recordAvoidedPrint(pages, estimate) {
  const stored = await chrome.storage.local.get(ECOPRINT_DEFAULTS);
  const pagesPerTree = Number(stored.pagesPerTree) || Number(estimate.pagesPerTree) || ECOPRINT_DEFAULTS.pagesPerTree;
  const cleanPages = Math.max(1, Math.round(Number(pages) || estimate.pages || 1));
  const trees = cleanPages / pagesPerTree;

  const avoidedEvents = Number(stored.avoidedEvents || 0) + 1;
  const avoidedPages = Number(stored.avoidedPages || 0) + cleanPages;
  const avoidedTrees = Number(stored.avoidedTrees || 0) + trees;

  const lastAvoidedEvent = {
    pages: cleanPages,
    trees,
    url: estimate.url,
    title: estimate.title,
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

  pendingEstimate = null;
}

function removeConfirmModal() {
  const old = document.getElementById("ecoprint-confirm-overlay");
  if (old) old.remove();
}

function showConfirmModal(estimate) {
  if (!estimate) return;
  removeConfirmModal();

  const overlay = document.createElement("div");
  overlay.id = "ecoprint-confirm-overlay";
  overlay.className = "ecoprint-ui";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    background: rgba(0,0,0,0.38);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: Arial, sans-serif;
  `;

  const box = document.createElement("div");
  box.id = "ecoprint-confirm-box";
  box.className = "ecoprint-ui";
  box.style.cssText = `
    width: min(420px, calc(100vw - 32px));
    background: #f5f8f4;
    color: #16251c;
    border-radius: 18px;
    padding: 18px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.28);
    line-height: 1.35;
  `;

  box.innerHTML = `
    <div style="font-size: 22px; font-weight: 800; margin-bottom: 4px;">🌱 EcoPrint</div>
    <div style="font-size: 13px; color: #52635a; margin-bottom: 14px;">Did you actually print this document?</div>

    <div style="background: white; border: 1px solid #dfe8df; border-radius: 12px; padding: 12px; margin-bottom: 12px;">
      <div style="font-size: 12px; color: #637066; margin-bottom: 5px;">Page estimate</div>
      <input id="ecoprint-confirm-pages" type="number" min="1" step="1" value="${estimate.pages}" style="width: calc(100% - 20px); padding: 9px; border: 1px solid #cbd8cc; border-radius: 8px; font-size: 15px;" />
      <div id="ecoprint-tree-preview" style="margin-top: 8px; font-size: 13px; color: #52635a;"></div>
    </div>

    <div style="font-size: 12px; color: #52635a; margin-bottom: 12px; word-break: break-word;">
      ${escapeHtml(estimate.title)}
    </div>

    <div style="background: #fbfffb; border: 1px solid #dfe8df; border-radius: 12px; padding: 12px; margin-bottom: 12px;">
      <div style="font-size: 13px; font-weight: 800; margin-bottom: 8px;">Before printing, can you reduce impact?</div>
      <label style="display: block; font-size: 12px; color: #52635a; margin: 6px 0;"><input type="checkbox" /> Print double-sided</label>
      <label style="display: block; font-size: 12px; color: #52635a; margin: 6px 0;"><input type="checkbox" /> Print only needed pages</label>
      <label style="display: block; font-size: 12px; color: #52635a; margin: 6px 0;"><input type="checkbox" /> Use grayscale</label>
      <label style="display: block; font-size: 12px; color: #52635a; margin: 6px 0;"><input type="checkbox" /> Save as PDF instead</label>
    </div>

    <div style="display: flex; gap: 8px;">
      <button id="ecoprint-count-btn" style="flex: 1; padding: 10px; border: 0; border-radius: 10px; background: #1d6b43; color: white; font-weight: 700; cursor: pointer;">Yes, count it</button>
      <button id="ecoprint-skip-btn" style="flex: 1; padding: 10px; border: 0; border-radius: 10px; background: #8d2f2f; color: white; font-weight: 700; cursor: pointer;">No, I avoided printing</button>
    </div>

    <div style="margin-top: 10px; font-size: 11px; color: #6a766e;">
      You can correct the page count before saving. Nothing is added until you click “Yes, count it.”
    </div>
  `;

  overlay.appendChild(box);
  document.documentElement.appendChild(overlay);

  const input = document.getElementById("ecoprint-confirm-pages");
  const preview = document.getElementById("ecoprint-tree-preview");

  function updatePreview() {
    const pages = Math.max(1, Math.round(Number(input.value) || estimate.pages || 1));
    const trees = pages / (Number(estimate.pagesPerTree) || ECOPRINT_DEFAULTS.pagesPerTree);
    preview.textContent = `${pages} page${pages === 1 ? "" : "s"} ≈ ${trees.toFixed(5)} trees`;
  }

  input.addEventListener("input", updatePreview);
  updatePreview();

  document.getElementById("ecoprint-count-btn").addEventListener("click", async () => {
    const confirmedPages = Math.max(1, Math.round(Number(input.value) || estimate.pages || 1));
    const confirmedTrees = confirmedPages / (Number(estimate.pagesPerTree) || ECOPRINT_DEFAULTS.pagesPerTree);
    await addConfirmedPrint(confirmedPages, estimate);
    removeConfirmModal();
    showChopAnimation(confirmedPages, confirmedTrees);
  });

  document.getElementById("ecoprint-skip-btn").addEventListener("click", async () => {
    const avoidedPages = Math.max(1, Math.round(Number(input.value) || estimate.pages || 1));
    await recordAvoidedPrint(avoidedPages, estimate);
    removeConfirmModal();
  });
}



const ECOPRINT_ANIMATION_CSS = ":host {\n      --bg: #eef7ef;\n      --card: #f9fcf9;\n      --text: #193024;\n      --muted: #5d7165;\n      --green: #2b7d4a;\n      --green2: #3a9656;\n      --green3: #22663b;\n      --sky: #dff1ff;\n      --grass: #e7f6e7;\n      --shadow: rgba(0,0,0,0.18);\n      --duration: 4.5s;\n      \n      /* MAGIC SCALING VARIABLE FOR EXTENSION POPUP */\n      --scale: 0.55; \n    }\n\n    * { box-sizing: border-box; }\n    body {\n      margin: 0;\n      font-family: Arial, sans-serif;\n      background: linear-gradient(180deg, #edf7ee 0%, #f4fbf4 100%);\n      color: var(--text);\n      min-height: 100vh;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      padding: 16px;\n    }\n\n    /* Shrink the main container to Extension Popup size (440px) */\n    .panel {\n      width: min(440px, 100%);\n      background: white;\n      border: 1px solid #dbe9dc;\n      border-radius: 16px;\n      box-shadow: 0 12px 32px var(--shadow);\n      overflow: hidden;\n    }\n\n    .header {\n      padding: 16px 16px 10px;\n      border-bottom: 1px solid #edf4ed;\n      background: var(--card);\n    }\n    h1 {\n      margin: 0;\n      font-size: 20px; \n    }\n    .subtitle {\n      margin: 4px 0 0;\n      color: var(--muted);\n      line-height: 1.4;\n      font-size: 13px; \n    }\n\n    .controls {\n      display: flex;\n      gap: 8px;\n      align-items: center;\n      padding: 12px 16px;\n      border-bottom: 1px solid #edf4ed;\n      flex-wrap: wrap;\n    }\n    button {\n      border: 0;\n      border-radius: 8px;\n      background: #1d6b43;\n      color: white;\n      font-weight: 700;\n      padding: 8px 12px;\n      font-size: 12px;\n      cursor: pointer;\n      transition: background 0.2s;\n    }\n    button:hover { background: #165233; }\n    button.secondary {\n      background: #dfece2;\n      color: #1d3a28;\n    }\n    button.secondary:hover { background: #cce0d1; }\n    .note {\n      font-size: 11px;\n      color: var(--muted);\n      width: 100%;\n      margin-top: 4px;\n    }\n\n    .stageWrap {\n      padding: 16px;\n      background: linear-gradient(180deg, #fbfefb 0%, #f6fbf6 100%);\n    }\n\n    /* The outer stage dynamically heights itself based on the scale */\n    .stage {\n      position: relative;\n      height: calc(380px * var(--scale));\n      overflow: hidden;\n      border-radius: 12px;\n      background: linear-gradient(180deg, var(--sky) 0%, #eff9ff 52%, var(--grass) 52%, #e7f6e7 100%);\n      border: 1px solid #dbe8db;\n      box-shadow: inset 0 -30px 60px rgba(0,0,0,0.03);\n    }\n\n    /* The inner stage preserves all absolute coordinates perfectly */\n    .stage-inner {\n      position: absolute;\n      width: 820px;\n      height: 380px;\n      transform: scale(var(--scale));\n      transform-origin: top left;\n      /* Mathematically center the scaled content */\n      left: calc(50% - (820px * var(--scale) / 2));\n      top: 0;\n    }\n\n    .sun {\n      position: absolute;\n      right: 58px;\n      top: 32px;\n      width: 46px;\n      height: 46px;\n      border-radius: 50%;\n      background: #ffe28b;\n      box-shadow: 0 0 0 10px rgba(255,226,139,0.18);\n    }\n\n    .cloud, .cloud:before, .cloud:after {\n      background: rgba(255,255,255,0.85);\n      border-radius: 999px;\n      position: absolute;\n    }\n    .cloud {\n      width: 90px;\n      height: 26px;\n      left: 70px;\n      top: 56px;\n    }\n    .cloud:before { content: \"\"; width: 34px; height: 34px; left: 10px; top: -16px; }\n    .cloud:after  { content: \"\"; width: 42px; height: 42px; left: 38px; top: -18px; }\n    .cloud.two { left: 220px; top: 88px; transform: scale(0.9); opacity: 0.9; }\n\n    .ground-line {\n      position: absolute;\n      left: 0;\n      right: 0;\n      bottom: 58px;\n      height: 6px;\n      background: #785030;\n      opacity: 0.95;\n    }\n\n    /* --- TREE PHYSICS STRUCTURE --- */\n    .tree-wrap {\n      position: absolute;\n      right: 164px;\n      bottom: 64px;\n      width: 170px;\n      height: 240px;\n      z-index: 4;\n    }\n\n    .stump-fixed {\n      position: absolute;\n      left: 14px;\n      bottom: 0;\n      width: 32px;\n      height: 38px;\n      background: linear-gradient(180deg, #875a36 0%, #7e5331 100%);\n      border-radius: 6px 6px 0 0;\n    }\n    \n    .stump-surface {\n      position: absolute;\n      left: 2px;\n      right: 2px;\n      top: -3px;\n      height: 8px;\n      background: #dca96f;\n      border-radius: 50%;\n      opacity: 0;\n    }\n\n    .tree-falling {\n      position: absolute;\n      inset: 0;\n      transform-origin: 30px calc(100% - 36px); \n    }\n\n    .trunk {\n      position: absolute;\n      left: 18px;\n      bottom: 36px;\n      width: 24px;\n      height: 76px;\n      background: linear-gradient(180deg, #96643d 0%, #875a36 100%);\n      border-radius: 8px 8px 0 0;\n    }\n\n    .cutmark {\n      position: absolute;\n      left: 15px;\n      bottom: 34px;\n      width: 30px;\n      height: 6px;\n      background: #f4c47d;\n      border-radius: 10px;\n      opacity: 0;\n      z-index: 5;\n    }\n\n    /* --- LUSH CANOPY --- */\n    .leaf {\n      position: absolute;\n      border-radius: 50%;\n      box-shadow: inset -8px -10px 0 rgba(0,0,0,0.1);\n    }\n    .leaf1 { width: 100px; height: 100px; left: -20px; top: 70px; background: var(--green); }\n    .leaf2 { width: 120px; height: 120px; left: 30px; top: 40px; background: var(--green2); z-index: 2; }\n    .leaf3 { width: 90px; height: 90px; left: 10px; top: -5px; background: var(--green); }\n    .leaf4 { width: 80px; height: 80px; left: 80px; top: 15px; background: var(--green3); }\n    .leaf5 { width: 70px; height: 70px; left: -10px; top: 30px; background: var(--green3); z-index: -1; }\n\n    /* --- THE NEST --- */\n    .nest-wrap {\n      position: absolute;\n      left: 55px;\n      top: 100px;\n      z-index: 5;\n    }\n    .nest {\n      width: 36px;\n      height: 18px;\n      background: repeating-linear-gradient(45deg, #614026, #614026 3px, #4d311c 3px, #4d311c 6px);\n      border-radius: 4px 4px 18px 18px;\n      position: relative;\n      box-shadow: inset 0 -4px 6px rgba(0,0,0,0.3), 0 4px 4px rgba(0,0,0,0.15);\n    }\n    .egg {\n      position: absolute;\n      width: 12px;\n      height: 16px;\n      background: #d4f0f7;\n      border-radius: 50%;\n      box-shadow: inset -2px -3px 0 rgba(0,0,0,0.15);\n      z-index: -1;\n    }\n    .egg.e1 { left: 6px; top: -8px; transform: rotate(-20deg); }\n    .egg.e2 { left: 18px; top: -6px; transform: rotate(15deg); }\n\n    /* --- LUMBERJACK --- */\n    .lumberjack {\n      position: absolute;\n      left: 395px;\n      bottom: 64px;\n      width: 170px;\n      height: 185px;\n      z-index: 6;\n      transform: translateX(-170px);\n      opacity: 0;\n    }\n\n    .head {\n      position: absolute;\n      left: 24px;\n      top: 10px;\n      width: 30px;\n      height: 30px;\n      background: #efc08a;\n      border-radius: 50%;\n      z-index: 2;\n    }\n    .cap {\n      position: absolute;\n      left: 20px;\n      top: 4px;\n      width: 38px;\n      height: 16px;\n      background: #c84739;\n      border-radius: 16px 16px 4px 4px;\n      z-index: 3;\n    }\n    .body {\n      position: absolute;\n      left: 23px;\n      top: 38px;\n      width: 32px;\n      height: 58px;\n      background: #2a62b8;\n      border-radius: 12px;\n    }\n\n    .leg1, .leg2 {\n      position: absolute;\n      top: 90px;\n      width: 10px;\n      height: 58px;\n      background: #364153;\n      border-radius: 10px;\n      transform-origin: top center;\n    }\n    .leg1 { left: 26px; }\n    .leg2 { left: 42px; }\n\n    .arm {\n      position: absolute;\n      height: 10px;\n      background: #efc08a;\n      border-radius: 10px;\n      transform-origin: 8px 5px;\n    }\n    .arm.back {\n      left: 20px;\n      top: 52px;\n      width: 44px;\n      z-index: 0;\n      opacity: 0.82;\n      transform-origin: 38px 5px;\n    }\n    .arm.front {\n      left: 42px;\n      top: 52px;\n      width: 92px;\n      z-index: 2;\n    }\n\n    .chainsaw {\n      position: absolute;\n      left: 70px;\n      top: -18px;\n      width: 76px;\n      height: 34px;\n      z-index: 4;\n      transform-origin: 8px 17px;\n    }\n    .saw-body {\n      position: absolute;\n      left: 0;\n      top: 6px;\n      width: 42px;\n      height: 24px;\n      background: linear-gradient(180deg, #ff8d31 0%, #f26828 100%);\n      border-radius: 8px;\n      box-shadow: inset -6px -5px 0 rgba(0,0,0,0.08);\n    }\n    .saw-body:before {\n      content: \"\";\n      position: absolute;\n      left: 6px;\n      top: -8px;\n      width: 18px;\n      height: 10px;\n      border: 4px solid #2e2e2e;\n      border-bottom: 0;\n      border-radius: 10px 10px 0 0;\n    }\n    .saw-body:after {\n      content: \"\";\n      position: absolute;\n      right: 6px;\n      top: 9px;\n      width: 9px;\n      height: 6px;\n      background: #39424e;\n      border-radius: 5px;\n    }\n    .blade {\n      position: absolute;\n      left: 34px;\n      top: 10px;\n      width: 42px;\n      height: 16px;\n      background: linear-gradient(180deg, #cfd7df 0%, #b9c3cf 100%);\n      border-radius: 2px 8px 8px 2px;\n      overflow: hidden;\n    }\n    .blade:after {\n      content: \"\";\n      position: absolute;\n      inset: 0;\n      background: repeating-linear-gradient(90deg, transparent 0 5px, #8c99a8 5px 6px);\n      opacity: 0.9;\n    }\n    .exhaust {\n      position: absolute;\n      left: -6px;\n      top: 16px;\n      width: 10px;\n      height: 6px;\n      background: #4d5157;\n      border-radius: 4px;\n    }\n\n    /* --- SMOKE & POLLUTION --- */\n    .smoke {\n      position: absolute;\n      width: 40px;\n      height: 40px;\n      border-radius: 50%;\n      background: radial-gradient(circle at 40% 40%, #525252 0%, #2b2b2b 60%, #1a1a1a 100%);\n      opacity: 0;\n      filter: blur(4px);\n      z-index: 8;\n    }\n    .smoke.s1 { left: 450px; bottom: 80px; }\n    .smoke.s2 { left: 480px; bottom: 90px; }\n    .smoke.s3 { left: 510px; bottom: 70px; }\n\n    .pollution-label {\n      position: absolute;\n      left: 450px;\n      bottom: 240px;\n      padding: 8px 14px;\n      border-radius: 8px;\n      background: #bd3131;\n      color: white;\n      font-weight: bold;\n      font-size: 14px;\n      opacity: 0;\n      z-index: 10;\n      box-shadow: 0 4px 12px rgba(189, 49, 49, 0.4);\n    }\n\n    /* --- ANIMATIONS --- */\n    .play .lumberjack { animation: walkIn var(--duration) linear forwards; }\n    .play .leg1 { animation: legLeft 0.55s ease-in-out 4; }\n    .play .leg2 { animation: legRight 0.55s ease-in-out 4; }\n    .play .arm.front { animation: sawArm var(--duration) linear forwards; }\n    .play .arm.back { animation: supportArm var(--duration) linear forwards; }\n    .play .chainsaw { animation: sawBuzz var(--duration) linear forwards; }\n    \n    .play .cutmark { animation: cutAppear var(--duration) linear forwards; }\n    .play .stump-surface { animation: cutAppear var(--duration) linear forwards; }\n    .play .tree-falling { animation: treeFall var(--duration) linear forwards; }\n    \n    .play .smoke.s1 { animation: smokeRise1 var(--duration) linear forwards; }\n    .play .smoke.s2 { animation: smokeRise2 var(--duration) linear forwards; }\n    .play .smoke.s3 { animation: smokeRise3 var(--duration) linear forwards; }\n    .play .pollution-label { animation: labelAppear var(--duration) linear forwards; }\n\n    @keyframes walkIn {\n      0%   { transform: translateX(-170px); opacity: 0; }\n      9%   { transform: translateX(-110px); opacity: 1; }\n      23%  { transform: translateX(-52px); opacity: 1; }\n      100% { transform: translateX(-52px); opacity: 1; }\n    }\n    @keyframes legLeft {\n      0%,100% { transform: rotate(13deg); }\n      50%     { transform: rotate(-13deg); }\n    }\n    @keyframes legRight {\n      0%,100% { transform: rotate(-13deg); }\n      50%     { transform: rotate(13deg); }\n    }\n    @keyframes sawArm {\n      0%, 24%   { transform: rotate(0deg); }\n      32%       { transform: rotate(-4deg); }\n      40%       { transform: rotate(2deg); }\n      48%       { transform: rotate(-3deg); }\n      56%       { transform: rotate(2deg); }\n      64%       { transform: rotate(-2deg); }\n      72%, 100% { transform: rotate(0deg); }\n    }\n    @keyframes supportArm {\n      0%, 24%   { transform: rotate(10deg); }\n      32%       { transform: rotate(16deg); }\n      40%       { transform: rotate(6deg); }\n      48%       { transform: rotate(15deg); }\n      56%       { transform: rotate(7deg); }\n      64%       { transform: rotate(13deg); }\n      72%, 100% { transform: rotate(10deg); }\n    }\n    @keyframes sawBuzz {\n      0%, 24%   { transform: translate(0,0) rotate(0deg); }\n      25%, 66%  { transform: translate(1px, -1px) rotate(0deg); }\n      26%, 68%  { transform: translate(-1px, 1px) rotate(0deg); }\n      69%, 100% { transform: translate(0,0) rotate(0deg); }\n    }\n\n    @keyframes cutAppear {\n      0%, 28%   { opacity: 0; }\n      30%, 72%  { opacity: 1; }\n      73%, 100% { opacity: 1; }\n    }\n\n    @keyframes treeFall {\n      0%, 72%   { transform: rotate(0deg); opacity: 1; }\n      100%      { transform: rotate(88deg); opacity: 1; }\n    }\n\n    @keyframes smokeRise1 {\n      0%, 73%   { opacity: 0; transform: translate(0,0) scale(0.2); }\n      80%       { opacity: 0.85; transform: translate(-15px, -60px) scale(2.5); }\n      100%      { opacity: 0; transform: translate(-40px, -280px) scale(4.5); }\n    }\n    @keyframes smokeRise2 {\n      0%, 75%   { opacity: 0; transform: translate(0,0) scale(0.2); }\n      82%       { opacity: 0.8; transform: translate(10px, -70px) scale(3); }\n      100%      { opacity: 0; transform: translate(20px, -300px) scale(5); }\n    }\n    @keyframes smokeRise3 {\n      0%, 77%   { opacity: 0; transform: translate(0,0) scale(0.2); }\n      84%       { opacity: 0.75; transform: translate(35px, -50px) scale(2); }\n      100%      { opacity: 0; transform: translate(60px, -260px) scale(4); }\n    }\n    @keyframes labelAppear {\n      0%, 78%   { opacity: 0; transform: translateY(10px) scale(0.8); }\n      84%       { opacity: 1; transform: translateY(-10px) scale(1); }\n      92%, 100% { opacity: 0; transform: translateY(-120px) scale(1); }\n    }";
const ECOPRINT_ANIMATION_HTML = "<div class=\"stageWrap\"><div id=\"stage\" class=\"stage play\">\n        <div class=\"stage-inner\">\n          <div class=\"sun\"></div>\n          <div class=\"cloud\"></div>\n          <div class=\"cloud two\"></div>\n          <div class=\"ground-line\"></div>\n\n          <div class=\"smoke s1\"></div>\n          <div class=\"smoke s2\"></div>\n          <div class=\"smoke s3\"></div>\n          <div class=\"pollution-label\">\u26a0\ufe0f Habitat & Carbon Lost</div>\n\n          <div class=\"lumberjack\">\n            <div class=\"cap\"></div>\n            <div class=\"head\"></div>\n            <div class=\"body\"></div>\n            <div class=\"leg1\"></div>\n            <div class=\"leg2\"></div>\n            <div class=\"arm back\"></div>\n            <div class=\"arm front\">\n              <div class=\"chainsaw\">\n                <div class=\"saw-body\"></div>\n                <div class=\"blade\"></div>\n                <div class=\"exhaust\"></div>\n              </div>\n            </div>\n          </div>\n\n          <div class=\"tree-wrap\">\n            <div class=\"stump-fixed\">\n              <div class=\"stump-surface\"></div>\n            </div>\n            \n            <div class=\"tree-falling\">\n              <div class=\"leaf leaf5\"></div>\n              <div class=\"leaf leaf4\"></div>\n              <div class=\"leaf leaf3\"></div>\n              <div class=\"leaf leaf2\"></div>\n              <div class=\"leaf leaf1\"></div>\n              \n              <div class=\"nest-wrap\">\n                <div class=\"egg e1\"></div>\n                <div class=\"egg e2\"></div>\n                <div class=\"nest\"></div>\n              </div>\n\n              <div class=\"trunk\"></div>\n            </div>\n            \n            <div class=\"cutmark\"></div>\n          </div>\n        </div></div>";

function removeChopAnimation() {
  const old = document.getElementById("ecoprint-chop-overlay");
  if (old) old.remove();
}

function showChopAnimation(pages, trees) {
  removeChopAnimation();

  const overlay = document.createElement("div");
  overlay.id = "ecoprint-chop-overlay";
  overlay.className = "ecoprint-ui";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    background: rgba(0,0,0,0.38);
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const shadow = overlay.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      ${ECOPRINT_ANIMATION_CSS}

      .ecoprint-v4-shell {
        width: min(440px, calc(100vw - 32px));
        max-height: min(92vh, 640px);
        overflow: auto;
        background: white;
        color: #193024;
        border-radius: 22px;
        box-shadow: 0 18px 44px rgba(0,0,0,0.28);
        font-family: Arial, sans-serif;
      }

      .ecoprint-v4-header {
        padding: 18px 20px 10px;
        border-bottom: 1px solid #edf4ed;
        background: #f9fcf9;
      }

      .ecoprint-v4-title {
        margin: 0;
        font-size: 20px;
        font-weight: 800;
      }

      .ecoprint-v4-subtitle {
        margin: 4px 0 0;
        color: #5d7165;
        line-height: 1.4;
        font-size: 13px;
      }

      .ecoprint-v4-actions {
        display: flex;
        justify-content: flex-end;
        padding: 0 16px 16px;
        gap: 8px;
      }

      .ecoprint-v4-button {
        border: 0;
        border-radius: 8px;
        background: #1d6b43;
        color: white;
        font-weight: 700;
        padding: 8px 12px;
        font-size: 12px;
        cursor: pointer;
      }

      .ecoprint-v4-button.secondary {
        background: #dfece2;
        color: #1d3a28;
      }

      @media print {
        :host {
          display: none !important;
          visibility: hidden !important;
        }
      }
    </style>

    <div class="ecoprint-v4-shell">
      <div class="ecoprint-v4-header">
        <div class="ecoprint-v4-title">🌱 EcoPrint impact</div>
        <p class="ecoprint-v4-subtitle">
          Your print was counted: <strong>${pages}</strong> page${pages === 1 ? "" : "s"} ≈
          <strong>${Number(trees).toFixed(5)}</strong> trees.
        </p>
      </div>

      ${ECOPRINT_ANIMATION_HTML}

      <div class="ecoprint-v4-actions">
        <button id="ecoprint-v4-replay" class="ecoprint-v4-button secondary">Replay</button>
        <button id="ecoprint-v4-close" class="ecoprint-v4-button">Okay</button>
      </div>
    </div>
  `;

  document.documentElement.appendChild(overlay);

  const stage = shadow.getElementById("stage");
  const replay = () => {
    if (!stage) return;
    stage.classList.remove("play");
    void stage.offsetWidth;
    stage.classList.add("play");
  };

  replay();

  shadow.getElementById("ecoprint-v4-replay").addEventListener("click", replay);
  shadow.getElementById("ecoprint-v4-close").addEventListener("click", removeChopAnimation);

  setTimeout(removeChopAnimation, 6500);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function handleBeforePrint() {
  const now = Date.now();
  if (now - lastBeforePrintTime < BEFORE_PRINT_DEBOUNCE_MS) return;
  lastBeforePrintTime = now;

  ensurePrintSafeStyles();
  pendingEstimate = await buildPendingEstimate();

  // Store pending estimate so the popup can also confirm it if needed.
  await chrome.storage.local.set({ pendingPrint: pendingEstimate });
}

async function handleAfterPrint() {
  ensurePrintSafeStyles();

  // Some browsers may reload/clear JS state around print preview, so fall back to storage.
  let estimate = pendingEstimate;
  if (!estimate) {
    const stored = await chrome.storage.local.get(ECOPRINT_DEFAULTS);
    estimate = stored.pendingPrint;
  }

  if (!estimate) return;

  // Small delay lets Chrome fully close print preview before we show our confirmation UI.
  setTimeout(() => showConfirmModal(estimate), 400);
}

ensurePrintSafeStyles();
window.addEventListener("beforeprint", handleBeforePrint);
window.addEventListener("afterprint", handleAfterPrint);
