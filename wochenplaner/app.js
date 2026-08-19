
const FACH_FARBEN = [
  { key: "deutsch", color: "#f6d6d3" },
  { key: "mathe", color: "#d3e3f6" },
  { key: "sachunterricht", color: "#d9f0d9" },
  { key: "englisch", color: "#faf0c0" },
  { key: "förder", color: "#ffffff" },
  { key: "verfügung", color: "#e0e0e0" },
];
const FACH_OPTIONEN = ["Deutsch", "Mathe", "Sachunterricht", "Englisch", "Förderung", "Verfügung", "Sport", "Kunst", "Musik", "Religion/Ethik"];
function getFachColor(fach) {
  const t = (fach || "").trim().toLowerCase();
  if (!t) return "transparent";
  const hit = FACH_FARBEN.find((f) => t.includes(f.key));
  return hit ? hit.color : "transparent";
}
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDays(dateStr, n) { const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function mondayOfWeek(dateStr) { const d = new Date(dateStr + "T00:00:00"); const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day; d.setDate(d.getDate() + diff); return d.toISOString().slice(0, 10); }
function formatDateShort(iso) { const [y, m, d] = iso.split("-"); return `${d}.${m}.`; }
function formatDateFull(iso) { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; }
function getISOWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00"); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
const WEEKDAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];

function emptyStunden() { return Array.from({ length: 6 }, () => ({ klasse: "", fach: "", inhalt: "", material: "", sonstiges: "" })); }
function emptyDay() { return { termine: "", stunden: emptyStunden() }; }
function ensureWeek(monday) {
  if (!state.weeks[monday]) {
    const days = {};
    for (let i = 0; i < 5; i++) days[addDays(monday, i)] = emptyDay();
    state.weeks[monday] = { days, notizen: "" };
  }
  return state.weeks[monday];
}

let state = { weeks: {}, ferien: [], schuljahr: { start: "2026-08-24", end: "2027-06-30" } };
let ui = { currentMonday: mondayOfWeek(todayISO()), selectedDay: null };

const STORAGE_KEY = "wochenplaner-offline-v1";
function defaultFerien() {
  return [
    { id: "1", name: "Herbstferien", start: "2026-10-19", end: "2026-10-31" },
    { id: "2", name: "Weihnachtsferien", start: "2026-12-23", end: "2027-01-02" },
  ];
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = {
        weeks: parsed.weeks || {},
        ferien: parsed.ferien || [],
        schuljahr: parsed.schuljahr || { start: "2026-08-24", end: "2027-06-30" },
      };
    } else {
      state.ferien = defaultFerien();
    }
  } catch (e) {
    console.warn("Konnte gespeicherte Daten nicht laden:", e);
  }
}
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    alert("Speichern ist fehlgeschlagen. Möglicherweise ist der Speicher des Browsers voll.");
  }
}

function renderHeader() { return `<header class="app-header"><span class="title serif" style="font-size:1.1rem;">📅 Wochenplaner</span></header>`; }
function renderBanner() { return ""; }

