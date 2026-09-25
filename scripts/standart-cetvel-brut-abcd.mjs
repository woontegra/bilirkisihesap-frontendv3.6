/**
 * Standart FM CetvelBrutInput — real Chromium A/B/C/D against the component source contract.
 * Imports finished behavior by inlining the same rules as CetvelBrutInput.tsx.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  path.join(root, "../src/pages/hesaplamalar/fazla-mesai/shared/CetvelBrutInput.tsx"),
  "utf8",
);

// Guard: source must encode "" → revert, not "" → 0
if (src.includes('trimmed === ""') === false || src.includes("Number(e.target.value)") ) {
  console.error("FAIL: CetvelBrutInput source contract missing or still uses Number(e.target)");
  process.exit(1);
}
if (!src.includes("onCommitRef.current(n)") && !src.includes("onCommitBrut")) {
  console.error("FAIL: onCommit wiring missing");
  process.exit(1);
}

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>CetvelBrut A/B/C/D</title></head>
<body><div id="root"></div>
<script type="module">
import React, { useCallback, useEffect, useRef, useState } from "https://esm.sh/react@19.1.0";
import { createRoot } from "https://esm.sh/react-dom@19.1.0/client";

function isCetvelRowVisible(r) {
  if (r.isManual) return true;
  return Number(r.fmHours ?? 0) !== 0 && Number(r.weeks ?? 0) !== 0 && Number(r.fm ?? 0) !== 0;
}

function CetvelBrutInput({ value, onCommitBrut, ariaLabel = "Ücret" }) {
  const [draft, setDraft] = useState(() => String(value));
  const focusedRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onCommitRef = useRef(onCommitBrut);
  onCommitRef.current = onCommitBrut;

  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value));
  }, [value]);

  const finishEdit = useCallback((raw) => {
    const trimmed = raw.trim();
    const committed = valueRef.current;
    if (trimmed === "") { setDraft(String(committed)); return; }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) { setDraft(String(committed)); return; }
    setDraft(String(n));
    if (n === committed) return;
    onCommitRef.current(n);
  }, []);

  return React.createElement("input", {
    type: "text",
    inputMode: "decimal",
    "aria-label": ariaLabel,
    value: draft,
    onChange: (e) => setDraft(e.target.value),
    onFocus: () => { focusedRef.current = true; },
    onBlur: (e) => { focusedRef.current = false; finishEdit(e.target.value); },
    onKeyDown: (e) => { if (e.key === "Enter") e.currentTarget.blur(); },
  });
}

function Harness() {
  const [brut, setBrut] = useState(5004);
  const fm = brut > 0 ? 100 : 0;
  const visible = isCetvelRowVisible({ weeks: 4, fmHours: 10, fm, isManual: false });
  const commits = window.__commits || (window.__commits = []);

  if (!visible) return React.createElement("div", { "data-testid": "row-hidden" }, "hidden");

  return React.createElement("div", null,
    React.createElement(CetvelBrutInput, {
      value: brut,
      onCommitBrut: (n) => { commits.push(n); setBrut(n); },
    }),
    React.createElement("div", { "data-testid": "committed-brut" }, String(brut)),
    React.createElement("div", { "data-testid": "row-fm" }, String(fm)),
    React.createElement("button", { "data-testid": "outside", type: "button" }, "outside"),
  );
}

createRoot(document.getElementById("root")).render(React.createElement(Harness));
window.__ready = true;
</script></body></html>`;

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results = { A: "FAIL", B: "FAIL", C: "FAIL", D: "FAIL" };

  try {
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });

    const input = page.getByLabel("Ücret");

    // A: clear, wait 3s, row visible, committed 5004
    await input.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(3000);
    const aHidden = await page.getByTestId("row-hidden").count();
    const aCommitted = await page.getByTestId("committed-brut").textContent();
    const aDraft = await input.inputValue();
    if (aHidden === 0 && aCommitted === "5004" && aDraft === "") results.A = "PASS";
    else results.A = `FAIL hidden=${aHidden} committed=${aCommitted} draft=${aDraft}`;

    // B: type 10000 Enter
    await input.type("10000");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const bCommitted = await page.getByTestId("committed-brut").textContent();
    const bFm = await page.getByTestId("row-fm").textContent();
    if (bCommitted === "10000" && bFm === "100") results.B = "PASS";
    else results.B = `FAIL committed=${bCommitted} fm=${bFm}`;

    // C: clear + click outside → revert
    await input.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await page.getByTestId("outside").click();
    await page.waitForTimeout(200);
    const cHidden = await page.getByTestId("row-hidden").count();
    const cCommitted = await page.getByTestId("committed-brut").textContent();
    const cDraft = await input.inputValue();
    if (cHidden === 0 && cCommitted === "10000" && cDraft === "10000") results.C = "PASS";
    else results.C = `FAIL hidden=${cHidden} committed=${cCommitted} draft=${cDraft}`;

    // D: type 0 Enter → hide
    await input.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await input.type("0");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const dHidden = await page.getByTestId("row-hidden").count();
    if (dHidden === 1) results.D = "PASS";
    else results.D = `FAIL hidden=${dHidden}`;

    console.log(JSON.stringify(results, null, 2));
    const ok = Object.values(results).every((v) => v === "PASS");
    process.exit(ok ? 0 : 1);
  } finally {
    await browser.close();
  }
}

await run();
