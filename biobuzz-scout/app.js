// BioBuzz Scout — the whole app. Season-specific fields live in config.js.
(() => {
  "use strict";
  const C = window.SCOUT_CONFIG;
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

  // ---------- fields from config ----------
  const FIELDS = [];
  for (const s of C.sections) for (const f of s.fields) FIELDS.push({ ...f, key: s.id + "." + f.id, section: s });
  const COUNTERS = FIELDS.filter(f => f.type === "counter");
  const byKey = Object.fromEntries(FIELDS.map(f => [f.key, f]));
  // A fingerprint of the field list. Phones whose config differs refuse each other's codes.
  const SIG = hash(FIELDS.map(f => f.key + ":" + f.type + (f.options ? "(" + f.options.map(o => o.id).join(",") + ")" : "")).join("|"));
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  const counterColor = f => (C.colors && C.colors[f.color]) || f.color || "var(--honey)";

  // ---------- storage (this device only) ----------
  const P = "bbs:" + C.season + ":";
  const store = {
    get(k, d) { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch { toast("This phone is out of storage space. Hand off and clear old reports."); return false; } },
  };
  let mine = store.get("mine", {});        // reports scouted on this phone: id -> report (+ sent flag)
  let lead = store.get("lead", {});        // reports the lead has scanned: id -> report
  let removed = store.get("removed", {});  // ids the lead deleted, so a rescan doesn't bring them back
  let seen = store.get("seen", {});        // scout name -> { at, matches, count }

  // ---------- small helpers ----------
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const newId = () => Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-5);
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const fmt = n => n == null ? "–" : Number.isInteger(n) ? String(n) : n.toFixed(1);
  const pct = n => n == null ? "–" : Math.round(n * 100) + "%";
  const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.round(m / 60) + " hr ago"; };
  let toastTimer;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2800); }

  function blankValues() {
    const v = {};
    for (const f of FIELDS) v[f.key] = f.type === "counter" ? 0 : f.type === "checks" ? [] : f.type === "text" ? "" : null;
    return v;
  }
  const blankForm = () => ({ team: "", teamName: "", match: "", scouter: localStorage.getItem("bbs:name") || "", v: blankValues() });
  let form = Object.assign(blankForm(), store.get("draft", {}));
  form.v = Object.assign(blankValues(), form.v);

  // Team names: the Michigan list (teams.js), then config overrides, then whatever scouts have typed.
  function teamNames() {
    const names = { ...(window.SCOUT_TEAMS || {}), ...(C.teams || {}) };
    const all = [...Object.values(lead), ...Object.values(mine)].sort((a, b) => a.at - b.at);
    for (const r of all) if (r.teamName) names[r.team] = r.teamName;
    return names;
  }

  // ===================================================================
  //  SCOUT FORM
  // ===================================================================
  const F = $("#form");
  function fieldHtml(f) {
    const k = esc(f.key);
    if (f.type === "counter") return `
      <div class="counter" style="--c:${esc(counterColor(f))}">
        <div class="lbl">${esc(f.label)}</div>
        <div class="n" data-n="${k}" aria-live="polite">0</div>
        <div class="btns">
          <button type="button" class="minus" data-dec="${k}" aria-label="Remove one ${esc(f.label)}">−</button>
          <button type="button" class="plus" data-inc="${k}" aria-label="Add one ${esc(f.label)}">+</button>
        </div>
      </div>`;
    if (f.type === "text") return `<label class="f">${esc(f.label)}<textarea data-text="${k}" maxlength="${f.maxLength || 280}" placeholder="${esc(f.placeholder || "")}"></textarea></label>`;
    const opts = f.type === "yesno" ? [{ id: true, label: "Yes" }, { id: false, label: "No" }] : f.options;
    const attr = f.type === "checks" ? "data-check" : "data-pick";
    return `<div class="q"><span>${esc(f.label)}</span><div class="seg" role="group" aria-label="${esc(f.label)}">
      ${opts.map(o => `<button type="button" class="${o.id === false ? "no" : ""}" ${attr}="${k}" data-val='${esc(JSON.stringify(o.id))}' aria-pressed="false">${esc(o.label)}</button>`).join("")}
    </div></div>`;
  }
  F.innerHTML = `
    <div class="banner" id="install-hint" hidden></div>
    <div class="card">
      <div class="fields">
        <label class="f">Team number<input class="big" id="f-team" inputmode="numeric" autocomplete="off" placeholder="1234"></label>
        <label class="f">Match number<input class="big" id="f-match" inputmode="numeric" autocomplete="off" placeholder="12"></label>
        <label class="f full">Team name<input id="f-teamName" autocomplete="off" placeholder="Fills in from the team number"></label>
        <label class="f full">Your name<input id="f-scouter" autocomplete="name" placeholder="Scout name"></label>
      </div>
      <p class="hint warn" id="dup-hint" hidden></p>
    </div>
    ${C.sections.map(s => {
      const counters = s.fields.filter(f => f.type === "counter").map(f => fieldHtml(byKey[s.id + "." + f.id])).join("");
      const rest = s.fields.filter(f => f.type !== "counter").map(f => fieldHtml(byKey[s.id + "." + f.id])).join("");
      return `<div class="card"><h2 class="section-h">${esc(s.title)}</h2>${s.hint ? `<p class="hint">${esc(s.hint)}</p>` : ""}${counters ? `<div class="counters">${counters}</div>` : ""}${rest}</div>`;
    }).join("")}
    <p class="err" id="form-err" hidden></p>
    <div class="actions">
      <button type="button" class="btn" id="reset">Clear</button>
      <button type="submit" class="btn primary">Save report</button>
    </div>`;

  const HEAD = { team: "f-team", match: "f-match", teamName: "f-teamName", scouter: "f-scouter" };
  let nameTouched = !!form.teamName;

  function paintForm() {
    for (const [k, id] of Object.entries(HEAD)) { const el = document.getElementById(id); if (el.value !== form[k]) el.value = form[k]; }
    F.querySelectorAll("[data-n]").forEach(el => (el.textContent = form.v[el.dataset.n]));
    F.querySelectorAll("[data-pick]").forEach(b => b.setAttribute("aria-pressed", String(JSON.stringify(form.v[b.dataset.pick]) === b.dataset.val)));
    F.querySelectorAll("[data-check]").forEach(b => b.setAttribute("aria-pressed", String(form.v[b.dataset.check].includes(JSON.parse(b.dataset.val)))));
    F.querySelectorAll("[data-text]").forEach(el => { if (el.value !== form.v[el.dataset.text]) el.value = form.v[el.dataset.text]; });
    paintDupHint();
  }
  function paintDupHint() {
    const h = $("#dup-hint"), t = form.team.trim(), m = form.match.trim();
    const n = t && m ? Object.values(mine).filter(r => r.team === t && r.match === m).length : 0;
    h.hidden = !n;
    h.textContent = n ? `You already saved team ${t} in match ${m} on this phone. Saving again adds a second report.` : "";
  }
  let draftTimer;
  const saveDraft = () => { clearTimeout(draftTimer); draftTimer = setTimeout(() => store.set("draft", form), 250); };

  F.addEventListener("input", e => {
    const el = e.target;
    if (el.dataset.text) { form.v[el.dataset.text] = el.value; saveDraft(); return; }
    const k = Object.keys(HEAD).find(k => HEAD[k] === el.id);
    if (!k) return;
    form[k] = el.value;
    if (k === "teamName") nameTouched = !!el.value;
    if (k === "team" && !nameTouched) { form.teamName = teamNames()[form.team.trim()] || ""; $("#f-teamName").value = form.teamName; }
    if (k === "scouter") try { localStorage.setItem("bbs:name", form.scouter); } catch {}
    if (k === "team" || k === "match") paintDupHint();
    saveDraft();
  });

  F.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.inc || b.dataset.dec) {
      const k = b.dataset.inc || b.dataset.dec;
      form.v[k] = Math.max(0, form.v[k] + (b.dataset.inc ? 1 : -1));
      const n = F.querySelector(`[data-n="${CSS.escape(k)}"]`);
      n.textContent = form.v[k]; n.classList.remove("bump"); void n.offsetWidth; n.classList.add("bump");
      try { navigator.vibrate && navigator.vibrate(8); } catch {}
    } else if (b.dataset.pick) {
      const v = JSON.parse(b.dataset.val);
      form.v[b.dataset.pick] = form.v[b.dataset.pick] === v ? null : v;
      paintForm();
    } else if (b.dataset.check) {
      const k = b.dataset.check, v = JSON.parse(b.dataset.val), arr = form.v[k];
      form.v[k] = arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
      paintForm();
    } else if (b.id === "reset") {
      if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again to clear"; setTimeout(() => { delete b.dataset.armed; b.textContent = "Clear"; }, 3000); return; }
      delete b.dataset.armed; b.textContent = "Clear";
      form = blankForm(); nameTouched = false; paintForm();
    } else return;
    saveDraft();
  });

  F.addEventListener("submit", e => {
    e.preventDefault();
    const err = $("#form-err");
    const team = form.team.trim(), match = form.match.trim(), scouter = form.scouter.trim();
    const missing = [!team && "team number", !match && "match number", !scouter && "your name"].filter(Boolean);
    if (missing.length) {
      err.hidden = false; err.textContent = `Add ${missing.join(", ")} before saving.`;
      document.getElementById(!team ? "f-team" : !match ? "f-match" : "f-scouter").focus();
      return;
    }
    err.hidden = true;
    const r = { id: newId(), team, match, scouter, teamName: form.teamName.trim(), at: Date.now(), v: JSON.parse(JSON.stringify(form.v)), sent: false };
    for (const f of FIELDS) if (f.type === "text") r.v[f.key] = (r.v[f.key] || "").trim();
    mine[r.id] = r;
    if (!store.set("mine", mine)) { delete mine[r.id]; return; }
    toast(`Saved: team ${team}, match ${match}. Hand off when the lead asks.`);
    const next = blankForm(); next.match = /^\d+$/.test(match) ? String(+match + 1) : match;
    form = next; nameTouched = false; store.set("draft", form);
    paintForm(); window.scrollTo({ top: 0, behavior: "smooth" });
    renderChrome();
  });

  // ===================================================================
  //  QR ENCODING
  //  A code holds: "BBS1|<season>|<field fingerprint>|" + JSON rows.
  //  Each row: [id, team, match, scout, team name, time(sec), ...field values in config order]
  //  Every code is self-contained, so the lead can scan them in any order.
  // ===================================================================
  const HEADER = `BBS1|${C.season}|${SIG}|`;
  const MAX_CODE_CHARS = 520; // keeps each code sparse enough for a phone camera

  function encodeValue(f, v) {
    if (f.type === "counter") return v | 0;
    if (f.type === "yesno") return v === true ? 1 : v === false ? 0 : null;
    if (f.type === "choice") { const i = f.options.findIndex(o => o.id === v); return i < 0 ? null : i; }
    if (f.type === "checks") return f.options.reduce((m, o, i) => (v || []).includes(o.id) ? m | (1 << i) : m, 0);
    return v || "";
  }
  function decodeValue(f, x) {
    if (f.type === "counter") return +x || 0;
    if (f.type === "yesno") return x === 1 ? true : x === 0 ? false : null;
    if (f.type === "choice") return x == null || !f.options[x] ? null : f.options[x].id;
    if (f.type === "checks") return f.options.filter((o, i) => x & (1 << i)).map(o => o.id);
    return typeof x === "string" ? x : "";
  }
  const toRow = r => [r.id, r.team, r.match, r.scouter, r.teamName || "", Math.round(r.at / 1000), ...FIELDS.map(f => encodeValue(f, r.v[f.key]))];
  function fromRow(row) {
    if (!Array.isArray(row) || row.length !== 6 + FIELDS.length) throw new Error("bad row");
    const [id, team, match, scouter, teamName, sec] = row;
    const v = {}; FIELDS.forEach((f, i) => (v[f.key] = decodeValue(f, row[6 + i])));
    return { id: String(id), team: String(team), match: String(match), scouter: String(scouter), teamName: String(teamName || ""), at: sec * 1000, v };
  }
  function buildCodes(reports) {
    const codes = []; let rows = [];
    for (const r of reports) {
      const row = toRow(r);
      if (rows.length && (HEADER + JSON.stringify([...rows, row])).length > MAX_CODE_CHARS) { codes.push({ text: HEADER + JSON.stringify(rows), ids: rows.map(x => x[0]) }); rows = []; }
      rows.push(row);
    }
    if (rows.length) codes.push({ text: HEADER + JSON.stringify(rows), ids: rows.map(x => x[0]) });
    return codes;
  }
  function parseCode(text) {
    if (!text.startsWith("BBS1|")) return { error: "That isn't a scouting code." };
    const parts = text.split("|");
    if (parts[1] !== C.season) return { error: `That phone is set up for a different season (${parts[1]}).` };
    if (parts[2] !== SIG) return { error: "That phone has a different version of the app. Open the app on both phones with internet so they update, then try again." };
    try { return { reports: JSON.parse(text.slice(HEADER.length)).map(fromRow) }; }
    catch { return { error: "Couldn't read that code. Try again, holding steady." }; }
  }
  function qrSvg(text) {
    const qr = qrcode(0, "L"); qr.addData(text, "Byte"); qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
  }

  // ===================================================================
  //  HAND OFF
  // ===================================================================
  let showAll = false, codeIdx = 0;
  function renderHandoff() {
    const el = $("#handoff");
    const all = Object.values(mine).sort((a, b) => natural(a.match, b.match) || a.at - b.at);
    const list = showAll ? all : all.filter(r => !r.sent);
    if (!all.length) { el.innerHTML = `<div class="empty"><strong>No reports on this phone yet</strong>Scout a match, then come here and show your code to the lead.</div>`; return; }
    const codes = buildCodes(list);
    codeIdx = Math.min(codeIdx, Math.max(0, codes.length - 1));
    const code = codes[codeIdx];
    const sentCount = all.filter(r => r.sent).length;
    el.innerHTML = `
      ${list.length ? `
      <div class="card">
        <div class="qr-nav">
          <button type="button" class="btn small" data-qr="-1" ${codeIdx === 0 ? "disabled" : ""}>‹ Prev</button>
          <strong>${codes.length > 1 ? `Code ${codeIdx + 1} of ${codes.length}` : "Show this to the lead"}</strong>
          <button type="button" class="btn small" data-qr="1" ${codeIdx >= codes.length - 1 ? "disabled" : ""}>Next ›</button>
        </div>
        <div class="qr-box" role="img" aria-label="QR code with ${code.ids.length} reports">${qrSvg(code.text)}</div>
        <p class="hint">${codes.length > 1 ? "Let the lead scan every code. " : ""}Turn your screen brightness up if the lead's camera struggles.</p>
        <ul class="list">${list.filter(r => code.ids.includes(r.id)).map(r => `<li><span>Match ${esc(r.match)} · Team ${esc(r.team)}</span><span>${r.sent ? "handed off before" : esc(ago(r.at))}</span></li>`).join("")}</ul>
        ${showAll ? "" : `<button type="button" class="btn primary" id="mark-sent">Lead scanned it</button>`}
      </div>` : `<div class="banner good"><strong>All caught up</strong>Every report on this phone has been handed off.</div>`}
      <div class="card">
        <label class="switch"><input type="checkbox" id="show-all" ${showAll ? "checked" : ""}> Show reports already handed off (${sentCount}), in case the lead needs them again</label>
        ${sentCount ? `<div class="actions"><button type="button" class="btn small danger" id="clear-sent">Delete handed-off reports from this phone</button></div>` : ""}
      </div>`;
  }
  $("#handoff").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.qr) { codeIdx += +b.dataset.qr; renderHandoff(); return; }
    if (b.id === "mark-sent") {
      for (const r of Object.values(mine)) r.sent = true;
      store.set("mine", mine); codeIdx = 0; toast("Marked as handed off."); renderChrome(); return;
    }
    if (b.id === "clear-sent") {
      if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again to delete for good"; return; }
      for (const [id, r] of Object.entries(mine)) if (r.sent) delete mine[id];
      store.set("mine", mine); renderChrome();
    }
  });
  $("#handoff").addEventListener("change", e => { if (e.target.id === "show-all") { showAll = e.target.checked; codeIdx = 0; renderHandoff(); } });

  // ===================================================================
  //  LEAD: SCANNING
  // ===================================================================
  let stream = null, raf = 0, lastFrame = 0, lastText = "", lastAt = 0, audio = null;
  const video = $("#video"), canvas = document.createElement("canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });

  async function startCamera() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      video.srcObject = stream; await video.play();
      $("#cam-idle").hidden = true; $("#cam-toggle").textContent = "Stop camera";
      scanLoop();
    } catch (e) {
      stream = null;
      showResult("bad", "Couldn't open the camera", "Allow camera access for this site in your phone's settings, or use the photo option below.");
    }
  }
  function stopCamera() {
    cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; video.srcObject = null;
    $("#cam-idle").hidden = false; $("#cam-toggle").textContent = "Start camera";
  }
  function scanLoop() {
    if (!stream) return;
    raf = requestAnimationFrame(scanLoop);
    const now = performance.now();
    if (now - lastFrame < 120 || video.readyState < 2) return;
    lastFrame = now;
    const code = decodeFrom(video, video.videoWidth, video.videoHeight);
    if (code) handleCode(code);
  }
  function decodeFrom(src, w, h) {
    const scale = Math.min(1, 800 / Math.max(w, h));
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" });
  }
  function codeText(code) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(code.binaryData)); } catch { return code.data; }
  }
  function handleCode(code) {
    const text = codeText(code);
    if (text === lastText && Date.now() - lastAt < 4000) return;
    lastText = text; lastAt = Date.now();
    importCode(text);
  }
  function beep(ok) {
    try {
      if (!audio) return;
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = ok ? 880 : 220; g.gain.value = 0.15;
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.12);
    } catch {}
    try { navigator.vibrate && navigator.vibrate(ok ? 40 : [60, 60, 60]); } catch {}
  }
  function showResult(tone, title, body) {
    $("#scan-result").innerHTML = `<div class="banner ${tone}"><strong>${esc(title)}</strong>${esc(body)}</div>`;
  }
  function importCode(text) {
    const res = parseCode(text);
    if (res.error) { beep(false); showResult("bad", "Not added", res.error); return; }
    const { added, dup } = addToLead(res.reports);
    beep(true);
    const vf = $("#viewfinder"); vf.classList.add("hit"); setTimeout(() => vf.classList.remove("hit"), 600);
    const who = [...new Set(res.reports.map(r => r.scouter))].join(", ");
    const what = res.reports.map(r => `M${r.match}·${r.team}`).join(", ");
    showResult(added ? "good" : "", added ? `Added ${added} new report${added > 1 ? "s" : ""} from ${who}` : `Already have these from ${who}`,
      `${what}${dup && added ? ` (${dup} already had)` : ""}`);
    renderChrome();
  }
  function addToLead(reports) {
    let added = 0, dup = 0;
    for (const r of reports) {
      if (lead[r.id] || removed[r.id]) { dup++; continue; }
      lead[r.id] = r; added++;
      const s = seen[r.scouter] || { at: 0, matches: [], count: 0 };
      s.at = Date.now(); s.count++; if (!s.matches.includes(r.match)) s.matches.push(r.match);
      seen[r.scouter] = s;
    }
    store.set("lead", lead); store.set("seen", seen);
    return { added, dup };
  }
  $("#cam-toggle").addEventListener("click", () => (stream ? stopCamera() : startCamera()));
  $("#scan-photo").addEventListener("change", async e => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      const code = decodeFrom(bmp, bmp.width, bmp.height);
      if (code) { lastText = ""; handleCode(code); } else showResult("bad", "No code found in that photo", "Get closer so the code fills most of the picture, and avoid glare.");
    } catch { showResult("bad", "Couldn't open that photo", "Try taking it again."); }
  });

  function renderSeen() {
    const names = Object.keys(seen).sort((a, b) => seen[b].at - seen[a].at);
    $("#seen").innerHTML = names.length
      ? `<ul class="list">${names.map(n => { const s = seen[n]; const last = [...s.matches].sort(natural).pop(); return `<li><span><b>${esc(n)}</b> · ${s.count} report${s.count > 1 ? "s" : ""}, up to match ${esc(last)}</span><span>${esc(ago(s.at))}</span></li>`; }).join("")}</ul>`
      : `<p class="hint">Nobody yet. Each scout appears here after their first scan, so you can see who still needs to hand off.</p>`;
  }

  // ===================================================================
  //  LEAD: CONSOLIDATION
  // ===================================================================
  function leadReports() {
    const out = {};
    for (const r of Object.values(mine)) out[r.id] = r;  // a lead who also scouts counts their own reports
    for (const r of Object.values(lead)) out[r.id] = r;
    for (const id of Object.keys(removed)) delete out[id];
    return Object.values(out);
  }
  function vote(vals) {
    vals = vals.filter(v => v != null);
    if (!vals.length) return { v: null, disagree: false };
    const c = new Map(); vals.forEach(v => c.set(v, (c.get(v) || 0) + 1));
    const s = [...c.entries()].sort((a, b) => b[1] - a[1]);
    return { v: s.length > 1 && s[0][1] === s[1][1] ? "split" : s[0][0], disagree: c.size > 1 };
  }
  // One merged entry per team per match.
  function mergeEntry(reps) {
    const e = { team: reps[0].team, match: reps[0].match, n: reps.length, reports: reps, flags: [], v: {} };
    for (const f of FIELDS) {
      const vals = reps.map(r => r.v[f.key]);
      if (f.type === "counter") {
        const nums = vals.map(x => +x || 0);
        e.v[f.key] = mean(nums);
        if (reps.length > 1 && Math.max(...nums) - Math.min(...nums) >= C.flagDifference) e.flags.push(`${f.section.short} ${f.label.toLowerCase()} counts differ (${nums.join(" vs ")})`);
      } else if (f.type === "yesno" || f.type === "choice") {
        const r = vote(vals); e.v[f.key] = r.v;
        if (r.disagree && reps.length > 1) e.flags.push(`${f.short || f.label} disagrees`);
      } else if (f.type === "checks") {
        const frac = {}; let mixed = false;
        for (const o of f.options) { frac[o.id] = mean(vals.map(a => (a || []).includes(o.id) ? 1 : 0)); if (frac[o.id] > 0 && frac[o.id] < 1) mixed = true; }
        e.v[f.key] = frac;
        if (mixed && reps.length > 1) e.flags.push(`${f.short || f.label} disagrees`);
      }
    }
    e.total = COUNTERS.reduce((s, f) => s + e.v[f.key], 0);
    return e;
  }
  function consolidate() {
    const reps = leadReports(), names = teamNames(), groups = new Map();
    for (const r of reps) { const k = r.team + "|" + r.match; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    const entries = [...groups.values()].map(mergeEntry);
    const byMatch = new Map(), byTeam = new Map();
    for (const e of entries) {
      if (!byMatch.has(e.match)) byMatch.set(e.match, []); byMatch.get(e.match).push(e);
      if (!byTeam.has(e.team)) byTeam.set(e.team, []); byTeam.get(e.team).push(e);
    }
    const robots = [...byTeam.entries()].map(([team, es]) => {
      es.sort((a, b) => natural(a.match, b.match));
      const r = { team, teamName: names[team] || "", entries: es, matches: es.length, avg: {}, rate: {}, counts: {}, flags: es.reduce((s, e) => s + e.flags.length, 0) };
      for (const f of FIELDS) {
        if (f.type === "counter") r.avg[f.key] = mean(es.map(e => e.v[f.key]));
        if (f.type === "yesno") { const b = es.map(e => e.v[f.key]).filter(x => x === true || x === false); r.rate[f.key] = b.length ? b.filter(Boolean).length / b.length : null; }
        if (f.type === "choice") { r.counts[f.key] = {}; for (const o of f.options) r.counts[f.key][o.id] = es.filter(e => e.v[f.key] === o.id).length; }
        if (f.type === "checks") { r.rate[f.key] = {}; for (const o of f.options) r.rate[f.key][o.id] = mean(es.map(e => e.v[f.key][o.id])); }
      }
      r.avgTotal = mean(es.map(e => e.total)); r.best = Math.max(...es.map(e => e.total));
      return r;
    });
    return { names, byMatch, robots, count: reps.length };
  }

  // ---------- cell formatting ----------
  const yn = v => v === true ? '<span class="pill good">Yes</span>' : v === false ? '<span class="pill">No</span>' : v === "split" ? '<span class="pill warn">Split</span>' : "–";
  function choicePill(f, v) {
    if (v == null) return "–";
    if (v === "split") return '<span class="pill warn">Split</span>';
    const o = f.options.find(o => o.id === v); if (!o) return "–";
    return `<span class="pill ${o.tone || ""}">${esc(o.short || o.label)}</span>`;
  }
  const bar = r => r == null ? "–" : `${pct(r)}<span class="bar"><b style="width:${Math.round(r * 100)}%"></b></span>`;
  const counterCell = (f, v) => `<span style="color:${esc(counterColor(f))};font-weight:700">${fmt(v)}</span>`;
  const OTHER = FIELDS.filter(f => f.type === "yesno" || f.type === "choice" || f.type === "checks");

  // ---------- matches ----------
  function renderMatches(c) {
    const el = $("#matches");
    if (!c.byMatch.size) { el.innerHTML = `<div class="empty"><strong>No matches yet</strong>Scan a scout's phone on the Scan tab and their matches show up here.</div>`; return; }
    const head = `<tr><th>Team</th><th>Total</th>${COUNTERS.map(f => `<th><span class="grp">${esc(f.section.short)}</span>${esc(f.label)}</th>`).join("")}${OTHER.map(f => `<th><span class="grp">${esc(f.section.short)}</span>${esc(f.short || f.label)}</th>`).join("")}<th>Scouts</th></tr>`;
    el.innerHTML = `<div class="matches">${[...c.byMatch.keys()].sort(natural).reverse().map(m => {
      const es = c.byMatch.get(m).sort((a, b) => b.total - a.total), flags = es.reduce((s, e) => s + e.flags.length, 0);
      return `<article class="match">
        <div class="match-h"><h3>Match ${esc(m)}</h3><span>${es.length} robot${es.length > 1 ? "s" : ""} ${flags ? `<span class="pill warn">${flags} to check</span>` : ""}</span></div>
        <div class="scroll"><table><thead>${head}</thead><tbody>${es.map(e => `
          <tr><td class="team">${esc(e.team)}${e.flags.length ? ' <span class="pill warn">!</span>' : ""}<small>${esc(c.names[e.team] || "")}</small></td>
            <td class="tot">${fmt(e.total)}</td>
            ${COUNTERS.map(f => `<td>${counterCell(f, e.v[f.key])}</td>`).join("")}
            ${OTHER.map(f => `<td>${f.type === "yesno" ? yn(e.v[f.key]) : f.type === "choice" ? choicePill(f, e.v[f.key]) : f.options.filter(o => e.v[f.key][o.id] >= 0.5).map(o => esc(o.short || o.label)).join(", ") || "–"}</td>`).join("")}
            <td>${e.n}</td></tr>`).join("")}
        </tbody></table></div>
        ${es.filter(e => e.flags.length).map(e => `<p class="flag">Team ${esc(e.team)}: ${e.flags.map(esc).join(" · ")} (${e.reports.map(r => esc(r.scouter)).join(", ")})</p>`).join("")}
        </article>`;
    }).join("")}</div>`;
  }

  // ---------- robots ----------
  let sortKey = "avgTotal", sortDir = -1, openTeam = null;
  function robotColumns() {
    const cols = [
      { id: "team", label: "Team", sort: r => r.team, html: r => `${esc(r.team)}${r.flags ? ' <span class="pill warn" title="Scouts disagreed somewhere">!</span>' : ""}<small>${esc(r.teamName)}</small>`, cls: "team" },
      { id: "avgTotal", group: "avg", label: "Total", sort: r => r.avgTotal, html: r => fmt(r.avgTotal), cls: "tot" },
      { id: "best", label: "Best", sort: r => r.best, html: r => fmt(r.best) },
      { id: "matches", label: "Matches", sort: r => r.matches, html: r => r.matches },
      ...COUNTERS.map(f => ({ id: f.key, group: f.section.short + " avg", label: f.label, sort: r => r.avg[f.key], html: r => counterCell(f, r.avg[f.key]) })),
    ];
    for (const f of OTHER) {
      if (f.type === "yesno") cols.push({ id: f.key, group: f.section.short, label: f.short || f.label, sort: r => r.rate[f.key], html: r => bar(r.rate[f.key]) });
      if (f.type === "choice") cols.push({ id: f.key, group: f.section.short, label: f.short || f.label,
        sort: r => r.counts[f.key][f.options[0].id] / r.matches,
        html: r => f.options.filter(o => r.counts[f.key][o.id]).map(o => `<span class="pill ${o.tone || ""}">${esc(o.short || o.label)} ${r.counts[f.key][o.id]}</span>`).join(" ") || "–" });
      if (f.type === "checks") cols.push({ id: f.key, group: f.section.short, label: f.short || f.label,
        sort: r => f.options.reduce((s, o) => s + (r.rate[f.key][o.id] || 0), 0),
        html: r => f.options.filter(o => r.rate[f.key][o.id] > 0).map(o => `${esc(o.short || o.label)} ${pct(r.rate[f.key][o.id])}`).join(" · ") || "–" });
    }
    return cols;
  }
  function renderRobots(c) {
    const el = $("#robots");
    if (!c.robots.length) { el.innerHTML = `<div class="empty"><strong>No robots yet</strong>Once you've scanned some phones, each team gets a row with its averages, reliability and notes.</div>`; return; }
    const cols = robotColumns(), sc = cols.find(x => x.id === sortKey) || cols[0];
    const rs = [...c.robots].sort((a, b) => {
      const x = sc.sort(a), y = sc.sort(b);
      if (sc.id === "team") return natural(x, y) * -sortDir;
      return ((x ?? -1) - (y ?? -1)) * sortDir;
    });
    el.innerHTML = `<div class="scroll"><table>
      <thead><tr>${cols.map(col => `<th class="sortable ${col.id === sortKey ? "sorted" : ""}" data-sort="${esc(col.id)}" tabindex="0">${col.group ? `<span class="grp">${esc(col.group)}</span>` : ""}${esc(col.label)}${col.id === sortKey ? (sortDir < 0 ? " ↓" : " ↑") : ""}</th>`).join("")}</tr></thead>
      <tbody>${rs.map(r => `
        <tr class="row ${openTeam === r.team ? "open" : ""}" data-team="${esc(r.team)}" tabindex="0" aria-expanded="${openTeam === r.team}">
          ${cols.map(col => `<td class="${col.cls || ""}">${col.html(r)}</td>`).join("")}
        </tr>${openTeam === r.team ? detailRow(r, cols.length) : ""}`).join("")}
      </tbody></table></div>`;
  }
  function detailRow(r, span) {
    const texts = FIELDS.filter(f => f.type === "text");
    const notes = r.entries.flatMap(e => e.reports.flatMap(x => texts.filter(f => x.v[f.key]).map(f => ({ m: e.match, s: x.scouter, t: x.v[f.key] }))));
    return `<tr class="detail"><td colspan="${span}"><div class="detail-grid">
      <div><h3>Every report</h3><div class="scroll"><table class="mini">
        <thead><tr><th>Match</th>${COUNTERS.map(f => `<th><span class="grp">${esc(f.section.short)}</span>${esc(f.label)}</th>`).join("")}<th>Total</th>${OTHER.filter(f => f.type !== "checks").map(f => `<th>${esc(f.short || f.label)}</th>`).join("")}<th>Scout</th><th></th></tr></thead>
        <tbody>${r.entries.flatMap(e => e.reports.map((x, i) => `<tr>
          <td>${i === 0 ? esc(e.match) : ""}</td>
          ${COUNTERS.map(f => `<td>${counterCell(f, x.v[f.key])}</td>`).join("")}
          <td>${COUNTERS.reduce((s, f) => s + (+x.v[f.key] || 0), 0)}</td>
          ${OTHER.filter(f => f.type !== "checks").map(f => `<td>${f.type === "yesno" ? yn(x.v[f.key]) : choicePill(f, x.v[f.key])}</td>`).join("")}
          <td>${esc(x.scouter)}</td>
          <td><button class="btn small danger" data-del="${esc(x.id)}" type="button">Delete</button></td>
        </tr>`)).join("")}</tbody></table></div></div>
      <div><h3>Notes</h3>${notes.length ? `<ul class="notes">${notes.map(n => `<li><em>Match ${esc(n.m)} · ${esc(n.s)}</em>${esc(n.t)}</li>`).join("")}</ul>` : '<p class="hint">No notes for this team yet.</p>'}</div>
    </div></td></tr>`;
  }
  $("#robots").addEventListener("click", e => {
    const del = e.target.closest("[data-del]");
    if (del) {
      if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Confirm"; return; }
      const id = del.dataset.del;
      removed[id] = true; delete lead[id];
      store.set("removed", removed); store.set("lead", lead);
      toast("Report deleted."); renderChrome(); return;
    }
    const th = e.target.closest("[data-sort]");
    if (th) { const k = th.dataset.sort; sortDir = sortKey === k ? -sortDir : k === "team" ? 1 : -1; sortKey = k; renderLead(); return; }
    const row = e.target.closest("tr.row");
    if (row) { openTeam = openTeam === row.dataset.team ? null : row.dataset.team; renderLead(); }
  });
  $("#robots").addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const t = e.target.closest("[data-sort], tr.row"); if (!t) return;
    e.preventDefault(); t.click();
  });

  // ===================================================================
  //  LEAD: DATA (export, backup, restore, clear)
  // ===================================================================
  function renderData(c) {
    $("#data-stats").innerHTML = [
      [c.count, "reports"], [c.byMatch.size, "matches"], [c.robots.length, "robots"], [Object.keys(seen).length, "scouts"],
    ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");
  }
  async function saveFile(name, text, type) {
    const blob = new Blob([text], { type });
    try {
      const file = new File([blob], name, { type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  $("#export-csv").addEventListener("click", () => {
    const cell = v => { if (v === true) v = "Yes"; else if (v === false) v = "No"; else if (v == null) v = ""; else if (Array.isArray(v)) v = v.join(" + "); v = String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    const head = ["Match", "Team", "Team name", "Scout", ...FIELDS.map(f => `${f.section.title}: ${f.short || f.label}`), "Saved at"];
    const names = teamNames();
    const rows = leadReports().sort((a, b) => natural(a.match, b.match) || natural(a.team, b.team)).map(r =>
      [r.match, r.team, r.teamName || names[r.team] || "", r.scouter, ...FIELDS.map(f => {
        const v = r.v[f.key];
        if (f.type === "choice") { const o = f.options.find(o => o.id === v); return o ? o.label : ""; }
        if (f.type === "checks") return (v || []).map(id => (f.options.find(o => o.id === id) || {}).label).join(" + ");
        return v;
      }), new Date(r.at).toLocaleString()].map(cell).join(","));
    if (!rows.length) { toast("Nothing to save yet."); return; }
    saveFile(`${C.season}-scouting-${stamp()}.csv`, [head.map(cell).join(","), ...rows].join("\n"), "text/csv");
  });
  $("#export-backup").addEventListener("click", () => {
    saveFile(`${C.season}-backup-${stamp()}.json`, JSON.stringify({ app: "bbs", season: C.season, sig: SIG, lead: { ...mine, ...lead }, removed, seen }), "application/json");
  });
  $("#import-backup").addEventListener("change", async e => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    const msg = $("#data-msg");
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "bbs" || data.season !== C.season) throw new Error("That backup is from a different season or app.");
      Object.assign(removed, data.removed || {});
      const { added } = addToLead(Object.values(data.lead || {}).map(r => { const { sent, ...rest } = r; return rest; }));
      for (const [n, s] of Object.entries(data.seen || {})) if (!seen[n] || seen[n].at < s.at) seen[n] = s;
      store.set("removed", removed); store.set("seen", seen);
      msg.innerHTML = `<div class="banner good"><strong>Backup loaded</strong>${added} new report${added === 1 ? "" : "s"} added.</div>`;
      renderChrome();
    } catch (err) {
      msg.innerHTML = `<div class="banner bad"><strong>Couldn't load that file</strong>${esc(err.message && err.message.startsWith("That") ? err.message : "Pick a backup file saved from this app.")}</div>`;
    }
  });
  $("#clear-lead").addEventListener("click", e => {
    const b = e.currentTarget;
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again to clear everything"; setTimeout(() => { delete b.dataset.armed; b.textContent = "Clear lead data"; }, 4000); return; }
    lead = {}; removed = {}; seen = {};
    store.set("lead", lead); store.set("removed", removed); store.set("seen", seen);
    delete b.dataset.armed; b.textContent = "Clear lead data"; toast("Lead data cleared."); renderChrome();
  });

  // ===================================================================
  //  NAVIGATION + CHROME
  // ===================================================================
  let view = "scout", sub = "scan";
  function renderLead() {
    if (view !== "lead") return;
    const c = consolidate();
    if (sub === "scan") renderSeen();
    if (sub === "matches") renderMatches(c);
    if (sub === "robots") renderRobots(c);
    if (sub === "data") renderData(c);
  }
  function renderChrome() {
    const unsent = Object.values(mine).filter(r => !r.sent).length;
    const badge = $("#badge-handoff"); badge.hidden = !unsent; badge.textContent = unsent;
    const st = $("#status"), tx = $("#status-text");
    st.className = "status " + (unsent ? "warn" : "good");
    tx.textContent = unsent ? `${unsent} to hand off` : offlineReady ? "Works offline" : "Ready";
    if (view === "handoff") renderHandoff();
    renderLead();
    paintDupHint();
  }
  function show(v) {
    view = v;
    document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === v)));
    for (const id of ["scout", "handoff", "lead"]) $("#view-" + id).hidden = id !== v;
    if (v !== "lead" || sub !== "scan") stopCamera();
    renderChrome();
    window.scrollTo(0, 0);
  }
  function showSub(s) {
    sub = s;
    document.querySelectorAll("nav.subtabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.sub === s)));
    for (const id of ["scan", "matches", "robots", "data"]) $("#sub-" + id).hidden = id !== s;
    if (s !== "scan") stopCamera();
    renderLead();
  }
  document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => show(b.dataset.view)));
  document.querySelectorAll("nav.subtabs button").forEach(b => b.addEventListener("click", () => showSub(b.dataset.sub)));
  document.addEventListener("visibilitychange", () => { if (document.hidden) { store.set("draft", form); stopCamera(); } });

  // Install + offline
  let offlineReady = false;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (!standalone) {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const hint = $("#install-hint");
    hint.hidden = false;
    hint.innerHTML = `<strong>Add this to your home screen before the event</strong>${ios ? "In Safari, tap the Share button, then “Add to Home Screen”." : "Open your browser menu (⋮), then “Add to Home screen” or “Install app”."} Then it works with no internet.`;
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then(() => { offlineReady = true; renderChrome(); }).catch(() => {});
  }

  $("#app-name").innerHTML = esc(C.appName).replace(/^(\S+?)(Buzz|\s)/, "$1<span>$2</span>");
  $("#tagline").textContent = C.tagline || "";
  document.title = C.appName;

  // test hooks for the README's troubleshooting steps and automated checks
  window.__scout = { buildCodes, parseCode, importCode, qrSvg, consolidate, FIELDS };

  paintForm();
  show("scout");
})();