function isHolidayDay(dateISO) { return state.ferien.some((f) => f.start <= dateISO && dateISO <= f.end); }
function isSchoolWeek(monday) { for (let i = 0; i < 5; i++) { if (!isHolidayDay(addDays(monday, i))) return true; } return false; }
function computeSchoolWeekInfo(monday) {
  const start = mondayOfWeek(state.schuljahr.start), end = state.schuljahr.end;
  if (monday < start || monday > end) return { outside: true };
  let total = 0, current = null, w = start;
  while (w <= end) {
    if (isSchoolWeek(w)) { total++; if (w === monday) current = total; }
    w = addDays(w, 7);
  }
  return { total, current };
}
function renderWeekNav() {
  const monday = ui.currentMonday, friday = addDays(monday, 4);
  const sw = computeSchoolWeekInfo(monday);
  let swLabel;
  if (sw.outside) swLabel = "außerhalb des Schuljahres";
  else if (sw.current === null) swLabel = "Ferienwoche";
  else swLabel = `Schulwoche ${sw.current} von ${sw.total}`;
  return `<div class="week-nav">
    <button class="btn btn-outline" data-action="prev-week">◀ Vorherige</button>
    <div style="text-align:center;"><div class="kw-label">KW ${getISOWeek(monday)} · ${swLabel}</div><div class="muted" style="font-size:0.75rem;">${formatDateFull(monday)} – ${formatDateFull(friday)}</div></div>
    <button class="btn btn-outline" data-action="next-week">Nächste ▶</button>
  </div>
  <button class="btn btn-outline btn-block" style="margin-bottom:10px;" data-action="goto-today">Diese Woche</button>`;
}
function renderDayTabs(monday) {
  let html = '<div class="day-tabs">';
  for (let i = 0; i < 5; i++) {
    const dISO = addDays(monday, i);
    const active = ui.selectedDay === dISO;
    html += `<button class="${active ? "active" : ""}" data-action="select-day" data-day="${dISO}">${WEEKDAY_NAMES[i]}<br>${formatDateShort(dISO)}</button>`;
  }
  html += "</div>";
  return html;
}
function renderFachCell(row, dayISO, idx) {
  const isCustom = row.customFach || (row.fach && !FACH_OPTIONEN.includes(row.fach));
  const options = ['<option value="">–</option>']
    .concat(FACH_OPTIONEN.map((f) => `<option value="${f}" ${row.fach === f ? "selected" : ""}>${f}</option>`))
    .concat([`<option value="__custom__" ${isCustom ? "selected" : ""}>Sonstiges …</option>`])
    .join("");
  let html = `<select data-change="set-fach-select" data-day="${dayISO}" data-idx="${idx}">${options}</select>`;
  if (isCustom) html += `<input type="text" value="${escapeHtml(row.fach)}" data-field="fach" data-day="${dayISO}" data-idx="${idx}" placeholder="eigenes Fach" style="margin-top:4px;font-size:0.8rem;" />`;
  return html;
}
function renderStundenTable(dayISO, day) {
  let html = '<table class="stunden-table"><thead><tr><th style="width:10%;">Klasse</th><th style="width:16%;">Fach</th><th>Inhalt</th><th style="width:18%;">Material</th><th style="width:16%;">Sonstiges</th><th style="width:24px;"></th></tr></thead><tbody>';
  day.stunden.forEach((row, idx) => {
    const bg = getFachColor(row.fach);
    html += `<tr style="background:${bg};">`;
    html += `<td><input type="text" value="${escapeHtml(row.klasse)}" data-field="klasse" data-day="${dayISO}" data-idx="${idx}" /></td>`;
    html += `<td>${renderFachCell(row, dayISO, idx)}</td>`;
    ["inhalt", "material", "sonstiges"].forEach((field) => {
      html += `<td><textarea class="autosize" rows="1" data-field="${field}" data-day="${dayISO}" data-idx="${idx}">${escapeHtml(row[field])}</textarea></td>`;
    });
    html += `<td><button class="icon-btn" data-action="delete-stunde" data-day="${dayISO}" data-idx="${idx}">🗑</button></td>`;
    html += "</tr>";
  });
  html += "</tbody></table>";
  html += `<button type="button" class="btn btn-outline" style="margin-top:8px;font-size:0.78rem;" data-action="add-stunde" data-day="${dayISO}">➕ Stunde</button>`;
  return html;
}
function renderDayPanel(monday) {
  const dayISO = ui.selectedDay;
  const week = ensureWeek(monday);
  const day = week.days[dayISO];
  let html = `<div class="card" style="padding:14px;margin-bottom:14px;">`;
  html += `<div style="font-weight:600;font-size:0.95rem;margin-bottom:8px;">${WEEKDAY_NAMES[(new Date(dayISO + "T00:00:00").getDay() + 6) % 7]}, ${formatDateFull(dayISO)}</div>`;
  html += `<div style="margin-bottom:10px;"><div class="muted" style="font-size:0.72rem;margin-bottom:3px;">Tagestermine</div><textarea class="autosize" rows="1" id="termine-input" data-field="termine" data-day="${dayISO}" placeholder="z. B. 8:00 Teamsitzung, 14:00 Elterngespräch Fischer">${escapeHtml(day.termine)}</textarea></div>`;
  html += renderStundenTable(dayISO, day);
  html += "</div>";
  return html;
}
function renderFachLegende() {
  let html = '<div class="flex-row" style="flex-wrap:wrap;gap:6px;margin-bottom:14px;">';
  const labels = [["Deutsch", "#f6d6d3"], ["Mathe", "#d3e3f6"], ["Sachunterricht", "#d9f0d9"], ["Englisch", "#faf0c0"], ["Förderung", "#ffffff"], ["Verfügung", "#e0e0e0"]];
  labels.forEach(([name, color]) => { html += `<span style="background:${color};border:1px solid var(--card-border);border-radius:6px;padding:3px 8px;font-size:0.72rem;">${name}</span>`; });
  html += "</div>";
  return html;
}
function computeFerienInfo() {
  const today = todayISO();
  const sorted = state.ferien.slice().sort((a, b) => a.start.localeCompare(b.start));
  const ongoing = sorted.find((f) => f.start <= today && today <= f.end);
  if (ongoing) return { mode: "ongoing", ferien: ongoing };
  const next = sorted.find((f) => f.start > today);
  if (!next) return { mode: "none" };
  let days = 0, d = new Date(today + "T00:00:00"), end = new Date(next.start + "T00:00:00");
  while (d < end) { const wd = d.getDay(); if (wd >= 1 && wd <= 5) days++; d.setDate(d.getDate() + 1); }
  return { mode: "countdown", ferien: next, schooldays: days, weeks: Math.ceil(days / 5) };
}
function renderFerienCard() {
  const info = computeFerienInfo();
  let html = '<div class="card" style="padding:14px;margin-bottom:14px;">';
  html += '<div class="section-title" style="margin-top:0;">🏖️ Nächste Ferien</div>';
  if (info.mode === "ongoing") html += `<p style="margin:0;">Aktuell ${escapeHtml(info.ferien.name)} (bis ${formatDateFull(info.ferien.end)}).</p>`;
  else if (info.mode === "none") html += '<p class="muted" style="margin:0;">Keine Ferientermine hinterlegt.</p>';
  else html += `<p style="margin:0;font-size:0.95rem;"><strong>Noch ${info.schooldays} Schultage</strong> (≈ ${info.weeks} Wochen) bis ${escapeHtml(info.ferien.name)} (ab ${formatDateFull(info.ferien.start)})</p><p class="muted" style="font-size:0.7rem;margin:4px 0 0;">Zählt Wochentage Mo–Fr, ohne Berücksichtigung einzelner Feiertage.</p>`;
  html += '<div class="gap-sm" style="margin-top:10px;">';
  state.ferien.slice().sort((a, b) => a.start.localeCompare(b.start)).forEach((f) => {
    html += `<div class="ferien-row"><span>${escapeHtml(f.name)}: ${formatDateFull(f.start)} – ${formatDateFull(f.end)}</span><button class="icon-btn" data-action="delete-ferien" data-id="${f.id}">🗑</button></div>`;
  });
  html += "</div>";
  html += `<div class="flex-row" style="margin-top:10px;flex-wrap:wrap;gap:6px;">
    <input type="text" id="new-ferien-name" placeholder="Name (z. B. Winterferien)" style="flex:2;min-width:120px;" />
    <input type="date" id="new-ferien-start" style="flex:1;min-width:110px;" />
    <input type="date" id="new-ferien-end" style="flex:1;min-width:110px;" />
    <button class="btn btn-primary" data-action="add-ferien">➕</button>
  </div>`;
  html += `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--card-border);">
    <div class="muted" style="font-size:0.72rem;margin-bottom:4px;">Schuljahr (für "Schulwoche X von Y")</div>
    <div class="flex-row" style="flex-wrap:wrap;gap:6px;">
      <div style="flex:1;min-width:110px;"><div class="muted" style="font-size:0.68rem;">Beginn</div><input type="date" id="schuljahr-start" value="${state.schuljahr.start}" data-field="schuljahr-start" /></div>
      <div style="flex:1;min-width:110px;"><div class="muted" style="font-size:0.68rem;">Ende</div><input type="date" id="schuljahr-end" value="${state.schuljahr.end}" data-field="schuljahr-end" /></div>
    </div>
  </div>`;
  html += "</div>";
  return html;
}

