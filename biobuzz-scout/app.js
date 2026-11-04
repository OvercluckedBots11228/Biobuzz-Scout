// BioBuzz Scout — the whole app. Season-specific fields live in config.js.
(() => {
  "use strict";
  const C = window.SCOUT_CONFIG;
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

  // ---------- fields from config ----------
  const FIELDS = [];
  for (const s of C.sections) for (const f of s.fields) FIELDS.push({ ...f, key: s.id + "." + f.id, section: s });
  const COUNTERS = FIELDS.filter(f => f.type === "counter");
  const SCORED = COUNTERS.filter(f => !f.miss);   // add up to the Total
  const MISSES = COUNTERS.filter(f => f.miss);    // missed shots: used for accuracy only
  const ACC_SECTIONS = C.sections.filter(s => MISSES.some(f => f.section === s));
  const RP_FIELDS = FIELDS.filter(f => f.options && f.options.some(o => typeof o.rp === "number"));
  const byKey = Object.fromEntries(FIELDS.map(f => [f.key, f]));
  // A fingerprint of the report layout. Phones whose config differs refuse each other's codes.
  const SIG = hash("row2|" + FIELDS.map(f => f.key + ":" + f.type + (f.options ? "(" + f.options.map(o => o.id).join(",") + ")" : "")).join("|"));
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
  let schedule = store.get("schedule", null); // { event, ver, matches: { "12": [red1, red2, blue1, blue2] }, parts: { n, got } }
  const SPOTS = ["Red 1", "Red 2", "Blue 1", "Blue 2"];
  let picks = store.get("picks", {});           // { [event]: { first: [], second: [], star: [], avoid: [] } } team numbers in order
  let official = store.get("official", {});     // { [event]: { at, matches: { "1": { teams, red, blue } }, teams: { "5618": { rank, rs, w, l, t } } } }
  let sinceBackup = store.get("sinceBackup", 0); // reports added since the lead last saved a backup
  // The event this phone is on: picked by the lead, or taken from a scanned schedule.
  let event = store.get("event", null) || { code: C.event.code, name: C.event.name };
  let eventTeams = store.get("eventTeams", {}); // { code, names: { "5618": "Control Freaks RED" } }
  function setEvent(ev) {
    if (event.code !== ev.code) { eventTeams = {}; store.set("eventTeams", eventTeams); }
    event = { code: ev.code, name: ev.name || ev.code, start: ev.start || "" };
    store.set("event", event);
  }

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

  // Team names: the Michigan list (teams.js), then the downloaded event list, then config fixes,
  // then whatever scouts have typed.
  function teamNames() {
    const names = { ...(window.SCOUT_TEAMS || {}), ...(eventTeams.names || {}), ...((schedule && schedule.names) || {}), ...(C.teams || {}) };
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
    if (f.tags) return `<div class="q"><span>${esc(f.label)}</span><div class="chips tag-chips" role="group" aria-label="${esc(f.label)}">
      ${f.options.map(o => `<button type="button" class="chip tag ${o.tone || ""}" data-check="${k}" data-val='${esc(JSON.stringify(o.id))}' aria-pressed="false">${esc(o.label)}</button>`).join("")}
    </div></div>`;
    const opts = f.type === "yesno" ? [{ id: true, label: "Yes" }, { id: false, label: "No" }] : f.options;
    const attr = f.type === "checks" ? "data-check" : "data-pick";
    return `<div class="q"><span>${esc(f.label)}</span><div class="seg" role="group" aria-label="${esc(f.label)}">
      ${opts.map(o => `<button type="button" class="${o.id === false ? "no" : ""}" ${attr}="${k}" data-val='${esc(JSON.stringify(o.id))}' aria-pressed="false">${esc(o.label)}</button>`).join("")}
    </div></div>`;
  }
  const phasesOf = s => [].concat(s.phase || "after");
  F.innerHTML = `
    <div class="banner" id="install-hint" hidden></div>
    <div class="match-bar" id="match-bar" hidden>
      <div class="mb-top"><span class="mb-phase" id="mb-phase"></span><span class="mb-who" id="mb-who"></span></div>
      <div class="mb-clock" id="mb-clock" aria-live="off"></div>
      <div class="mb-progress"><b id="mb-progress"></b></div>
      <p class="mb-cue" id="mb-cue" hidden></p>
      <div class="mb-ctl">
        <button type="button" class="btn small" id="mb-back">‹ Back</button>
        <button type="button" class="btn small" id="mb-next">Next ›</button>
        <button type="button" class="btn small" id="mb-exit">Full form</button>
      </div>
    </div>
    <div class="card" id="head-card">
      <p class="event-line" id="event-line"></p>
      <div class="q" id="spot-row"><span>Alliance position</span><div class="seg" role="group" aria-label="Alliance position">
        ${SPOTS.map((s, i) => `<button type="button" class="spot ${i < 2 ? "red" : "blue"}" data-spot="${i}" aria-pressed="false">${s}</button>`).join("")}
      </div></div>
      <div class="fields">
        <label class="f">Team number<input class="big" id="f-team" inputmode="numeric" autocomplete="off" placeholder="1234"></label>
        <label class="f">Match number<input class="big" id="f-match" inputmode="numeric" autocomplete="off" placeholder="12"></label>
        <label class="f full">Team name<input id="f-teamName" autocomplete="off" placeholder="Fills in from the team number"></label>
        <label class="f full">Your name<input id="f-scouter" autocomplete="name" placeholder="Scout name"></label>
      </div>
      <p class="hint" id="sched-line"></p>
      <p class="hint warn" id="dup-hint" hidden></p>
      <div class="actions"><button type="button" class="btn small" id="get-schedule">Get schedule from lead</button></div>
      <button type="button" class="btn primary start-match" id="start-match">Start match</button>
      <p class="hint">Tap <b>Start match</b> when the match starts. The screen shows only Auto, then switches to Teleop by itself.</p>
    </div>
    ${C.sections.map(s => {
      const counters = s.fields.filter(f => f.type === "counter").map(f => fieldHtml(byKey[s.id + "." + f.id])).join("");
      const rest = s.fields.filter(f => f.type !== "counter").map(f => fieldHtml(byKey[s.id + "." + f.id])).join("");
      return `<div class="card" data-phase="${phasesOf(s).join(" ")}"><h2 class="section-h">${esc(s.title)}</h2>${s.hint ? `<p class="hint">${esc(s.hint)}</p>` : ""}${counters ? `<div class="counters">${counters}</div>` : ""}${rest}</div>`;
    }).join("")}
    <p class="err" id="form-err" hidden></p>
    <div class="actions" id="form-actions">
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
    F.querySelectorAll("[data-spot]").forEach(b => b.setAttribute("aria-pressed", String(form.spot === +b.dataset.spot)));
    paintDupHint(); paintSchedLine();
  }

  // With a schedule loaded, the match number + spot decide the team.
  function applySchedule() {
    const row = schedule && schedule.event === event.code && form.spot != null && schedule.matches[String(+form.match.trim())];
    if (!row || !row[form.spot]) return;
    form.team = String(row[form.spot]);
    form.teamName = teamNames()[form.team] || "";
    nameTouched = false;
  }
  function paintSchedLine() {
    const has = !!(schedule && Object.keys(schedule.matches).length);
    $("#event-line").innerHTML = `Event: <b>${esc(event.name)}</b> <span>${esc(event.code)}</span>`;
    $("#get-schedule").textContent = has ? "Update schedule from lead" : "Get schedule from lead";
    const el = $("#sched-line"), m = form.match.trim();
    if (!has) { el.textContent = "No match schedule on this phone yet. Type the team number, or get the schedule from the lead."; return; }
    if (schedule.event !== event.code) { el.textContent = `The schedule on this phone is for ${schedule.event}, not ${event.code}. Get the new schedule from the lead.`; return; }
    const row = schedule.matches[String(+m)];
    if (!m) { el.textContent = `Schedule loaded: ${Object.keys(schedule.matches).length} matches. Enter the match number and pick your spot.`; return; }
    if (!row) { el.textContent = `Match ${m} isn't in the schedule. Type the team number.`; return; }
    el.innerHTML = `Match ${esc(m)}: <b class="red-t">Red ${esc(row[0])} &amp; ${esc(row[1])}</b> · <b class="blue-t">Blue ${esc(row[2])} &amp; ${esc(row[3])}</b>` +
      (form.spot == null ? " · pick your spot above" : "");
  }
  function paintDupHint() {
    const h = $("#dup-hint"), t = form.team.trim(), m = form.match.trim();
    const n = t && m ? Object.values(mine).filter(r => r.team === t && r.match === m && r.event === event.code).length : 0;
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
    if (k === "match") { const before = form.team; applySchedule(); if (form.team !== before) { $("#f-team").value = form.team; $("#f-teamName").value = form.teamName; } paintSchedLine(); }
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
    } else if (b.dataset.spot) {
      form.spot = +b.dataset.spot;
      applySchedule(); paintForm();
    } else if (b.id === "get-schedule") {
      scanReturn = true; show("lead"); showSub("scan"); startCamera();
      showResult("", "Scan the lead's schedule code", "The lead opens Lead → Schedule and shows the code under “Share with scouts”.");
      return;
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


  // ===================================================================
  //  MATCH MODE
  //  "Start match" runs a timer and shows only the sections for the current
  //  period: Auto, the transition, Teleop, then the after-match questions.
  // ===================================================================
  const MT = Object.assign({ auto: 30, transition: 8, teleop: 120, endgameAt: 0, endgameText: "" }, C.matchTiming || {});
  const PHASE_LABEL = { auto: "Auto", transition: "Transition", teleop: "Teleop", after: "Match over" };
  const bounds = { auto: 0, transition: MT.auto, teleop: MT.auto + MT.transition, after: MT.auto + MT.transition + MT.teleop };
  const ORDER = ["auto", "transition", "teleop", "after"];
  let mmTimer = null, mmPhase = null, mmCued = false, mmWake = null;
  const elapsed = () => (Date.now() - form.matchStart) / 1000;
  const phaseAt = t => t < bounds.transition ? "auto" : t < bounds.teleop ? "transition" : t < bounds.after ? "teleop" : "after";
  const clock = sec => { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
  function mmCards(phase) {
    const show = phase === "transition" ? "auto" : phase;
    F.querySelectorAll(".card[data-phase]").forEach(c => (c.hidden = !c.dataset.phase.split(" ").includes(show)));
    $("#head-card").hidden = true; $("#install-hint").hidden = true;
    $("#form-actions").hidden = phase !== "after";
  }
  function mmTick() {
    if (!form.matchStart) return;
    const t = elapsed(), phase = phaseAt(t);
    if (phase !== mmPhase) {
      const first = mmPhase === null; mmPhase = phase; mmCards(phase);
      if (!first) { try { navigator.vibrate && navigator.vibrate([80, 60, 80]); } catch {} beep(true); window.scrollTo({ top: 0, behavior: "smooth" }); }
      if (phase === "after") stopMatchTimer(false);
    }
    const bar = $("#match-bar"); bar.dataset.phase = phase;
    $("#mb-phase").textContent = PHASE_LABEL[phase];
    const left = phase === "after" ? 0 : bounds[ORDER[ORDER.indexOf(phase) + 1]] - t;
    $("#mb-clock").textContent = phase === "after" ? "Fill in the result" : phase === "transition" ? `Teleop in ${Math.ceil(left)}` : clock(left);
    const span = phase === "after" ? 1 : bounds[ORDER[ORDER.indexOf(phase) + 1]] - bounds[phase];
    $("#mb-progress").style.width = phase === "after" ? "100%" : `${Math.min(100, (t - bounds[phase]) / span * 100)}%`;
    const endgame = phase === "teleop" && MT.endgameAt && left <= MT.endgameAt;
    bar.classList.toggle("endgame", !!endgame);
    $("#mb-cue").hidden = !(endgame && MT.endgameText); $("#mb-cue").textContent = MT.endgameText;
    if (endgame && !mmCued) { mmCued = true; try { navigator.vibrate && navigator.vibrate(200); } catch {} beep(true); }
    $("#mb-back").disabled = phase === "auto";
    $("#mb-next").hidden = phase === "after";
  }
  function paintWho() {
    $("#mb-who").textContent = [form.match && `Match ${form.match}`, form.spot != null && SPOTS[form.spot], form.team].filter(Boolean).join(" · ");
  }
  async function startMatch() {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    form.matchStart = Date.now(); saveDraft();
    enterMatchMode();
    try { mmWake = await navigator.wakeLock.request("screen"); } catch {}
  }
  function enterMatchMode() {
    document.body.classList.add("match-mode");
    $("#match-bar").hidden = false; mmPhase = null; mmCued = elapsed() >= bounds.after - MT.endgameAt;
    paintWho(); mmTick(); window.scrollTo(0, 0);
    clearInterval(mmTimer); if (phaseAt(elapsed()) !== "after") mmTimer = setInterval(mmTick, 250);
  }
  function stopMatchTimer(release = true) {
    clearInterval(mmTimer); mmTimer = null;
    if (release) { try { mmWake && mmWake.release(); } catch {} mmWake = null; }
  }
  function exitMatchMode() {
    stopMatchTimer(); form.matchStart = null; saveDraft(); mmPhase = null;
    document.body.classList.remove("match-mode"); $("#match-bar").hidden = true;
    F.querySelectorAll(".card").forEach(c => (c.hidden = false)); $("#form-actions").hidden = false;
    if (installText) $("#install-hint").hidden = false;
  }
  // Back / Next jump the timer to the start of the previous or next period.
  function jumpPhase(dir) {
    const i = ORDER.indexOf(phaseAt(elapsed())) + dir; if (i < 0 || i >= ORDER.length) return;
    form.matchStart = Date.now() - bounds[ORDER[i]] * 1000 - 50; saveDraft();
    if (ORDER[i] !== "after" && !mmTimer) mmTimer = setInterval(mmTick, 250);
    mmCued = false; mmTick();
  }
  $("#start-match").addEventListener("click", startMatch);
  $("#mb-exit").addEventListener("click", exitMatchMode);
  $("#mb-back").addEventListener("click", () => jumpPhase(-1));
  $("#mb-next").addEventListener("click", () => jumpPhase(1));

  F.addEventListener("submit", e => {
    e.preventDefault();
    const err = $("#form-err");
    const team = form.team.trim(), match = form.match.trim(), scouter = form.scouter.trim();
    const missing = [form.spot == null && "alliance position", !team && "team number", !match && "match number", !scouter && "your name"].filter(Boolean);
    if (missing.length) {
      if (document.body.classList.contains("match-mode")) exitMatchMode(); // show the top of the form to fix it
      err.hidden = false; err.textContent = `Add ${missing.join(", ")} before saving.`;
      if (form.spot == null) $("#spot-row").scrollIntoView({ block: "center" });
      else document.getElementById(!team ? "f-team" : !match ? "f-match" : "f-scouter").focus();
      return;
    }
    err.hidden = true;
    const r = { id: newId(), team, match, scouter, teamName: form.teamName.trim(), at: Date.now(), spot: form.spot, event: event.code, v: JSON.parse(JSON.stringify(form.v)), sent: leadUnlocked };
    for (const f of FIELDS) if (f.type === "text") r.v[f.key] = (r.v[f.key] || "").trim();
    mine[r.id] = r;
    if (!store.set("mine", mine)) { delete mine[r.id]; return; }
    toast(leadUnlocked ? `Saved: team ${team}, match ${match}. It's already in your lead results.` : `Saved: team ${team}, match ${match}. Hand off when the lead asks.`);
    const next = blankForm(); next.match = /^\d+$/.test(match) ? String(+match + 1) : match;
    next.spot = form.spot;
    if (document.body.classList.contains("match-mode")) exitMatchMode();
    form = next; nameTouched = false; applySchedule(); store.set("draft", form);
    paintForm(); window.scrollTo({ top: 0, behavior: "smooth" });
    renderChrome();
  });

  // ===================================================================
  //  QR ENCODING
  //  A code holds: "BBS1|<season>|<field fingerprint>|" + JSON rows.
  //  Each row: [id, team, match, scout, team name, time(sec), spot, event, ...field values in config order]
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
  const toRow = r => [r.id, r.team, r.match, r.scouter, r.teamName || "", Math.round(r.at / 1000), r.spot ?? null, r.event || "", ...FIELDS.map(f => encodeValue(f, r.v[f.key]))];
  function fromRow(row) {
    if (!Array.isArray(row) || row.length !== 8 + FIELDS.length) throw new Error("bad row");
    const [id, team, match, scouter, teamName, sec, spot, ev] = row;
    const v = {}; FIELDS.forEach((f, i) => (v[f.key] = decodeValue(f, row[8 + i])));
    return { id: String(id), team: String(team), match: String(match), scouter: String(scouter), teamName: String(teamName || ""), at: sec * 1000,
      spot: spot == null || !SPOTS[spot] ? null : +spot, event: String(ev || ""), v };
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
        <ul class="list">${list.filter(r => code.ids.includes(r.id)).map(r => `<li><span>Match ${esc(r.match)} · ${r.spot != null ? esc(SPOTS[r.spot]) + " · " : ""}Team ${esc(r.team)}</span><span>${r.sent ? "handed off before" : esc(ago(r.at))}</span></li>`).join("")}</ul>
        ${showAll ? "" : `<button type="button" class="btn primary" id="mark-sent">Lead scanned it</button>`}
      </div>` : leadUnlocked
        ? `<div class="banner good"><strong>Nothing to hand off on the lead's phone</strong>Reports you scout here go straight into your Matches and Robots results.</div>`
        : `<div class="banner good"><strong>All caught up</strong>Every report on this phone has been handed off.</div>`}
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
    if (text.startsWith("BBSCH1|")) return importScheduleCode(text);
    if (text.startsWith("BBT1|") && leadUnlocked) return importTransferCode(text);
    if (!leadUnlocked) { beep(false); showResult("bad", "That's a scout's report code", "Only the lead's phone collects reports. Scan the schedule code on the lead's Schedule screen."); return; }
    const res = parseCode(text);
    if (res.error) { beep(false); showResult("bad", "Not added", res.error); return; }
    const { added, dup } = addToLead(res.reports);
    beep(true);
    const vf = $("#viewfinder"); vf.classList.add("hit"); setTimeout(() => vf.classList.remove("hit"), 600);
    const who = [...new Set(res.reports.map(r => r.scouter))].join(", ");
    const what = res.reports.map(r => `M${r.match}·${r.team}`).join(", ");
    showResult(added ? "good" : "", added ? `Added ${added} new report${added > 1 ? "s" : ""} from ${who}` : `Already have these from ${who}`,
      `${what}${dup && added ? ` (${dup} already had)` : ""}`);
    if (added) backupNag();
    renderChrome();
  }
  function addToLead(reports, quiet) {
    let added = 0, dup = 0;
    for (const r of reports) {
      if (lead[r.id] || removed[r.id]) { dup++; continue; }
      lead[r.id] = r; added++;
      if (quiet) continue; // copied from another lead phone: not a scout hand-off
      const s = seen[r.scouter] || { at: 0, matches: [], count: 0 };
      s.at = Date.now(); s.count++; if (!s.matches.includes(r.match)) s.matches.push(r.match);
      seen[r.scouter] = s;
    }
    store.set("lead", lead); store.set("seen", seen);
    if (added) { sinceBackup += added; store.set("sinceBackup", sinceBackup); }
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

  // ===================================================================
  //  EVENT + MATCH SCHEDULE
  //  The lead picks an event (FTCScout list, or a typed code), downloads its
  //  teams and qualification schedule, then shares it by QR:
  //  "BBSCH1|<season>|<event>|<version>|<part>/<parts>|" + JSON rows. A row is
  //  [match, red1, red2, blue1, blue2], ["n", team, name] for a team name the
  //  built-in list lacks, or ["e", event name]. Parts can be scanned in any order.
  // ===================================================================
  let scanReturn = false, schedIdx = 0, eventList = null, showPast = false;
  const FTCSCOUT = "https://api.ftcscout.org";

  function setSchedule(code, rows, names) {
    schedule = { event: code, eventName: event.code === code ? event.name : code, ver: Date.now().toString(36), matches: rows, names: names || {}, parts: null };
    store.set("schedule", schedule);
    schedIdx = 0; applySchedule(); paintForm(); renderChrome();
  }
  function scheduleCodes() {
    const builtIn = window.SCOUT_TEAMS || {};
    const rows = [
      ["e", schedule.eventName || schedule.event],
      ...Object.entries(schedule.matches).sort((a, b) => +a[0] - +b[0]).map(([m, t]) => [+m, ...t]),
      ...Object.entries(schedule.names || {}).filter(([t, n]) => builtIn[t] !== n).map(([t, n]) => ["n", +t, n]),
    ];
    const chunks = []; let cur = [];
    const head = (k, n) => `BBSCH1|${C.season}|${schedule.event}|${schedule.ver}|${k}/${n}|`;
    for (const r of rows) {
      if (cur.length && (head(99, 99) + JSON.stringify([...cur, r])).length > MAX_CODE_CHARS) { chunks.push(cur); cur = []; }
      cur.push(r);
    }
    if (cur.length) chunks.push(cur);
    return chunks.map((c, i) => head(i + 1, chunks.length) + JSON.stringify(c));
  }
  function importScheduleCode(text) {
    const p = text.split("|");
    if (p[1] !== C.season) { beep(false); showResult("bad", "Not loaded", `That schedule is for a different season (${p[1]}).`); return; }
    const [k, n] = p[4].split("/").map(Number);
    let rows;
    try { rows = JSON.parse(p.slice(5).join("|")); } catch { beep(false); showResult("bad", "Couldn't read that code", "Try again, holding steady."); return; }
    if (!schedule || schedule.ver !== p[3]) schedule = { event: p[2], eventName: p[2], ver: p[3], matches: {}, names: {}, parts: { n, got: [] } };
    schedule.parts = schedule.parts || { n, got: [] };
    schedule.names = schedule.names || {};
    for (const r of rows) {
      if (r[0] === "e") schedule.eventName = String(r[1]);
      else if (r[0] === "n") schedule.names[String(r[1])] = String(r[2]);
      else { const [m, ...t] = r; schedule.matches[String(m)] = t; }
    }
    if (!schedule.parts.got.includes(k)) schedule.parts.got.push(k);
    store.set("schedule", schedule);
    if (event.code !== schedule.event || event.name !== schedule.eventName) setEvent({ code: schedule.event, name: schedule.eventName });
    beep(true);
    const done = schedule.parts.got.length >= n, count = Object.keys(schedule.matches).length;
    if (done) {
      showResult("good", `Schedule loaded: ${count} matches`, `${schedule.eventName}. Pick your alliance position on the Scout tab and the team fills in.`);
      applySchedule(); paintForm();
      if (scanReturn) { scanReturn = false; stopCamera(); show("scout"); toast(`Schedule loaded: ${count} matches`); }
    } else {
      const missing = Array.from({ length: n }, (_, i) => i + 1).filter(i => !schedule.parts.got.includes(i));
      showResult("warn", `Got part ${k} of ${n}`, `Now scan part ${missing.join(" and ")}.`);
    }
    renderChrome();
  }

  function parseScheduleText(text) {
    const rows = {}, skipped = [];
    for (const raw of text.split(/\r?\n/)) {
      if (!raw.trim()) continue;
      const line = raw.replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*([AaPp]\.?[Mm]\.?)?/g, " ").replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, " ");
      const nums = line.match(/\d+/g) || [];
      const match = nums.shift();
      const teams = [];
      for (const x of nums) if (x.length >= 3 && teams[teams.length - 1] !== +x) teams.push(+x);
      if (!match || teams.length < 4) { skipped.push(raw.trim()); continue; }
      rows[String(+match)] = teams.slice(0, 4);
    }
    return { rows, skipped };
  }

  // ---------- finding an event ----------
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const prettyDate = d => d ? new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  const TYPE_NAMES = { Qualifier: "Qualifier", LeagueMeet: "League meet", LeagueTournament: "League tournament", Championship: "Championship", Kickoff: "Kickoff", Scrimmage: "Scrimmage", OffSeason: "Off-season", NonAdvancement: "Event" };
  async function loadEventList() {
    const box = $("#event-list");
    box.innerHTML = `<p class="hint">Loading events from FTCScout…</p>`;
    try {
      const res = await fetch(`${FTCSCOUT}/rest/v1/events/search/${C.ftcSeason}?region=${encodeURIComponent(C.region)}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      eventList = (await res.json()).filter(e => !e.remote).sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
      renderEventList();
    } catch {
      box.innerHTML = `<div class="banner bad"><strong>Couldn't load the event list</strong>This needs internet. You can still type an event code below.</div>`;
    }
  }
  function renderEventList() {
    const box = $("#event-list"); if (!eventList) return;
    const q = $("#event-search").value.trim().toLowerCase(), t = today();
    const list = eventList.filter(e => (showPast || e.end >= t) && (!q || (e.name + " " + e.city + " " + e.code).toLowerCase().includes(q)));
    box.innerHTML = list.length ? `<ul class="event-pick">${list.slice(0, 60).map(e => `
      <li><button type="button" data-ev="${esc(e.code)}" aria-pressed="${e.code === event.code}">
        <b>${esc(e.name)}</b><span>${esc(prettyDate(e.start))}${e.end !== e.start ? "–" + esc(prettyDate(e.end)) : ""} · ${esc(e.city)} · ${esc(TYPE_NAMES[e.type] || e.type)} · ${esc(e.code)}</span>
      </button></li>`).join("")}</ul>`
      : `<p class="hint">No ${showPast ? "" : "upcoming "}events match. ${showPast ? "" : "Tick “Show past events” to look further back."}</p>`;
  }
  async function pickEvent(code, name, start) {
    setEvent({ code, name, start });
    $("#event-code").value = code;
    paintForm(); renderChrome();
    await downloadEvent();
  }

  // Downloads the event's team names, and its schedule once it's posted.
  async function downloadEvent() {
    const code = event.code, msg = $("#sched-msg"), btn = $("#sched-download");
    btn.disabled = true; btn.textContent = "Downloading…";
    let teamCount = 0, matchCount = 0, note = "";
    try {
      const gq = await fetch(`${FTCSCOUT}/graphql`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `query($s:Int!,$c:String!){ eventByCode(season:$s, code:$c){ name start teams { teamNumber team { name } } } }`, variables: { s: C.ftcSeason, c: code } }),
      });
      const ev = gq.ok ? ((await gq.json()).data || {}).eventByCode : null;
      if (!ev) throw new Error(`FTCScout doesn't know event ${code} in the ${C.ftcSeason} season. Check the code.`);
      if (ev.name && ev.name !== event.name) setEvent({ code, name: ev.name, start: ev.start });
      const names = {};
      for (const t of ev.teams || []) if (t.team && t.team.name) names[String(t.teamNumber)] = t.team.name.replace(/\s+/g, " ").trim();
      teamCount = (ev.teams || []).length;
      eventTeams = { code, names, numbers: (ev.teams || []).map(t => t.teamNumber) };
      store.set("eventTeams", eventTeams);

      const res = await fetch(`${FTCSCOUT}/rest/v1/events/${C.ftcSeason}/${encodeURIComponent(code)}/matches`, { cache: "no-store" });
      const rows = {};
      if (res.ok) for (const m of await res.json()) {
        if (m.tournamentLevel !== "Quals") continue;
        const at = (a, s) => ((m.teams || []).find(x => x.alliance === a && x.station === s) || {}).teamNumber;
        const t = [at("Red", "One"), at("Red", "Two"), at("Blue", "One"), at("Blue", "Two")];
        if (t.every(Boolean)) rows[String(m.id)] = t;
      }
      matchCount = Object.keys(rows).length;
      if (matchCount) setSchedule(code, rows, names);
      else note = "The match schedule isn't posted on FTCScout yet. It usually appears the morning of the event, shortly after it's published. Tap Download again then, or type it in below.";
      msg.innerHTML = `<div class="banner ${matchCount ? "good" : "warn"}"><strong>${esc(event.name)}: ${teamCount} teams${matchCount ? `, ${matchCount} qualification matches` : ""}</strong>${matchCount ? "Check a few matches against the printed schedule, then share it with scouts below." : esc(note)}</div>`;
    } catch (e) {
      const offline = e instanceof TypeError;
      msg.innerHTML = `<div class="banner bad"><strong>Couldn't download from FTCScout</strong>${esc(offline ? "No internet connection right now. Find a signal and try again, or type the schedule in below." : e.message)}</div>`;
    } finally { btn.disabled = false; btn.textContent = "Download teams + schedule"; paintForm(); renderChrome(); }
  }

  function renderSchedule() {
    $("#event-now").innerHTML = `<b>${esc(event.name)}</b><span>${esc(event.code)}${event.start ? " · " + esc(prettyDate(event.start)) : ""}${eventTeams.code === event.code && eventTeams.numbers ? ` · ${eventTeams.numbers.length} teams downloaded` : ""}</span>`;
    if ($("#event-code").value.trim().toUpperCase() !== event.code && document.activeElement !== $("#event-code")) $("#event-code").value = event.code;
    const has = !!(schedule && schedule.event === event.code && Object.keys(schedule.matches).length);
    $("#sched-share").hidden = !has; $("#sched-current").hidden = !has;
    if (!has) return;
    const codes = scheduleCodes();
    schedIdx = Math.min(schedIdx, codes.length - 1);
    const partial = schedule.parts && schedule.parts.got.length < schedule.parts.n;
    $("#sched-qr").innerHTML = `
      <div class="qr-nav">
        <button type="button" class="btn small" data-sq="-1" ${schedIdx === 0 ? "disabled" : ""}>‹ Prev</button>
        <strong>${codes.length > 1 ? `Part ${schedIdx + 1} of ${codes.length}` : "Schedule code"}</strong>
        <button type="button" class="btn small" data-sq="1" ${schedIdx >= codes.length - 1 ? "disabled" : ""}>Next ›</button>
      </div>
      <div class="qr-box" role="img" aria-label="Schedule QR code part ${schedIdx + 1}">${qrSvg(codes[schedIdx])}</div>
      ${codes.length > 1 ? `<p class="hint">Scouts need every part. Tap Next after each beep.</p>` : ""}`;
    const names = teamNames();
    const ms = Object.keys(schedule.matches).sort((a, b) => +a - +b);
    $("#sched-title").textContent = `${ms.length} matches`;
    $("#sched-table").innerHTML = `${partial ? `<p class="hint warn">Only part of the schedule has been scanned. Scan the remaining parts from the lead.</p>` : ""}
      <div class="scroll"><table class="mini"><thead><tr><th>Match</th>${SPOTS.map((s, i) => `<th class="${i < 2 ? "red-t" : "blue-t"}">${s}</th>`).join("")}</tr></thead>
      <tbody>${ms.map(m => `<tr><td>${esc(m)}</td>${schedule.matches[m].map(t => `<td title="${esc(names[t] || "")}">${esc(t)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  $("#event-code").value = event.code;
  $("#find-event").addEventListener("click", () => { $("#event-finder").hidden = false; $("#find-event").hidden = true; loadEventList(); });
  $("#event-search").addEventListener("input", renderEventList);
  $("#show-past").addEventListener("change", e => { showPast = e.target.checked; renderEventList(); });
  $("#event-list").addEventListener("click", e => {
    const b = e.target.closest("[data-ev]"); if (!b) return;
    const ev = eventList.find(x => x.code === b.dataset.ev);
    $("#event-finder").hidden = true; $("#find-event").hidden = false;
    pickEvent(ev.code, ev.name, ev.start);
  });
  $("#use-code").addEventListener("click", () => {
    const code = $("#event-code").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,16}$/.test(code)) { $("#sched-msg").innerHTML = `<div class="banner bad"><strong>Check the event code</strong>It's the end of the event's address on ftc-events.firstinspires.org, like USMICOQ.</div>`; return; }
    pickEvent(code, code === event.code ? event.name : code);
  });
  $("#sched-download").addEventListener("click", downloadEvent);
  $("#sched-paste").addEventListener("click", () => {
    const { rows, skipped } = parseScheduleText($("#sched-text").value);
    const n = Object.keys(rows).length, msg = $("#sched-paste-msg");
    if (!n) { msg.innerHTML = `<div class="banner bad"><strong>No matches found</strong>Each line needs a match number followed by four team numbers.</div>`; return; }
    setSchedule(event.code, rows, eventTeams.code === event.code ? eventTeams.names : {});
    msg.innerHTML = `<div class="banner ${skipped.length ? "warn" : "good"}"><strong>Loaded ${n} matches for ${esc(event.name)}</strong>${skipped.length ? `Skipped ${skipped.length} line${skipped.length > 1 ? "s" : ""} without a match and four teams: ${esc(skipped.slice(0, 3).join(" | "))}${skipped.length > 3 ? " …" : ""}` : "Check the table below against the printed schedule."}</div>`;
  });
  $("#sched-qr").addEventListener("click", e => { const b = e.target.closest("[data-sq]"); if (b) { schedIdx += +b.dataset.sq; renderSchedule(); } });
  $("#sched-clear").addEventListener("click", e => {
    const b = e.currentTarget;
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again"; setTimeout(() => { delete b.dataset.armed; b.textContent = "Clear"; }, 3000); return; }
    delete b.dataset.armed; b.textContent = "Clear";
    schedule = null; store.set("schedule", null); paintForm(); renderChrome();
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
  function allLeadReports() {
    const out = {};
    for (const r of Object.values(mine)) out[r.id] = r;  // a lead who also scouts counts their own reports
    for (const r of Object.values(lead)) out[r.id] = r;
    for (const id of Object.keys(removed)) delete out[id];
    return Object.values(out);
  }
  // The lead's screens show the current event unless "All events" is picked.
  const leadReports = () => allLeadReports().filter(r => tools.allEvents || (r.event || "") === event.code);
  function vote(vals) {
    vals = vals.filter(v => v != null);
    if (!vals.length) return { v: null, disagree: false };
    const c = new Map(); vals.forEach(v => c.set(v, (c.get(v) || 0) + 1));
    const s = [...c.entries()].sort((a, b) => b[1] - a[1]);
    return { v: s.length > 1 && s[0][1] === s[1][1] ? "split" : s[0][0], disagree: c.size > 1 };
  }
  // Ranking points one merged entry earned, from options in config.js that carry "rp".
  function entryRp(e) {
    let rp = 0, known = false;
    for (const f of RP_FIELDS) {
      if (f.type === "choice") { const o = f.options.find(o => o.id === e.v[f.key]); if (o) { known = true; rp += o.rp || 0; } }
      if (f.type === "checks") { known = true; for (const o of f.options) if ((e.v[f.key][o.id] || 0) >= 0.5) rp += o.rp || 0; }
    }
    return known ? rp : null;
  }
  // One merged entry per team per match (per event).
  function mergeEntry(reps) {
    const e = { team: reps[0].team, match: reps[0].match, event: reps[0].event || "", n: reps.length, reports: reps, flags: [], v: {} };
    e.matchKey = tools.allEvents ? `${e.event || "?"} · ${e.match}` : e.match;
    const spot = vote(reps.map(r => r.spot));
    e.spot = typeof spot.v === "number" ? spot.v : null;
    if (spot.disagree && reps.length > 1) e.flags.push("Alliance position disagrees");
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
        if (mixed && reps.length > 1 && !f.tags) e.flags.push(`${f.short || f.label} disagrees`);
      }
    }
    e.total = SCORED.reduce((s, f) => s + e.v[f.key], 0);
    e.missed = MISSES.reduce((s, f) => s + e.v[f.key], 0);
    e.rp = entryRp(e);
    return e;
  }
  // Accuracy = scored ÷ (scored + missed), over the given entries, for one section or all.
  function accuracy(es, section) {
    const inS = f => !section || f.section === section;
    const s = es.reduce((t, e) => t + SCORED.filter(inS).reduce((a, f) => a + e.v[f.key], 0), 0);
    const m = es.reduce((t, e) => t + MISSES.filter(inS).reduce((a, f) => a + e.v[f.key], 0), 0);
    return s + m ? s / (s + m) : null;
  }
  function consolidate() {
    const reps = leadReports(), names = teamNames(), groups = new Map();
    for (const r of reps) { const k = `${r.event || ""}|${r.team}|${r.match}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    const entries = [...groups.values()].map(mergeEntry);
    const byMatch = new Map(), byTeam = new Map();
    for (const e of entries) {
      if (!byMatch.has(e.matchKey)) byMatch.set(e.matchKey, []); byMatch.get(e.matchKey).push(e);
      if (!byTeam.has(e.team)) byTeam.set(e.team, []); byTeam.get(e.team).push(e);
    }
    const robots = [...byTeam.entries()].map(([team, es]) => {
      es.sort((a, b) => natural(a.matchKey, b.matchKey));
      const r = { team, teamName: names[team] || "", entries: es, matches: es.length, avg: {}, rate: {}, counts: {}, acc: {}, flags: es.reduce((s, e) => s + e.flags.length, 0) };
      for (const f of FIELDS) {
        if (f.type === "counter") r.avg[f.key] = mean(es.map(e => e.v[f.key]));
        if (f.type === "yesno") { const b = es.map(e => e.v[f.key]).filter(x => x === true || x === false); r.rate[f.key] = b.length ? b.filter(Boolean).length / b.length : null; }
        if (f.type === "choice") { r.counts[f.key] = {}; for (const o of f.options) r.counts[f.key][o.id] = es.filter(e => e.v[f.key] === o.id).length; }
        if (f.type === "checks") { r.rate[f.key] = {}; for (const o of f.options) r.rate[f.key][o.id] = mean(es.map(e => e.v[f.key][o.id])); }
        if (f.tags) { r.tagged = r.tagged || {}; r.tagged[f.key] = {}; for (const o of f.options) r.tagged[f.key][o.id] = es.filter(e => e.v[f.key][o.id] > 0).length; }
      }
      r.avgTotal = mean(es.map(e => e.total)); r.best = Math.max(...es.map(e => e.total));
      for (const s of ACC_SECTIONS) r.acc[s.id] = accuracy(es, s);
      r.accAll = accuracy(es);
      const rps = es.map(e => e.rp).filter(x => x != null); r.avgRp = rps.length ? mean(rps) : null;
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
    const head = `<tr><th>Team</th><th>Total</th>${RP_FIELDS.length ? "<th>RP</th>" : ""}${COUNTERS.map(f => `<th><span class="grp">${esc(f.section.short)}</span>${esc(f.label)}</th>`).join("")}${OTHER.filter(f => !f.tags).map(f => `<th><span class="grp">${esc(f.section.short)}</span>${esc(f.short || f.label)}</th>`).join("")}<th>Scouts</th></tr>`;
    // With a schedule, also list scheduled matches up to the latest one scouted, so gaps show.
    const keys = new Set(c.byMatch.keys());
    const sched = !tools.allEvents && schedule && schedule.event === event.code ? schedule : null;
    if (sched) {
      const latest = Math.max(...[...keys].map(Number).filter(n => !isNaN(n)), 0);
      for (const m of Object.keys(sched.matches)) if (+m <= latest) keys.add(m);
    }
    $("#match-check").setAttribute("aria-pressed", String(tools.matchCheck));
    const cards = [...keys].sort(natural).reverse().map(m => {
      const es = (c.byMatch.get(m) || []).sort((a, b) => b.total - a.total), flags = es.reduce((s, e) => s + e.flags.length, 0);
      const row = sched && sched.matches[String(+m)];
      const om = !tools.allEvents && official[event.code] && official[event.code].matches[String(+m)];
      const offLine = om ? `<p class="official-line">Official: <b class="red-t">Red ${om.red.total}</b> · <b class="blue-t">Blue ${om.blue.total}</b>${es.map(e => e.reports.map(r => checkReport(r, official[event.code])).filter(k => k && k.result && !k.result.ok).map(k => ` · <span class="pill warn">${esc(e.team)}: scouted ${esc(k.result.scouted)}, was ${esc(k.result.actual)}</span>`).join("")).join("")}</p>` : "";
      const spotOf = e => { const i = row ? row.findIndex(x => String(x) === String(e.team)) : -1; return i >= 0 ? i : e.spot ?? -1; };
      const missing = row ? row.map((t, i) => [t, i]).filter(([t]) => !es.some(e => e.team === String(t))) : [];
      if (tools.matchCheck && !flags && !missing.length) return "";
      return `<article class="match" id="match-${esc(m)}">
        <div class="match-h"><h3>Match ${esc(m)}</h3><span>${es.length}${row ? " of 4" : ""} robot${es.length === 1 && !row ? "" : "s"} ${flags ? `<span class="pill warn">${flags} to check</span>` : ""}${missing.length ? ` <span class="pill bad">${missing.length} not scouted</span>` : ""}</span></div>
        ${es.length ? `<div class="scroll"><table><thead>${head}</thead><tbody>${es.map(e => `
          <tr><td class="team">${spotOf(e) >= 0 ? `<span class="spot-tag ${spotOf(e) < 2 ? "red" : "blue"}">${SPOTS[spotOf(e)]}</span> ` : ""}${esc(e.team)}${e.flags.length ? ' <span class="pill warn">!</span>' : ""}<small>${esc(c.names[e.team] || "")}</small></td>
            <td class="tot">${fmt(e.total)}</td>
            ${RP_FIELDS.length ? `<td>${fmt(e.rp)}</td>` : ""}
            ${COUNTERS.map(f => `<td>${counterCell(f, e.v[f.key])}</td>`).join("")}
            ${OTHER.filter(f => !f.tags).map(f => `<td>${f.type === "yesno" ? yn(e.v[f.key]) : f.type === "choice" ? choicePill(f, e.v[f.key]) : f.options.filter(o => e.v[f.key][o.id] >= 0.5).map(o => esc(o.short || o.label)).join(", ") || "–"}</td>`).join("")}
            <td>${e.n}</td></tr>`).join("")}
        </tbody></table></div>` : ""}
        ${es.filter(e => e.flags.length).map(e => `<p class="flag">Team ${esc(e.team)}: ${e.flags.map(esc).join(" · ")} (${e.reports.map(r => esc(r.scouter)).join(", ")})</p>`).join("")}
        ${offLine}
        ${missing.length ? `<p class="missing">Not scouted: ${missing.map(([t, i]) => `${SPOTS[i]} ${esc(t)}${c.names[t] ? ` ${esc(c.names[t])}` : ""}`).join(" · ")}</p>` : ""}
        </article>`;
    }).join("");
    el.innerHTML = cards ? `<div class="matches">${cards}</div>`
      : `<div class="empty"><strong>Nothing to check</strong>No disagreements or unscouted robots so far. Tap “Only matches to check” again to see every match.</div>`;
  }
  $("#match-check").addEventListener("click", () => { tools.matchCheck = !tools.matchCheck; saveTools(); renderLead(); });
  $("#match-jump").addEventListener("change", e => {
    const m = String(+e.target.value.trim() || e.target.value.trim()); if (!m) return;
    if (tools.matchCheck && !document.getElementById("match-" + m)) { tools.matchCheck = false; saveTools(); renderLead(); }
    const card = document.getElementById("match-" + m);
    if (!card) { toast(`Match ${m} hasn't been scouted yet.`); return; }
    document.querySelectorAll(".match.target").forEach(x => x.classList.remove("target"));
    card.classList.add("target");
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    e.target.blur();
  });

  // ---------- robots ----------
  // Sort and filter choices are per-device conveniences, remembered between visits.
  const tools = Object.assign({ sortKey: "avgTotal", sortDir: -1, filters: [], find: "", matchCheck: false, allEvents: false }, store.get("tools", {}));
  let { sortKey, sortDir } = tools, openTeam = null;
  const saveTools = () => { Object.assign(tools, { sortKey, sortDir }); store.set("tools", tools); };
  function robotColumns() {
    const cols = [
      { id: "team", label: "Team", sortLabel: "Team number", sort: r => r.team, html: r => { const t = tierOf(r.team); return `<button type="button" class="star ${t ? "on" : ""}" data-star="${esc(r.team)}" aria-label="${t ? "On pick list" : "Star"} ${esc(r.team)}">${t ? "★" : "☆"}</button>${esc(r.team)}${r.flags ? ' <span class="pill warn" title="Scouts disagreed somewhere">!</span>' : ""} ${t && t !== "star" ? tierTag(t) : ""}<small>${esc(r.teamName)}</small>`; }, cls: "team" },
      ...(official[event.code] && Object.keys(official[event.code].teams).length && !tools.allEvents ? [{ id: "offRank", label: "Rank", group: "official", sortLabel: "Official rank", sort: r => { const o = official[event.code].teams[r.team]; return o ? -o.rank : null; }, html: r => { const o = official[event.code].teams[r.team]; return o ? `#${o.rank}` : "–"; } }] : []),
      { id: "avgTotal", group: "avg", label: "Total", sortLabel: "Total pieces (average)", sort: r => r.avgTotal, html: r => fmt(r.avgTotal), cls: "tot" },
      { id: "best", label: "Best", sortLabel: "Best single match", sort: r => r.best, html: r => fmt(r.best) },
      { id: "matches", label: "Matches", sortLabel: "Matches scouted", sort: r => r.matches, html: r => r.matches },
      ...(RP_FIELDS.length ? [{ id: "avgRp", group: "avg", label: "RP", sortLabel: "Ranking points (average)", sort: r => r.avgRp, html: r => fmt(r.avgRp) }] : []),
      ...(MISSES.length ? [{ id: "accAll", label: "Accuracy", sortLabel: "Accuracy (all shots)", sort: r => r.accAll, html: r => bar(r.accAll) }] : []),
      ...ACC_SECTIONS.map(s => ({ id: "acc." + s.id, group: s.short, label: "Accuracy", sortLabel: `${s.short} accuracy`, sort: r => r.acc[s.id], html: r => bar(r.acc[s.id]) })),
      ...COUNTERS.map(f => ({ id: f.key, group: f.section.short + " avg", label: f.label, sortLabel: `${f.section.short} ${f.label.toLowerCase()} (average)`, sort: r => r.avg[f.key], html: r => counterCell(f, r.avg[f.key]) })),
    ];
    for (const f of OTHER) {
      if (f.type === "yesno") cols.push({ id: f.key, group: f.section.short, label: f.short || f.label, sortLabel: `${f.short || f.label} (how often)`, sort: r => r.rate[f.key], html: r => bar(r.rate[f.key]) });
      if (f.type === "choice") cols.push({ id: f.key, group: f.section.short, label: f.short || f.label, sortLabel: `${f.short || f.label}: most “${f.options[0].label}”`,
        sort: r => r.counts[f.key][f.options[0].id] / r.matches,
        html: r => f.options.filter(o => r.counts[f.key][o.id]).map(o => `<span class="pill ${o.tone || ""}">${esc(o.short || o.label)} ${r.counts[f.key][o.id]}</span>`).join(" ") || "–" });
      if (f.tags) { cols.push({ id: f.key, label: f.short || f.label, sortLabel: `${f.short || f.label} (most tagged)`,
        sort: r => f.options.reduce((s, o) => s + r.tagged[f.key][o.id], 0),
        html: r => f.options.filter(o => r.tagged[f.key][o.id]).map(o => `<span class="pill ${o.tone || ""}">${esc(o.short || o.label)} ${r.tagged[f.key][o.id]}/${r.matches}</span>`).join(" ") || "–" }); continue; }
      if (f.type === "checks") cols.push({ id: f.key, group: f.section.short, label: f.short || f.label, sortLabel: `${f.short || f.label} earned`,
        sort: r => f.options.reduce((s, o) => s + (r.rate[f.key][o.id] || 0), 0),
        html: r => f.options.filter(o => r.rate[f.key][o.id] > 0).map(o => `${esc(o.short || o.label)} ${pct(r.rate[f.key][o.id])}`).join(" · ") || "–" });
    }
    return cols;
  }
  // Quick filters, built from config: yes/no questions, and choices with a "good" option.
  const FILTERS = [
    ...FIELDS.filter(f => f.type === "yesno").map(f => ({ id: f.key, label: f.short || f.label, test: r => r.rate[f.key] != null && r.rate[f.key] >= 0.5 })),
    ...FIELDS.filter(f => f.type === "choice" && f.options.some(o => o.tone === "good")).map(f => {
      const o = f.options.find(o => o.tone === "good");
      return { id: f.key, label: `${f.short || f.label}: ${o.label.replace(/\s*\(.*\)$/, "")}`, test: r => r.counts[f.key][o.id] / r.matches >= 0.5 };
    }),
    { id: "twoPlus", label: "Scouted 2+ matches", test: r => r.matches >= 2 },
    // Quick-note tags count if any scout tapped them in any match.
    ...FIELDS.filter(f => f.tags).flatMap(f => f.options.map(o => ({ id: f.key + ":" + o.id, label: o.label, tag: o.tone || "plain", test: r => r.tagged[f.key][o.id] > 0 }))),
  ];
  tools.filters = tools.filters.filter(id => FILTERS.some(f => f.id === id));
  function paintRobotTools() {
    $("#robot-sort").innerHTML = robotColumns().map(col => `<option value="${esc(col.id)}" ${col.id === sortKey ? "selected" : ""}>${esc(col.sortLabel)}</option>`).join("");
    $("#robot-dir").textContent = sortDir < 0 ? "High → low" : "Low → high";
    const chip = f => `<button type="button" class="chip${f.tag ? " tag " + f.tag : ""}" data-filter="${esc(f.id)}" aria-pressed="${tools.filters.includes(f.id)}">${esc(f.label)}</button>`;
    $("#robot-filters").innerHTML = FILTERS.filter(f => !f.tag).map(chip).join("");
    $("#tag-filters").innerHTML = FILTERS.filter(f => f.tag).map(chip).join("");
    $("#tag-filter-row").hidden = !FILTERS.some(f => f.tag);
    if ($("#robot-find").value !== tools.find) $("#robot-find").value = tools.find;
  }
  $("#robot-sort").addEventListener("change", e => { sortKey = e.target.value; sortDir = sortKey === "team" ? 1 : -1; saveTools(); renderLead(); });
  $("#robot-dir").addEventListener("click", () => { sortDir = -sortDir; saveTools(); renderLead(); });
  const toggleFilter = e => {
    const b = e.target.closest("[data-filter]"); if (!b) return;
    const id = b.dataset.filter;
    tools.filters = tools.filters.includes(id) ? tools.filters.filter(x => x !== id) : [...tools.filters, id];
    saveTools(); renderLead();
  };
  $("#robot-filters").addEventListener("click", toggleFilter);
  $("#tag-filters").addEventListener("click", toggleFilter);
  $("#robot-find").addEventListener("input", e => { tools.find = e.target.value; saveTools(); renderRobots(consolidate(), true); });

  function renderRobots(c, keepTools) {
    const el = $("#robots");
    if (!keepTools) paintRobotTools();
    $("#robot-tools").hidden = !c.robots.length;
    if (!c.robots.length) { el.innerHTML = `<div class="empty"><strong>No robots yet</strong>Once you've scanned some phones, each team gets a row with its averages, reliability and notes.</div>`; return; }
    const cols = robotColumns(), sc = cols.find(x => x.id === sortKey) || cols[0];
    const q = tools.find.trim().toLowerCase();
    const active = FILTERS.filter(f => tools.filters.includes(f.id));
    const shown = c.robots.filter(r => active.every(f => f.test(r)) && (!q || r.team.startsWith(q) || r.teamName.toLowerCase().includes(q)));
    const teamsWord = n => n === 1 ? "1 team" : `${n} teams`;
    $("#robot-count").textContent = shown.length === c.robots.length ? `Showing ${c.robots.length === 1 ? "1 team" : "all " + teamsWord(shown.length)}` : `Showing ${shown.length} of ${teamsWord(c.robots.length)}`;
    if (!shown.length) { el.innerHTML = `<div class="empty"><strong>No teams match</strong>Untick a filter or clear the search to see more.</div>`; return; }
    const rs = [...shown].sort((a, b) => {
      const x = sc.sort(a), y = sc.sort(b);
      if (sc.id === "team") return natural(x, y) * sortDir;
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
    const tagFields = FIELDS.filter(f => f.tags);
    const notes = r.entries.flatMap(e => e.reports.flatMap(x => {
      const tags = tagFields.flatMap(f => (x.v[f.key] || []).map(id => (f.options.find(o => o.id === id) || {}).label).filter(Boolean));
      const text = texts.map(f => x.v[f.key]).filter(Boolean).join(" ");
      return tags.length || text ? [{ m: e.matchKey, s: x.scouter, t: [tags.join(" · "), text].filter(Boolean).join(" — ") }] : [];
    }));
    return `<tr class="detail"><td colspan="${span}"><div class="detail-grid">
      <div><h3>Every report</h3><div class="scroll"><table class="mini">
        <thead><tr><th>Match</th><th>Position</th>${COUNTERS.map(f => `<th><span class="grp">${esc(f.section.short)}</span>${esc(f.label)}</th>`).join("")}<th>Total</th>${OTHER.filter(f => f.type !== "checks").map(f => `<th>${esc(f.short || f.label)}</th>`).join("")}<th>Scout</th><th></th></tr></thead>
        <tbody>${r.entries.flatMap(e => e.reports.map((x, i) => `<tr>
          <td>${i === 0 ? esc(e.matchKey) : ""}</td>
          <td>${x.spot != null ? `<span class="spot-tag ${x.spot < 2 ? "red" : "blue"}">${SPOTS[x.spot]}</span>` : "–"}</td>
          ${COUNTERS.map(f => `<td>${counterCell(f, x.v[f.key])}</td>`).join("")}
          <td>${SCORED.reduce((s, f) => s + (+x.v[f.key] || 0), 0)}</td>
          ${OTHER.filter(f => f.type !== "checks").map(f => `<td>${f.type === "yesno" ? yn(x.v[f.key]) : choicePill(f, x.v[f.key])}</td>`).join("")}
          <td>${esc(x.scouter)}</td>
          <td><button class="btn small danger" data-del="${esc(x.id)}" type="button">Delete</button></td>
        </tr>`)).join("")}</tbody></table></div></div>
      <div><h3>Notes</h3>${notes.length ? `<ul class="notes">${notes.map(n => `<li><em>Match ${esc(n.m)} · ${esc(n.s)}</em>${esc(n.t)}</li>`).join("")}</ul>` : '<p class="hint">No notes for this team yet.</p>'}</div>
    </div></td></tr>`;
  }
  $("#robots").addEventListener("click", e => {
    const star = e.target.closest("[data-star]");
    if (star) {
      const t = tierOf(star.dataset.star);
      if (!t) { setTier(star.dataset.star, "star"); toast(`Starred ${star.dataset.star}. Sort it into a tier on Picks.`); }
      else if (t === "star") setTier(star.dataset.star, null);
      else toast(`${star.dataset.star} is on your ${TIERS.find(x => x[0] === t)[1]} list. Change it on Picks.`);
      renderLead(); return;
    }
    const del = e.target.closest("[data-del]");
    if (del) {
      if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Confirm"; return; }
      const id = del.dataset.del;
      removed[id] = true; delete lead[id];
      store.set("removed", removed); store.set("lead", lead);
      toast("Report deleted."); renderChrome(); return;
    }
    const th = e.target.closest("[data-sort]");
    if (th) { const k = th.dataset.sort; sortDir = sortKey === k ? -sortDir : k === "team" ? 1 : -1; sortKey = k; saveTools(); renderLead(); return; }
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
    const head = ["Event", "Match", "Alliance position", "Team", "Team name", "Scout", ...FIELDS.map(f => `${f.section.title}: ${f.short || f.label}`), "Saved at", "Pick list"];
    const names = teamNames();
    const rows = allLeadReports().sort((a, b) => natural(a.event || "", b.event || "") || natural(a.match, b.match) || natural(a.team, b.team)).map(r =>
      [r.event || "", r.match, r.spot != null ? SPOTS[r.spot] : "", r.team, r.teamName || names[r.team] || "", r.scouter, ...FIELDS.map(f => {
        const v = r.v[f.key];
        if (f.type === "choice") { const o = f.options.find(o => o.id === v); return o ? o.label : ""; }
        if (f.type === "checks") return (v || []).map(id => (f.options.find(o => o.id === id) || {}).label).join(" + ");
        return v;
      }), new Date(r.at).toLocaleString(), (TIERS.find(x => x[0] === tierOf(r.team, r.event || "")) || [, ""])[1]].map(cell).join(","));
    if (!rows.length) { toast("Nothing to save yet."); return; }
    saveFile(`${C.season}-scouting-${stamp()}.csv`, [head.map(cell).join(","), ...rows].join("\n"), "text/csv");
  });
  function saveBackup() {
    saveFile(`${C.season}-backup-${stamp()}.json`, JSON.stringify({ app: "bbs", season: C.season, sig: SIG, lead: { ...mine, ...lead }, removed, seen, picks, official }), "application/json");
    sinceBackup = 0; store.set("sinceBackup", 0); renderChrome();
  }
  $("#export-backup").addEventListener("click", saveBackup);
  $("#import-backup").addEventListener("change", async e => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    const msg = $("#data-msg");
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "bbs" || data.season !== C.season) throw new Error("That backup is from a different season or app.");
      Object.assign(removed, data.removed || {});
      const { added } = addToLead(Object.values(data.lead || {}).map(r => { const { sent, ...rest } = r; return rest; }));
      for (const [n, s] of Object.entries(data.seen || {})) if (!seen[n] || seen[n].at < s.at) seen[n] = s;
      for (const [ev, pl] of Object.entries(data.picks || {})) mergePicks(ev, pl);
      for (const [ev, o] of Object.entries(data.official || {})) if (!official[ev] || official[ev].at < o.at) official[ev] = o;
      store.set("removed", removed); store.set("seen", seen); store.set("picks", picks); store.set("official", official);
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
  //  LEAD: BACKUP REMINDER
  //  The lead's phone holds the only merged copy, so nudge every 5 new reports.
  // ===================================================================
  const NAG_EVERY = 5;
  function backupNag() {
    if (sinceBackup < NAG_EVERY) return;
    $("#scan-result").insertAdjacentHTML("beforeend", `<div class="banner warn nag"><strong>${sinceBackup} new reports since your last backup</strong>The lead's phone holds the only merged copy. <button type="button" class="btn small" data-act="backup">Save backup now</button></div>`);
  }
  function paintBackupNag() {
    const due = leadUnlocked && sinceBackup >= NAG_EVERY;
    $("#badge-backup").hidden = !due;
    const n = $("#backup-nag");
    n.hidden = !due;
    if (due) n.innerHTML = `<strong>${sinceBackup} new reports since your last backup</strong>Tap <b>Save backup</b> below. If this phone dies, a backup can be restored on another phone.`;
  }
  document.addEventListener("click", e => { if (e.target.closest('[data-act="backup"]')) saveBackup(); });

  // ===================================================================
  //  LEAD: PICK LIST
  // ===================================================================
  const TIERS = [["first", "1st pick"], ["second", "2nd pick"], ["star", "Starred"], ["avoid", "Avoid"]];
  const emptyPicks = () => ({ first: [], second: [], star: [], avoid: [] });
  const eventPicks = () => (picks[event.code] = Object.assign(emptyPicks(), picks[event.code] || {}));
  function tierOf(team, ev = event.code) {
    const p = picks[ev]; if (!p) return null;
    for (const [t] of TIERS) if ((p[t] || []).includes(String(team))) return t;
    return null;
  }
  function setTier(team, tier) {
    const p = eventPicks(); team = String(team);
    for (const [t] of TIERS) p[t] = p[t].filter(x => x !== team);
    if (tier) p[tier].push(team);
    store.set("picks", picks);
  }
  function movePick(team, dir) {
    const p = eventPicks(), t = tierOf(team); if (!t) return;
    const a = p[t], i = a.indexOf(String(team)), j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    store.set("picks", picks);
  }
  // Adds another phone's picks without undoing this phone's choices.
  function mergePicks(ev, other) {
    const p = picks[ev] = Object.assign(emptyPicks(), picks[ev] || {});
    const placed = new Set(TIERS.flatMap(([t]) => p[t]));
    for (const [t] of TIERS) for (const team of (other[t] || [])) if (!placed.has(String(team))) { p[t].push(String(team)); placed.add(String(team)); }
  }
  const tierTag = t => t ? `<span class="tier-tag ${t}">${t === "star" ? "★" : esc(TIERS.find(x => x[0] === t)[1])}</span>` : "";

  function renderPicks(c) {
    const el = $("#picks"), p = eventPicks(), names = teamNames();
    const byTeam = Object.fromEntries(c.robots.map(r => [r.team, r]));
    const off = (official[event.code] || {}).teams || {};
    const all = new Set([...c.robots.map(r => r.team), ...((eventTeams.code === event.code && eventTeams.numbers) || []).map(String)]);
    const row = (team, tier, i, len) => {
      const r = byTeam[team], o = off[team];
      return `<li class="pick">
        <span class="pick-n">${tier && tier !== "star" ? i + 1 : ""}</span>
        <span class="pick-team"><b>${esc(team)}</b> ${esc(names[team] || "")}
          <small>${r ? `${fmt(r.avgTotal)} pieces/match · ${r.matches} scouted${r.accAll != null ? ` · ${pct(r.accAll)} accuracy` : ""}${r.avgRp != null ? ` · ${fmt(r.avgRp)} RP` : ""}` : "Not scouted yet"}${o ? ` · Official #${o.rank}` : ""}</small></span>
        <span class="pick-ctl">
          ${tier && tier !== "star" ? `<button type="button" class="btn small" data-pmove="-1" data-team="${esc(team)}" aria-label="Move ${esc(team)} up" ${i === 0 ? "disabled" : ""}>▲</button>
          <button type="button" class="btn small" data-pmove="1" data-team="${esc(team)}" aria-label="Move ${esc(team)} down" ${i === len - 1 ? "disabled" : ""}>▼</button>` : ""}
          <select data-ptier="${esc(team)}" aria-label="Tier for ${esc(team)}">
            <option value="">—</option>${TIERS.map(([t, l]) => `<option value="${t}" ${t === tier ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </span>
      </li>`;
    };
    const placed = new Set(TIERS.flatMap(([t]) => p[t]));
    const rest = [...all].filter(t => !placed.has(t)).sort((a, b) => ((byTeam[b] || {}).avgTotal ?? -1) - ((byTeam[a] || {}).avgTotal ?? -1) || natural(a, b));
    el.innerHTML = TIERS.map(([t, label]) => `
      <section class="tier ${t}"><h3>${esc(label)} <span>${p[t].length}</span></h3>
        ${p[t].length ? `<ol class="picklist">${p[t].map((team, i) => row(team, t, i, p[t].length)).join("")}</ol>` : `<p class="hint">${t === "star" ? "Tap ☆ next to a team on the Robots screen, or pick “Starred” below." : "None yet. Use the menu next to a team to add it here."}</p>`}
      </section>`).join("") + `
      <section class="tier rest"><h3>Everyone else <span>${rest.length}</span></h3>
        ${rest.length ? `<ol class="picklist">${rest.map(team => row(team, null, 0, 0)).join("")}</ol>` : `<p class="hint">Teams appear here once scouted, or after downloading the event's teams on the Schedule screen.</p>`}
      </section>`;
  }
  $("#picks").addEventListener("click", e => {
    const b = e.target.closest("[data-pmove]"); if (!b) return;
    movePick(b.dataset.team, +b.dataset.pmove); renderLead();
  });
  $("#picks").addEventListener("change", e => {
    const s = e.target.closest("[data-ptier]"); if (!s) return;
    setTier(s.dataset.ptier, s.value || null); renderLead();
  });
  $("#picks-csv").addEventListener("click", () => {
    const c = consolidate(), byTeam = Object.fromEntries(c.robots.map(r => [r.team, r])), names = teamNames(), p = eventPicks();
    const off = (official[event.code] || {}).teams || {};
    const cell = v => { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    const head = ["Event", "Tier", "Order", "Team", "Team name", "Matches scouted", "Avg pieces", "Accuracy", "Avg RP", "Official rank"];
    const rows = TIERS.flatMap(([t, label]) => p[t].map((team, i) => {
      const r = byTeam[team] || {};
      return [event.code, label, t === "star" ? "" : i + 1, team, names[team] || "", r.matches || 0, r.avgTotal != null ? fmt(r.avgTotal) : "", r.accAll != null ? pct(r.accAll) : "", r.avgRp != null ? fmt(r.avgRp) : "", (off[team] || {}).rank || ""].map(cell).join(",");
    }));
    if (!rows.length) { toast("The pick list is empty."); return; }
    saveFile(`${C.season}-${event.code}-picks-${stamp()}.csv`, [head.join(","), ...rows].join("\n"), "text/csv");
  });

  // ===================================================================
  //  LEAD: OFFICIAL RESULTS (FTCScout)
  // ===================================================================
  // Match a bonus-RP option in config.js (e.g. "Pollinator 1") to FTCScout's field (e.g. "pollinator1Rp").
  const squash = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  function officialRpKey(o, sample) {
    const want = [squash(o.label), squash(o.id)];
    return Object.keys(sample || {}).find(k => /rp$/i.test(k) && want.some(w => w && squash(k).replace(/rp$/, "") === w)) || null;
  }
  async function downloadOfficial() {
    const msg = $("#official-msg"), btn = $("#official-download"), code = event.code;
    btn.disabled = true; btn.textContent = "Downloading…";
    try {
      const base = `${FTCSCOUT}/rest/v1/events/${C.ftcSeason}/${encodeURIComponent(code)}`;
      const [mr, tr] = await Promise.all([fetch(base + "/matches", { cache: "no-store" }), fetch(base + "/teams", { cache: "no-store" })]);
      if (mr.status === 404) throw new Error(`FTCScout doesn't know event ${code}.`);
      if (!mr.ok || !tr.ok) throw new Error("FTCScout didn't answer properly. Try again in a minute.");
      const matches = {}, teams = {};
      for (const m of await mr.json()) {
        if (m.tournamentLevel !== "Quals" || !m.hasBeenPlayed || !m.scores) continue;
        const at = (a, st) => ((m.teams || []).find(x => x.alliance === a && x.station === st) || {}).teamNumber;
        const side = sc => { const o = { total: sc.totalPoints, np: sc.totalPointsNp, auto: sc.autoPoints, rp: {} }; for (const [k, v] of Object.entries(sc)) if (/rp$/i.test(k)) o.rp[k] = !!v; return o; };
        matches[String(m.id)] = { teams: [at("Red", "One"), at("Red", "Two"), at("Blue", "One"), at("Blue", "Two")].map(String), red: side(m.scores.red), blue: side(m.scores.blue) };
      }
      for (const t of await tr.json()) if (t.stats && t.stats.rank) teams[String(t.teamNumber)] = { rank: t.stats.rank, rs: t.stats.rp, w: t.stats.wins, l: t.stats.losses, t: t.stats.ties, played: t.stats.qualMatchesPlayed };
      official[code] = { at: Date.now(), matches, teams };
      store.set("official", official);
      const n = Object.keys(matches).length;
      msg.innerHTML = n ? `<div class="banner good"><strong>${n} official matches and ${Object.keys(teams).length} team rankings downloaded</strong>Saved on this phone. Download again later for newer matches.</div>`
        : `<div class="banner warn"><strong>No official results yet for ${esc(code)}</strong>FTCScout shows results shortly after each match is played. Try again later.</div>`;
    } catch (e) {
      msg.innerHTML = `<div class="banner bad"><strong>Couldn't download official results</strong>${esc(e instanceof TypeError ? "No internet connection right now. Try again when you have a signal." : e.message)}</div>`;
    } finally { btn.disabled = false; btn.textContent = "Download official results"; renderLead(); }
  }
  $("#official-download").addEventListener("click", downloadOfficial);

  // Compares one scout report with the official result for its match.
  const RESULT_FIELD = FIELDS.find(f => f.type === "choice" && f.options.some(o => o.id === "win") && f.options.some(o => o.id === "loss"));
  const BONUS_FIELD = FIELDS.find(f => f.type === "checks" && f.options.some(o => typeof o.rp === "number"));
  function checkReport(r, off) {
    const m = off && off.matches[String(+r.match)];
    if (!m) return null;
    const i = m.teams.indexOf(String(r.team)); if (i < 0) return null;
    const mine = i < 2 ? m.red : m.blue, theirs = i < 2 ? m.blue : m.red;
    const out = { result: null, rp: [], alliance: i < 2 ? "Red" : "Blue" };
    if (RESULT_FIELD && r.v[RESULT_FIELD.key] && mine.total != null) {
      const actual = mine.total > theirs.total ? "win" : mine.total < theirs.total ? "loss" : "tie";
      if (RESULT_FIELD.options.some(o => o.id === actual)) out.result = { scouted: r.v[RESULT_FIELD.key], actual, ok: r.v[RESULT_FIELD.key] === actual };
    }
    if (BONUS_FIELD) for (const o of BONUS_FIELD.options) {
      const k = officialRpKey(o, mine.rp); if (!k) continue;
      const said = (r.v[BONUS_FIELD.key] || []).includes(o.id);
      out.rp.push({ label: o.label, said, actual: mine.rp[k], ok: said === mine.rp[k] });
    }
    return out;
  }
  function renderOfficial(c) {
    const el = $("#official"), off = official[event.code];
    if (!off) { el.innerHTML = `<div class="empty"><strong>No official results on this phone yet</strong>Tap <b>Download official results</b> when you have internet, for example at lunch or between matches.</div>`; return; }
    const names = teamNames(), byTeam = Object.fromEntries(c.robots.map(r => [r.team, r]));
    // Scout check: how often each scout's result and bonus RP match the referees.
    const per = {};
    for (const r of allLeadReports().filter(x => (x.event || "") === event.code)) {
      const k = checkReport(r, off); if (!k) continue;
      const s = per[r.scouter] = per[r.scouter] || { n: 0, res: [0, 0], rp: [0, 0], misses: [] };
      s.n++;
      if (k.result) { s.res[1]++; if (k.result.ok) s.res[0]++; else s.misses.push(`M${r.match} ${r.team}: said ${k.result.scouted}, was ${k.result.actual}`); }
      for (const x of k.rp) { s.rp[1]++; if (x.ok) s.rp[0]++; else s.misses.push(`M${r.match} ${r.team}: ${x.label} ${x.said ? "marked" : "missed"}`); }
    }
    const rate = ([a, b]) => b ? a / b : null;
    const pill = v => v == null ? "–" : `<span class="pill ${v >= 0.9 ? "good" : v >= 0.75 ? "warn" : "bad"}">${pct(v)}</span>`;
    const scouts = Object.entries(per).sort((a, b) => (rate(a[1].rp) ?? 1) - (rate(b[1].rp) ?? 1));
    const ranks = Object.entries(off.teams).sort((a, b) => a[1].rank - b[1].rank);
    el.innerHTML = `
      <p class="hint">Official results for ${esc(event.name)}, downloaded ${esc(ago(off.at))}: ${Object.keys(off.matches).length} matches.</p>
      <div class="card"><h2 class="section-h">Scout check</h2>
        <p class="hint">How often each scout's match result and bonus RP agree with the official score. Low numbers usually mean a scout needs a quick refresher.</p>
        ${scouts.length ? `<div class="scroll"><table><thead><tr><th>Scout</th><th>Result right</th><th>Bonus RP right</th><th>Checked</th></tr></thead>
          <tbody>${scouts.map(([name, s]) => `<tr><td class="team">${esc(name)}</td><td>${pill(rate(s.res))}</td><td>${pill(rate(s.rp))}</td><td>${s.n}</td></tr>`).join("")}</tbody></table></div>
          ${scouts.some(([, s]) => s.misses.length) ? `<ul class="notes">${scouts.filter(([, s]) => s.misses.length).map(([name, s]) => `<li><em>${esc(name)} · ${s.misses.length} to review</em>${esc(s.misses.slice(0, 6).join(" · "))}${s.misses.length > 6 ? " …" : ""}</li>`).join("")}</ul>` : ""}`
          : `<p class="hint">None of your reports match an official match yet.</p>`}
      </div>
      <div class="card"><h2 class="section-h">Official rankings</h2>
        ${ranks.length ? `<div class="scroll"><table><thead><tr><th>Team</th><th>Rank</th><th>RS</th><th>W-L-T</th><th><span class="grp">scouted</span>Pieces</th><th><span class="grp">scouted</span>RP</th></tr></thead>
          <tbody>${ranks.map(([t, o]) => { const r = byTeam[t]; return `<tr><td class="team">${tierTag(tierOf(t))} ${esc(t)}<small>${esc(names[t] || "")}</small></td><td>${o.rank}</td><td>${fmt(o.rs)}</td><td>${o.w}-${o.l}-${o.t}</td><td>${r ? fmt(r.avgTotal) : "–"}</td><td>${r && r.avgRp != null ? fmt(r.avgRp) : "–"}</td></tr>`; }).join("")}</tbody></table></div>`
          : `<p class="hint">Rankings appear once qualification matches have been played.</p>`}
      </div>`;
  }

  // ===================================================================
  //  LEAD: SECOND LEAD PHONE (transfer by QR)
  //  "BBT1|<season>|<fingerprint>|<transfer id>|<part>/<parts>|" + JSON rows:
  //  report rows (as in hand-off codes), ["x", id] deletions, ["p", event, tier, [teams]] picks.
  // ===================================================================
  let xferCodes = [], xferIdx = 0, xferTimer = null, xferPaused = false, wakeLock = null;
  const xferGot = {};
  function transferCodes() {
    const id = newId().slice(0, 6);
    const rows = [
      ...allLeadReports().map(toRow),
      ...Object.keys(removed).map(x => ["x", x]),
      ...Object.entries(picks).flatMap(([ev, p]) => TIERS.filter(([t]) => (p[t] || []).length).map(([t]) => ["p", ev, t, p[t]])),
    ];
    const head = (k, n) => `BBT1|${C.season}|${SIG}|${id}|${k}/${n}|`;
    const chunks = []; let cur = [];
    for (const r of rows) {
      if (cur.length && (head(999, 999) + JSON.stringify([...cur, r])).length > MAX_CODE_CHARS) { chunks.push(cur); cur = []; }
      cur.push(r);
    }
    if (cur.length) chunks.push(cur);
    return chunks.map((c, i) => head(i + 1, chunks.length) + JSON.stringify(c));
  }
  function paintXfer() {
    const el = $("#xfer");
    if (!xferCodes.length) { el.innerHTML = ""; return; }
    el.innerHTML = `
      <div class="qr-nav">
        <button type="button" class="btn small" data-xf="prev">‹</button>
        <strong>Part ${xferIdx + 1} of ${xferCodes.length}</strong>
        <button type="button" class="btn small" data-xf="next">›</button>
      </div>
      <div class="qr-box" role="img" aria-label="Transfer code part ${xferIdx + 1}">${qrSvg(xferCodes[xferIdx])}</div>
      <div class="actions"><button type="button" class="btn" data-xf="pause">${xferPaused ? "Resume" : "Pause"}</button><button type="button" class="btn" data-xf="stop">Done</button></div>
      <p class="hint">The codes change every 1.5 seconds and loop. Keep the other phone pointed here until it says all ${xferCodes.length} parts are in.</p>`;
  }
  function stopXfer() {
    clearInterval(xferTimer); xferTimer = null; xferCodes = [];
    try { wakeLock && wakeLock.release(); } catch {} wakeLock = null;
    paintXfer();
  }
  $("#xfer-show").addEventListener("click", async () => {
    xferCodes = transferCodes(); xferIdx = 0; xferPaused = false;
    if (!xferCodes.length) { $("#xfer").innerHTML = `<p class="hint">Nothing to copy yet. This phone has no reports, deletions or pick lists.</p>`; return; }
    clearInterval(xferTimer);
    xferTimer = setInterval(() => { if (!xferPaused) { xferIdx = (xferIdx + 1) % xferCodes.length; paintXfer(); } }, 1500);
    try { wakeLock = await navigator.wakeLock.request("screen"); } catch {}
    paintXfer();
  });
  $("#xfer").addEventListener("click", e => {
    const b = e.target.closest("[data-xf]"); if (!b) return;
    const a = b.dataset.xf;
    if (a === "stop") return stopXfer();
    if (a === "pause") xferPaused = !xferPaused;
    if (a === "prev") { xferPaused = true; xferIdx = (xferIdx - 1 + xferCodes.length) % xferCodes.length; }
    if (a === "next") { xferPaused = true; xferIdx = (xferIdx + 1) % xferCodes.length; }
    paintXfer();
  });
  function importTransferCode(text) {
    const p = text.split("|");
    if (p[1] !== C.season || p[2] !== SIG) { beep(false); showResult("bad", "Not copied", "That lead phone has a different version of the app. Open the app on both phones with internet so they update, then try again."); return; }
    const id = p[3], [k, n] = p[4].split("/").map(Number);
    let rows;
    try { rows = JSON.parse(p.slice(5).join("|")); } catch { beep(false); showResult("bad", "Couldn't read that code", "Hold steady; the next part comes around again."); return; }
    const reports = [];
    for (const r of rows) {
      if (r[0] === "x") removed[r[1]] = true;
      else if (r[0] === "p") mergePicks(r[1], { [r[2]]: r[3] });
      else { try { reports.push(fromRow(r)); } catch {} }
    }
    store.set("removed", removed); store.set("picks", picks);
    for (const rid of Object.keys(removed)) delete lead[rid];
    const { added } = addToLead(reports, true);
    const got = xferGot[id] = xferGot[id] || new Set(); const fresh = !got.has(k); got.add(k);
    if (fresh) beep(true);
    const done = got.size >= n;
    showResult(done ? "good" : "warn", done ? `Copied everything: all ${n} parts` : `Copying lead data: ${got.size} of ${n} parts`,
      done ? "This phone now has the other lead's reports, deletions and pick lists. Save a backup here too." : `Keep the camera on the other phone. ${added ? `${added} new report${added > 1 ? "s" : ""} in this part.` : ""}`);
    renderChrome();
  }

  // ===================================================================
  //  NAVIGATION + CHROME
  // ===================================================================
  let view = "scout", sub = "scan";
  function renderLead() {
    if (view !== "lead") return;
    $("#scope-event").textContent = event.name;
    $("#scope-event").setAttribute("aria-pressed", String(!tools.allEvents));
    $("#scope-all").setAttribute("aria-pressed", String(!!tools.allEvents));
    const c = consolidate();
    if (sub === "scan") renderSeen();
    if (sub === "schedule") renderSchedule();
    if (sub === "matches") renderMatches(c);
    if (sub === "robots") renderRobots(c);
    if (sub === "data") renderData(c);
    if (sub === "picks") renderPicks(c);
    if (sub === "official") renderOfficial(c);
  }
  function renderChrome() {
    const unsent = Object.values(mine).filter(r => !r.sent).length;
    const badge = $("#badge-handoff"); badge.hidden = !unsent; badge.textContent = unsent;
    const st = $("#status"), tx = $("#status-text");
    st.className = "status " + (unsent ? "warn" : "good");
    tx.textContent = unsent ? `${unsent} to hand off` : offlineReady ? "Works offline" : "Ready";
    if (view === "handoff") renderHandoff();
    paintBackupNag();
    renderLead();
    paintDupHint();
  }
  function show(v) {
    // A locked phone only reaches the Lead area to scan the lead's schedule code.
    if (v === "lead" && !leadUnlocked && !scanReturn) v = "scout";
    if (v !== "lead") scanReturn = false;
    view = v;
    const scanOnly = v === "lead" && !leadUnlocked;
    document.body.classList.toggle("scan-only", scanOnly);
    $("#scan-title").textContent = scanOnly ? "Scan the lead's schedule code" : "Scan a scout's phone";
    $("#scan-hint").innerHTML = scanOnly
      ? "The lead opens <b>Lead → Schedule</b> and shows the code under “Share with scouts”. Scan every part."
      : "Ask the scout to open <b>Hand off</b>. Point this camera at their code. Each code only needs one beep.";
    if (scanOnly && sub !== "scan") showSub("scan");
    paintLock();
    document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === v)));
    for (const id of ["scout", "handoff", "lead"]) $("#view-" + id).hidden = id !== v;
    if (v !== "lead" || sub !== "scan") stopCamera();
    if (v !== "lead" && xferCodes.length) stopXfer();
    renderChrome();
    window.scrollTo(0, 0);
  }
  function showSub(s) {
    sub = s;
    document.querySelectorAll("nav.subtabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.sub === s)));
    for (const id of ["scan", "schedule", "matches", "robots", "picks", "official", "data"]) $("#sub-" + id).hidden = id !== s;
    if (s !== "scan") stopCamera();
    if (s !== "data" && xferCodes.length) stopXfer();
    renderLead();
  }
  document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => show(b.dataset.view)));

  // ---------- lead PIN lock ----------
  // A convenience lock, not real security: it keeps scouts out of the Lead screens.
  let leadUnlocked = true;
  if (C.leadPinHash) { leadUnlocked = false; try { leadUnlocked = localStorage.getItem("bbs:lead") === C.leadPinHash; } catch {} }
  if (leadUnlocked && Object.values(mine).some(r => !r.sent)) { for (const r of Object.values(mine)) r.sent = true; store.set("mine", mine); }
  async function pinHash(pin) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("bbs-lead:" + pin));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function paintLock() {
    $('nav.tabs [data-view="lead"]').hidden = !leadUnlocked;
    $(".lead-login").hidden = leadUnlocked || !C.leadPinHash;
    $("#lead-lock").hidden = !C.leadPinHash;
  }
  function openPin() {
    $("#pin-overlay").hidden = false; $("#pin-err").hidden = true;
    const i = $("#pin-input"); i.value = ""; setTimeout(() => i.focus(), 50);
  }
  $("#lead-login").addEventListener("click", openPin);
  let titleTaps = 0, titleTimer;
  $("#app-name").addEventListener("click", () => {
    clearTimeout(titleTimer); titleTimer = setTimeout(() => (titleTaps = 0), 1500);
    if (++titleTaps >= 5 && !leadUnlocked) { titleTaps = 0; openPin(); }
  });
  $("#pin-cancel").addEventListener("click", () => ($("#pin-overlay").hidden = true));
  $("#pin-form").addEventListener("submit", async e => {
    e.preventDefault();
    let h = "";
    try { h = await pinHash($("#pin-input").value.trim()); } catch {}
    if (h !== C.leadPinHash) { $("#pin-err").hidden = false; $("#pin-input").select(); return; }
    leadUnlocked = true;
    try { localStorage.setItem("bbs:lead", h); } catch {}
    // Reports already on the lead's phone are in the lead's results, so nothing is left to hand off.
    for (const r of Object.values(mine)) r.sent = true;
    store.set("mine", mine);
    $("#pin-overlay").hidden = true;
    show("lead"); toast("Lead mode is on for this phone.");
  });
  $("#lead-lock").addEventListener("click", () => {
    leadUnlocked = false;
    try { localStorage.removeItem("bbs:lead"); } catch {}
    show("scout"); toast("Lead screens locked.");
  });
  $("#scan-back").addEventListener("click", () => show("scout"));
  $("#scope-event").addEventListener("click", () => { tools.allEvents = false; saveTools(); renderLead(); });
  $("#scope-all").addEventListener("click", () => { tools.allEvents = true; saveTools(); renderLead(); });
  $("#make-pin").addEventListener("click", async () => {
    const pin = $("#new-pin").value.trim(), out = $("#pin-line");
    if (pin.length < 4) { out.innerHTML = `<p class="err">Use at least 4 characters.</p>`; return; }
    const line = `  leadPinHash: "${await pinHash(pin)}",`;
    out.innerHTML = `<div class="pin-out"><code id="pin-code">${esc(line)}</code><button type="button" class="btn small" id="copy-pin">Copy line</button></div>`;
    $("#copy-pin").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(line); toast("Copied. Paste it into config.js."); }
      catch { const r = document.createRange(); r.selectNodeContents($("#pin-code")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    });
  });
  document.querySelectorAll("nav.subtabs button").forEach(b => b.addEventListener("click", () => showSub(b.dataset.sub)));
  document.addEventListener("visibilitychange", () => { if (document.hidden) { store.set("draft", form); stopCamera(); } });

  // Install + offline
  let offlineReady = false;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  // Install steps for this kind of device. Recent iPads report themselves as a Mac, so check for touch too.
  function installHint(ua, touchPoints) {
    const iPad = /ipad/i.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
    const iOS = iPad || /iphone|ipod/i.test(ua);
    const android = /android/i.test(ua);
    if (!iOS && !android) return ""; // laptops: no install needed, it works in a normal browser tab
    const steps = iOS
      ? (/CriOS|FxiOS|EdgiOS/i.test(ua)
        ? "Tap the Share button in the address bar, then “Add to Home Screen”. (Safari works too.)"
        : `In Safari, tap the Share button (the square with an arrow${iPad ? ", top right" : ", bottom of the screen"}), scroll down, tap “Add to Home Screen”, then “Add”.`)
      : android
        ? (/SamsungBrowser/i.test(ua) ? "Tap the menu (☰), then “Add page to”, then “Home screen”." : "Tap the browser menu (⋮), then “Add to Home screen” or “Install app”.")
        : "";
    const after = iOS
      ? "Then <b>always open it from the home-screen icon</b>. On iPhone and iPad, the icon and Safari keep separate data, so reports saved in one won't show in the other."
      : "Then <b>always open it from the icon</b>. It works with no internet.";
    return `<strong>Add this to your home screen before the event</strong>${esc(steps)} ${after}<button type="button" class="btn small install-btn" id="install-btn" hidden>Install app</button>`;
  }
  const installText = standalone ? "" : installHint(navigator.userAgent, navigator.maxTouchPoints || 0);
  if (installText) { const hint = $("#install-hint"); hint.hidden = false; hint.innerHTML = installText; }
  // Chrome on Android (and desktop) can show its own install prompt from a button.
  let installPrompt = null;
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; const b = $("#install-btn"); if (b) b.hidden = false; });
  addEventListener("appinstalled", () => { $("#install-hint").hidden = true; installPrompt = null; });
  document.addEventListener("click", async e => {
    if (!e.target.closest("#install-btn") || !installPrompt) return;
    installPrompt.prompt();
    try { await installPrompt.userChoice; } catch {}
    installPrompt = null; $("#install-btn").hidden = true;
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then(() => { offlineReady = true; renderChrome(); }).catch(() => {});
  }

  $("#app-name").innerHTML = esc(C.appName).replace(/^(\S+?)(Buzz|\s)/, "$1<span>$2</span>");
  $("#tagline").textContent = C.tagline || "";
  document.title = C.appName;

  // test hooks for the README's troubleshooting steps and automated checks
  window.__scout = { buildCodes, parseCode, importCode, qrSvg, consolidate, FIELDS, scheduleCodes, parseScheduleText, getSchedule: () => schedule, getEvent: () => event, pickEvent, setEvent, setTier, tierOf, transferCodes, getSinceBackup: () => sinceBackup, getOfficial: () => official, installHint };

  paintForm();
  show("scout");
  // Reopened mid-match: pick the timer back up (or drop a stale one).
  if (form.matchStart) { if (elapsed() < bounds.after + 600) enterMatchMode(); else { form.matchStart = null; store.set("draft", form); } }
  const setHdr = () => document.documentElement.style.setProperty("--hdr", $("header.top").offsetHeight + "px");
  setHdr(); addEventListener("resize", setHdr);
})();