function buildWeekPrintHtml(monday) {
  const week = ensureWeek(monday);
  const sw = computeSchoolWeekInfo(monday);
  const swLabel = sw.outside ? "" : sw.current === null ? " · Ferienwoche" : ` · Schulwoche ${sw.current} von ${sw.total}`;
  let html = `<h1>Wochenplan – KW ${getISOWeek(monday)}${swLabel} (${formatDateFull(monday)} – ${formatDateFull(addDays(monday, 4))})</h1>`;
  html += '<table class="print-week-table"><tr>';
  for (let i = 0; i < 5; i++) {
    const dISO = addDays(monday, i);
    const day = week.days[dISO];
    html += `<td><div class="print-day-header">${WEEKDAY_NAMES[i]}, ${formatDateShort(dISO)}</div>`;
    if (day.termine) html += `<div class="print-termine">${escapeHtml(day.termine)}</div>`;
    html += '<table class="print-stunden-table">';
    day.stunden.forEach((row) => {
      if (!row.klasse && !row.fach && !row.inhalt) return;
      const bg = getFachColor(row.fach);
      html += `<tr style="background:${bg};"><td>${escapeHtml(row.klasse)}</td><td><strong>${escapeHtml(row.fach)}</strong></td><td>${escapeHtml(row.inhalt)}</td></tr>`;
      if (row.material || row.sonstiges) html += `<tr style="background:${bg};"><td></td><td colspan="2" style="font-style:italic;">${escapeHtml(row.material)}${row.material && row.sonstiges ? " · " : ""}${escapeHtml(row.sonstiges)}</td></tr>`;
    });
    html += "</table></td>";
  }
  html += "</tr></table>";
  if (week.notizen) html += `<h3 style="margin-top:14px;">Notizen / Vorhaben</h3><p style="white-space:pre-wrap;font-size:0.85rem;">${escapeHtml(week.notizen)}</p>`;
  return html;
}
function printWeek() {
  let area = document.getElementById("print-area");
  if (!area) { area = document.createElement("div"); area.id = "print-area"; document.body.appendChild(area); }
  area.innerHTML = `<div class="print-doc">${buildWeekPrintHtml(ui.currentMonday)}</div>`;
  window.print();
}

function renderMain() {
  const monday = ui.currentMonday;
  ensureWeek(monday);
  if (!ui.selectedDay || mondayOfWeek(ui.selectedDay) !== monday) ui.selectedDay = monday;
  let html = renderWeekNav();
  html += `<div class="flex-row" style="gap:8px;margin-bottom:12px;">
    <button type="button" class="btn btn-outline" style="flex:1;" data-action="print-week">📄 Als PDF</button>
    <button type="button" class="btn btn-outline" style="flex:1;" data-action="copy-to-next-week">📋 In nächste Woche übernehmen</button>
  </div>`;
  html += renderFachLegende();
  html += renderDayTabs(monday);
  html += renderDayPanel(monday);
  const week = state.weeks[monday];
  html += '<div class="card" style="padding:14px;margin-bottom:14px;"><div class="section-title" style="margin-top:0;">📝 Notizen / Vorhaben für diese Woche</div>';
  html += `<textarea id="week-notizen" class="autosize" rows="3" data-field="notizen">${escapeHtml(week.notizen)}</textarea></div>`;
  html += renderFerienCard();
  html += renderWochenplanerBackupSection();
  return html;
}
function renderWochenplanerBackupSection() {
  let html = '<div class="card" style="padding:14px;"><div class="section-title" style="margin-top:0;">💾 Datensicherung</div>';
  html += '<p class="muted" style="font-size:0.8rem;margin-bottom:10px;">Diese Daten liegen nur auf diesem Gerät/Browser. Exportiere regelmäßig eine Sicherung, besonders vor einem Gerätewechsel.</p>';
  html += '<div class="flex-row"><button class="btn btn-primary" style="flex:1;" data-action="export-wochenplan">⬇️ Sichern</button><button class="btn btn-outline" style="flex:1;" data-action="import-wochenplan">⬆️ Wiederherstellen</button></div>';
  html += '<input type="file" id="import-wochenplan-input" accept="application/json" style="display:none;" data-change="import-wochenplan-file" />';
  html += '</div>';
  return html;
}
function autoResize(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}
function initAutosizeFields() {
  document.querySelectorAll("textarea.autosize").forEach(autoResize);
}
function render() {
  document.getElementById("app").innerHTML = renderHeader() + renderBanner() + `<main>${renderMain()}</main>`;
  initAutosizeFields();
}

function attachEvents() {
  const app = document.getElementById("app");
  app.addEventListener("input", (e) => {
    const el = e.target;
    if (el.tagName === "TEXTAREA" && el.classList.contains("autosize")) autoResize(el);
    if (el.dataset.field === "termine") {
      state.weeks[ui.currentMonday].days[el.dataset.day].termine = el.value;
      saveState();
      return;
    }
    if (el.id === "week-notizen") { state.weeks[ui.currentMonday].notizen = el.value; saveState(); return; }
    if (el.dataset.field === "schuljahr-start" || el.dataset.field === "schuljahr-end") {
      state.schuljahr[el.dataset.field === "schuljahr-start" ? "start" : "end"] = el.value;
      saveState();
      render();
      return;
    }
    if (el.dataset.field && el.dataset.day && el.dataset.idx !== undefined && ["klasse", "fach", "inhalt", "material", "sonstiges"].includes(el.dataset.field)) {
      const row = state.weeks[ui.currentMonday].days[el.dataset.day].stunden[Number(el.dataset.idx)];
      row[el.dataset.field] = el.value;
      saveState();
      if (el.dataset.field === "fach") {
        const tr = el.closest("tr");
        if (tr) tr.style.background = getFachColor(el.value);
      }
    }
  });
  app.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const a = el.dataset.action;
    switch (a) {
      case "prev-week": ui.currentMonday = addDays(ui.currentMonday, -7); ui.selectedDay = null; render(); break;
      case "next-week": ui.currentMonday = addDays(ui.currentMonday, 7); ui.selectedDay = null; render(); break;
      case "goto-today": ui.currentMonday = mondayOfWeek(todayISO()); ui.selectedDay = null; render(); break;
      case "select-day": ui.selectedDay = el.dataset.day; render(); break;
      case "add-stunde": ensureWeek(ui.currentMonday).days[el.dataset.day].stunden.push({ klasse: "", fach: "", inhalt: "", material: "", sonstiges: "" }); saveState(); render(); break;
      case "delete-stunde": ensureWeek(ui.currentMonday).days[el.dataset.day].stunden.splice(Number(el.dataset.idx), 1); saveState(); render(); break;
      case "add-ferien": {
        const name = document.getElementById("new-ferien-name").value.trim();
        const start = document.getElementById("new-ferien-start").value;
        const end = document.getElementById("new-ferien-end").value;
        if (!name || !start || !end) return;
        state.ferien.push({ id: Math.random().toString(36).slice(2), name, start, end });
        saveState();
        render();
        break;
      }
      case "delete-ferien": state.ferien = state.ferien.filter((f) => f.id !== el.dataset.id); saveState(); render(); break;
      case "print-week": printWeek(); break;
      case "copy-to-next-week": App_copyToNextWeek(); break;
      case "export-wochenplan": exportWochenplanData(); break;
      case "import-wochenplan": document.getElementById("import-wochenplan-input").click(); break;
    }
  });
  app.addEventListener("change", (e) => {
    const importEl = e.target.closest("[data-change='import-wochenplan-file']");
    if (importEl) { importWochenplanFile(importEl); return; }
    const fachEl = e.target.closest("[data-change='set-fach-select']");
    if (fachEl) {
      const row = state.weeks[ui.currentMonday].days[fachEl.dataset.day].stunden[Number(fachEl.dataset.idx)];
      if (fachEl.value === "__custom__") { row.customFach = true; row.fach = ""; }
      else { row.customFach = false; row.fach = fachEl.value; }
      saveState();
      render();
    }
  });
}
function App_copyToNextWeek() {
  const nextMonday = addDays(ui.currentMonday, 7);
  const nextWeek = ensureWeek(nextMonday);
  const hasContent = Object.values(nextWeek.days).some((d) => d.stunden.some((s) => s.klasse || s.fach || s.inhalt || s.material || s.sonstiges));
  if (hasContent && !confirm("Die nächste Woche enthält bereits Einträge in den Stunden. Trotzdem überschreiben?")) return;
  const currentWeek = ensureWeek(ui.currentMonday);
  for (let i = 0; i < 5; i++) {
    const fromDay = addDays(ui.currentMonday, i);
    const toDay = addDays(nextMonday, i);
    nextWeek.days[toDay].stunden = currentWeek.days[fromDay].stunden.map((s) => ({ ...s }));
  }
  saveState();
  alert("Der Stundenplan (Klasse/Fach/Inhalt/Material/Sonstiges) wurde in die nächste Woche übernommen. Tagestermine und Notizen bleiben davon unberührt.");
  render();
}
function exportWochenplanData() {
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wochenplaner-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function importWochenplanFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.weeks) throw new Error("ungültiges Format");
      if (!confirm("Import ersetzt alle aktuell gespeicherten Daten auf diesem Gerät durch die Datei. Fortfahren?")) return;
      state = {
        weeks: parsed.weeks || {},
        ferien: parsed.ferien || [],
        schuljahr: parsed.schuljahr || { start: "2026-08-24", end: "2027-06-30" },
      };
      saveState();
      render();
      alert("Daten erfolgreich wiederhergestellt.");
    } catch (err) {
      alert("Die Datei konnte nicht gelesen werden. Ist es eine gültige Wochenplaner-Sicherungsdatei?");
    }
    input.value = "";
  };
  reader.readAsText(file);
}
function init() {
  loadState();
  attachEvents();
  render();
}
document.addEventListener("DOMContentLoaded", init);
