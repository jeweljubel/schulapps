
/* ===== Notenheft – Offline-App ===== */

const NOTE_CATEGORIES = ["Hausaufgabe vergessen", "Material fehlt", "Verhalten", "Positives", "Sonstiges"];
const DEFAULT_KRITERIEN = ["Unterrichtsmaterial parat", "Meldet sich regelmäßig", "Inhaltlich gut", "Sprachlich gut", "Arbeitet konzentriert mit"];
const RATING_LEVELS = ["in vollem Umfang", "mehrheitlich", "teils", "wenig", "kaum/gar nicht"];
const TYP_LABEL = { muendlich: "Mündlich", schriftlich: "Schriftlich" };

// Notentendenz-Skala: „+" = 0,3 besser, „-" = 0,3 schlechter als die Vollnote.
// 1+ (0,7) steht für Zusatzpunkte/mehr als 100 % erreicht; 6 hat kein „-".
const GRADE_STEPS = [
  { value: 0.7, label: "1+" }, { value: 1, label: "1" }, { value: 1.3, label: "1-" },
  { value: 1.7, label: "2+" }, { value: 2, label: "2" }, { value: 2.3, label: "2-" },
  { value: 2.7, label: "3+" }, { value: 3, label: "3" }, { value: 3.3, label: "3-" },
  { value: 3.7, label: "4+" }, { value: 4, label: "4" }, { value: 4.3, label: "4-" },
  { value: 4.7, label: "5+" }, { value: 5, label: "5" }, { value: 5.3, label: "5-" },
  { value: 5.7, label: "6+" }, { value: 6, label: "6" },
];
function valueToLabel(value) {
  const step = GRADE_STEPS.find((s) => Math.abs(s.value - value) < 0.001);
  return step ? step.label : (value % 1 === 0 ? String(value) : value.toFixed(1));
}
function gradeStepButtonsHtml(action, extraAttrs, selectedValue) {
  return GRADE_STEPS.map((step) => {
    const sel = selectedValue !== undefined && Math.abs(step.value - selectedValue) < 0.001 ? " selected" : "";
    return `<button type="button" class="grade-btn${sel}" data-action="${action}" data-value="${step.value}" ${extraAttrs || ""}>${step.label}</button>`;
  }).join("");
}

// ---------- Fotos ----------
let pendingGradePhoto = null;
let pendingKriterienRatings = {};
let pendingNotePhoto = null;

function readAndCompressImage(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1000;
      let width = img.width, height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        else { width = Math.round(width * (maxDim / height)); height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function renderPhotoThumb(dataUrl, altLabel) {
  if (!dataUrl) return "";
  return `<img src="${dataUrl}" alt="${escapeHtml(altLabel || "Foto")}" class="photo-thumb" data-action="view-photo-full" />`;
}
function renderPhotoBlock(dataUrl, context) {
  if (!dataUrl) return "";
  let ctxAttrs;
  if (context.type === "grade") ctxAttrs = `data-context="grade" data-student="${context.studentId}" data-subject="${context.subjectId}" data-entry="${context.entryId}"`;
  else if (context.type === "attendance") ctxAttrs = `data-context="attendance" data-student="${context.studentId}" data-entry="${context.entryId}"`;
  else if (context.type === "list") ctxAttrs = `data-context="list" data-list="${context.listId}" data-student="${context.studentId}"`;
  else ctxAttrs = `data-context="note" data-student="${context.studentId}" data-note="${context.noteId}"`;
  return `<span class="photo-block" ${ctxAttrs}>${renderPhotoThumb(dataUrl)}<button type="button" class="icon-btn" data-action="download-photo" title="Auf dem Gerät speichern">⬇️</button><button type="button" class="icon-btn" data-action="remove-photo-field" title="Foto aus der App entfernen (Speicherplatz freigeben)">🗑📷</button></span>`;
}

let state = { classes: [], grades: {}, notes: {}, lists: [], attendance: {}, mitarbeitAuswahl: {}, mitarbeitKriterien: DEFAULT_KRITERIEN.slice() };
let ui = {
  view: "erfassen", selClass: null, selSubject: null, selStudent: null, entryStudent: null,
  openSubjectId: null, verwaltenActiveClassId: null,
  erfassenMode: "einzeln", gespraechMode: "einzeln", openListId: null,
  attDate: todayISO(),
};
let currentGradeValue = 2;

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function dateToLocalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayISO() { return dateToLocalISO(new Date()); }
function formatDate(iso) { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; }
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])); }

function defaultBereiche() {
  return [
    { id: uid(), name: "Mündliche Mitarbeit", typ: "muendlich", percent: 50 },
    { id: uid(), name: "Schriftliche Arbeiten", typ: "schriftlich", percent: 50 },
  ];
}
function deutschBereiche() {
  return [
    { id: uid(), name: "Rechtschreiben", typ: "schriftlich", percent: 15 },
    { id: uid(), name: "Grammatik", typ: "schriftlich", percent: 15 },
    { id: uid(), name: "Lesen", typ: "muendlich", percent: 15 },
    { id: uid(), name: "Texte verfassen", typ: "schriftlich", percent: 35 },
    { id: uid(), name: "Zuhören/Sprechen", typ: "muendlich", percent: 20 },
  ];
}
function computeBereichAvg(entries) {
  if (!entries || entries.length === 0) return null;
  let sumW = 0, sumV = 0;
  entries.forEach((e) => { const w = e.weight && e.weight > 0 ? e.weight : 1; sumW += w; sumV += w * e.value; });
  return sumV / sumW;
}
function computeSubjectStats(entriesForSubject, subject) {
  const bereiche = subject.bereiche;
  const kaPercent = subject.kaPercent || 0;
  const allEntries = entriesForSubject || [];
  const useKaSplit = kaPercent > 0;
  const kaEntries = useKaSplit ? allEntries.filter((e) => e.istKlassenarbeit) : [];
  const bereichEntries = useKaSplit ? allEntries.filter((e) => !e.istKlassenarbeit) : allEntries;

  const byBereich = bereiche.map((b) => {
    const entries = bereichEntries.filter((e) => e.bereichId === b.id);
    return { ...b, avg: computeBereichAvg(entries), count: entries.length };
  });
  const withData = byBereich.filter((b) => b.avg !== null);
  const percentSum = withData.reduce((s, b) => s + (b.percent || 0), 0);
  let nonKaOverall = null;
  if (percentSum > 0) nonKaOverall = withData.reduce((s, b) => s + b.avg * b.percent, 0) / percentSum;

  let overall = null, kaAvg = null;
  if (useKaSplit) {
    kaAvg = computeBereichAvg(kaEntries);
    if (kaAvg !== null && nonKaOverall !== null) overall = kaAvg * (kaPercent / 100) + nonKaOverall * ((100 - kaPercent) / 100);
    else if (kaAvg !== null) overall = kaAvg;
    else overall = nonKaOverall;
  } else {
    overall = nonKaOverall;
  }
  const suggested = overall !== null ? Math.min(6, Math.max(1, Math.round(overall))) : null;
  return { byBereich, overall, suggested, kaAvg, kaCount: kaEntries.length, kaPercent, useKaSplit };
}

// ---------- Beispieldaten ----------
const STORAGE_KEY = "notenheft-offline-v2";
function normalizeLoadedClasses(classes) {
  return (classes || []).map((c) => ({
    ...c,
    subjects: (c.subjects || []).map((s) => ({
      ...s,
      bereiche: s.bereiche && s.bereiche.length ? s.bereiche : defaultBereiche(),
      kaPercent: s.kaPercent || 0,
    })),
  }));
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = {
        classes: normalizeLoadedClasses(parsed.classes),
        grades: parsed.grades || {},
        notes: parsed.notes || {},
        lists: parsed.lists || [],
        attendance: parsed.attendance || {},
        mitarbeitAuswahl: parsed.mitarbeitAuswahl || {},
        mitarbeitKriterien: parsed.mitarbeitKriterien && parsed.mitarbeitKriterien.length ? parsed.mitarbeitKriterien : DEFAULT_KRITERIEN.slice(),
      };
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

// ---------- Rendering ----------
function renderGradeChip(value, withDelete, studentId, subjectId, entryId, isKA) {
  const cls = value <= 2 ? "low" : value <= 4 ? "mid" : "high";
  const display = valueToLabel(value);
  const del = withDelete ? `<button data-action="delete-grade" data-student="${studentId}" data-subject="${subjectId}" data-entry="${entryId}">✕</button>` : "";
  return `<span class="chip ${cls}${isKA ? " ka" : ""}" ${isKA ? 'title="Klassenarbeit"' : ""}>${display}${del}</span>`;
}
function renderHeader() { return `<header class="app-header"><span class="title serif">🎓 Notenheft</span><span class="save-indicator">🔒 Lokal gespeichert</span></header>`; }
function renderBanner() { return ""; }
function renderNav() {
  const tabs = [["erfassen", "✏️", "Erfassen"], ["anwesenheit", "🗓️", "Anwesenh."], ["uebersicht", "📊", "Übersicht"], ["gespraech", "💬", "Gespräch"], ["listen", "📋", "Listen"], ["verwalten", "⚙️", "Verwalten"]];
  return `<nav class="app-nav">${tabs.map(([key, icon, label]) => `<button class="${ui.view === key ? "active" : ""}" data-action="set-view" data-view="${key}"><span>${icon}</span><span>${label}</span></button>`).join("")}</nav>`;
}
function renderFooter() { return `<footer class="app-footer">Diese Daten liegen ausschließlich lokal in diesem Browser auf diesem Gerät – nicht in der Cloud. Erstelle regelmäßig eine Sicherung unter „Verwalten".</footer>`; }
function renderClassSubjectPicker() {
  let html = '<div class="gap-sm" style="margin-bottom:16px;"><div class="pill-row">';
  state.classes.forEach((c) => { html += `<button class="pill ${c.id === ui.selClass ? "active" : ""}" data-action="set-class" data-id="${c.id}">${escapeHtml(c.name)}</button>`; });
  html += "</div>";
  const current = state.classes.find((c) => c.id === ui.selClass);
  if (current && current.subjects.length > 0) {
    html += '<div class="pill-row">';
    current.subjects.forEach((s) => { html += `<button class="pill small ${s.id === ui.selSubject ? "active" : ""}" data-action="set-subject" data-id="${s.id}">${escapeHtml(s.name)}</button>`; });
    html += "</div>";
  }
  html += "</div>";
  return html;
}

// --- Einzel-Erfassung (bestehend) ---
function renderKriterienChecklist() {
  const kriterien = state.mitarbeitKriterien && state.mitarbeitKriterien.length ? state.mitarbeitKriterien : DEFAULT_KRITERIEN;
  let html = '<div class="card" style="padding:10px 12px;">';
  html += '<div class="field-label" style="margin-bottom:6px;">Kriterien der mündlichen Mitarbeit (optional)</div>';
  kriterien.forEach((krit, idx) => {
    html += `<div style="margin-bottom:8px;"><div style="font-size:0.8rem;margin-bottom:4px;">${escapeHtml(krit)}</div><div class="flex-row wrap" style="gap:4px;">`;
    RATING_LEVELS.forEach((level) => {
      html += `<button type="button" class="pill small kriterium-btn" data-action="set-kriterium-rating" data-kriterium-index="${idx}" data-level="${escapeHtml(level)}">${escapeHtml(level)}</button>`;
    });
    html += "</div></div>";
  });
  html += '<div class="muted" style="font-size:0.68rem;">Dient nur als Gedächtnisstütze/Begründung zur Note – wird nicht automatisch verrechnet.</div>';
  html += "</div>";
  return html;
}
function renderGradeNoteSnippet(entry) {
  if (!entry.notiz) return "";
  const preview = entry.notiz.length > 40 ? entry.notiz.slice(0, 40) + "…" : entry.notiz;
  return `<details style="margin-top:4px;"><summary style="font-size:0.72rem;color:var(--muted);cursor:pointer;">📝 ${escapeHtml(preview)}</summary><div style="font-size:0.75rem;margin-top:4px;">${escapeHtml(entry.notiz)}</div></details>`;
}
function renderGradeForm(student, subject, entries) {
  if (subject.bereiche.length === 0) return '<div class="grade-form"><p class="muted">Keine Bereiche angelegt.</p></div>';
  currentGradeValue = 2;
  pendingKriterienRatings = {};
  const bereichOptions = subject.bereiche.map((b, i) => `<option value="${b.id}" data-typ="${b.typ}" ${i === 0 ? "selected" : ""}>${escapeHtml(b.name)} · ${TYP_LABEL[b.typ]} · ${b.percent}%</option>`).join("");
  let html = '<div class="grade-form">';
  html += `<div><div class="field-label">Bereich</div><select id="gf-bereich" class="field" data-change="refresh-mitarbeit-kriterien">${bereichOptions}</select></div>`;
  html += '<div><div class="field-label">Note</div><div class="grade-btn-row">';
  html += gradeStepButtonsHtml("set-grade-value", "", 2);
  html += `</div><div class="muted" style="font-size:0.75rem;margin-top:4px;">Gewählt: <span class="gf-value-display">2</span></div></div>`;
  html += `<div id="gf-kriterien-block" style="${subject.bereiche[0] && subject.bereiche[0].typ === "muendlich" ? "" : "display:none;"}">${renderKriterienChecklist()}</div>`;
  html += `<div><div class="field-label">Bezeichnung (optional)</div><input id="gf-label" class="field" type="text" style="width:100%;" placeholder="z. B. Diktat Einheit 3 …" /></div>`;
  html += `<label class="flex-row" style="align-items:center;gap:6px;font-size:0.85rem;cursor:pointer;"><input type="checkbox" id="gf-ist-klassenarbeit" style="width:16px;height:16px;" /> Das ist eine Klassenarbeit (roter Rahmen, eigener Anteil an der Gesamtnote)</label>`;
  html += `<div><div class="field-label">Notiz für dich (optional)</div><textarea id="gf-notiz" class="field" style="width:100%;min-height:50px;" placeholder="z. B. besonders schön formuliert, oder: nicht abgegeben, abgeschrieben …"></textarea></div>`;
  html += `<div><div class="field-label">Foto (optional, z. B. Test als Beweis)</div><input type="file" accept="image/*" capture="environment" id="gf-photo-input" style="display:none;" data-change="capture-grade-photo" /><button type="button" class="btn btn-outline" data-action="trigger-grade-photo">📷 Foto aufnehmen</button><div id="gf-photo-preview" style="margin-top:6px;"></div><div class="muted" style="font-size:0.68rem;margin-top:4px;">Tipp: Wenn möglich lieber das Beweisstück (Zettel, Test) fotografieren als das Gesicht des Kindes.</div></div>`;
  html += `<div class="flex-row" style="align-items:flex-end;"><div style="width:100px;"><div class="field-label">Gewichtung</div><input id="gf-weight" class="field" type="number" min="0.1" step="0.1" value="1" style="width:100%;" /></div><div class="muted" style="font-size:0.7rem;padding-bottom:6px;">z. B. Klassenarbeit = 2, Minitest = 0,5</div></div>`;
  html += `<button class="btn btn-accent btn-block" data-action="save-grade" data-student="${student.id}" data-subject="${subject.id}">➕ Note speichern</button>`;
  if (entries.length > 0) {
    html += '<div><div class="field-label" style="margin-top:6px;">Bisherige Einträge</div><div class="gap-sm">';
    entries.forEach((e) => {
      const b = subject.bereiche.find((x) => x.id === e.bereichId);
      html += `<div style="background:#fff;border:1px solid var(--card-border);border-radius:8px;padding:6px 8px;font-size:0.75rem;">`;
      html += `<div class="flex-row" style="justify-content:space-between;align-items:center;">`;
      html += `<span class="flex-row wrap" style="gap:6px;align-items:center;">${renderGradeChip(e.value, false, student.id, subject.id, e.id, e.istKlassenarbeit)}${e.photo ? renderPhotoBlock(e.photo, { type: "grade", studentId: student.id, subjectId: subject.id, entryId: e.id }) : ""}`;
      html += b ? `<span class="badge ${b.typ}">${TYP_LABEL[b.typ]}</span><span class="muted">${escapeHtml(b.name)}${e.label ? " · " + escapeHtml(e.label) : ""} · ${formatDate(e.date)}</span>` : `<span class="muted-light">Bereich gelöscht</span>`;
      html += `</span><span class="flex-row" style="gap:4px;"><button class="icon-btn" data-action="edit-grade-notiz" data-student="${student.id}" data-subject="${subject.id}" data-entry="${e.id}" title="Notiz hinzufügen/bearbeiten">📝${e.notiz ? "" : "+"}</button><button class="icon-btn" data-action="delete-grade" data-student="${student.id}" data-subject="${subject.id}" data-entry="${e.id}">🗑</button></span></div>`;
      if (e.kriterien) {
        html += `<details style="margin-top:4px;"><summary style="font-size:0.72rem;color:var(--muted);cursor:pointer;">📋 Kriterien anzeigen</summary><div style="font-size:0.72rem;margin-top:4px;">${Object.entries(e.kriterien).map(([k, v]) => `${escapeHtml(k)}: <strong>${escapeHtml(v)}</strong>`).join("<br>")}</div></details>`;
      }
      if (e.notiz) html += renderGradeNoteSnippet(e);
      html += `</div>`;
    });
    html += "</div></div>";
  }
  html += "</div>";
  return html;
}
function renderEinzelErfassung(current, subject) {
  let html = '<div class="card" style="overflow:hidden;">';
  current.students.forEach((s) => {
    const entries = (state.grades[s.id] && state.grades[s.id][subject.id]) || [];
    const stats = computeSubjectStats(entries, subject);
    const isOpen = ui.entryStudent === s.id;
    html += '<div class="student-row">';
    html += `<button class="student-row-header" data-action="toggle-entry-student" data-id="${s.id}">`;
    html += `<div><div style="font-weight:500;font-size:0.9rem;">${escapeHtml(s.name)}</div><div class="flex-row wrap" style="margin-top:4px;gap:4px;">`;
    html += entries.length === 0 ? '<span class="muted-light" style="font-size:0.75rem;">Noch keine Note</span>' : entries.map((e) => renderGradeChip(e.value, false, undefined, undefined, undefined, e.istKlassenarbeit)).join("");
    html += `</div></div><div class="flex-row" style="align-items:center;gap:8px;">`;
    if (stats.overall !== null) html += `<span class="muted" style="font-size:0.75rem;">Ø ${stats.overall.toFixed(1)}</span>`;
    html += `<span style="color:#8a8578;">${isOpen ? "▾" : "▸"}</span></div></button>`;
    if (isOpen) html += renderGradeForm(s, subject, entries);
    html += "</div>";
  });
  html += "</div>";
  return html;
}

// --- Klassen-Sammeleingabe (neu) ---
function findBatchEntry(studentId, subjectId, bereichId, label, date) {
  const entries = (state.grades[studentId] && state.grades[studentId][subjectId]) || [];
  return entries.find((e) => e.bereichId === bereichId && e.label === label && e.date === date);
}
function renderKlasseErfassung(current, subject) {
  const bereichOptions = subject.bereiche.map((b) => `<option value="${b.id}">${escapeHtml(b.name)} · ${TYP_LABEL[b.typ]} · ${b.percent}%</option>`).join("");
  let html = '<div class="card" style="padding:14px;">';
  html += '<div class="batch-config">';
  html += `<div><div class="field-label">Bereich</div><select id="batch-bereich" class="field" data-change="refresh-batch-highlights">${bereichOptions}</select></div>`;
  html += `<div><div class="field-label">Bezeichnung (z. B. „Diktat Einheit 4“)</div><input id="batch-label" class="field" type="text" data-change="refresh-batch-highlights" placeholder="Wofür gab es die Note?" /></div>`;
  html += `<div class="flex-row"><div class="flex-1"><div class="field-label">Datum</div><input id="batch-date" class="field" type="date" value="${todayISO()}" data-change="refresh-batch-highlights" /></div><div style="width:90px;"><div class="field-label">Gewichtung</div><input id="batch-weight" class="field" type="number" min="0.1" step="0.1" value="1" /></div></div>`;
  html += '</div>';
  html += `<div class="batch-progress" id="batch-progress-text"></div>`;
  html += '<div>';
  current.students.forEach((s) => {
    html += `<div class="batch-row" data-student="${s.id}">`;
    html += `<span class="batch-name">${escapeHtml(s.name)}</span>`;
    html += '<div class="grade-btn-row">';
    html += gradeStepButtonsHtml("batch-set-grade", `data-student="${s.id}" data-subject="${subject.id}"`);
    html += '</div></div>';
  });
  html += '</div></div>';
  return html;
}
function refreshBatchHighlights() {
  const bereichSelect = document.getElementById("batch-bereich");
  if (!bereichSelect) return;
  const bereichId = bereichSelect.value;
  const label = document.getElementById("batch-label").value.trim();
  const date = document.getElementById("batch-date").value || todayISO();
  let doneCount = 0;
  const rows = document.querySelectorAll(".batch-row");
  rows.forEach((row) => {
    const studentId = row.dataset.student;
    const btnAny = row.querySelector("[data-action='batch-set-grade']");
    const subjectId = btnAny ? btnAny.dataset.subject : null;
    const existing = subjectId ? findBatchEntry(studentId, subjectId, bereichId, label, date) : null;
    row.dataset.currentValue = existing ? existing.value : "";
    row.classList.toggle("done", !!existing);
    row.querySelectorAll(".grade-btn").forEach((b) => b.classList.toggle("selected", existing && parseFloat(b.dataset.value) === existing.value));
    if (existing) doneCount++;
  });
  const progressEl = document.getElementById("batch-progress-text");
  if (progressEl) progressEl.textContent = `${doneCount}/${rows.length} erfasst`;
}
function renderErfassen() {
  let html = renderClassSubjectPicker();
  const current = state.classes.find((c) => c.id === ui.selClass);
  if (!current) return html;
  html += `<button type="button" class="btn btn-outline" style="margin-bottom:12px;" data-action="show-mitarbeit-popup">🎲 Heutige Mitarbeits-Auswahl anzeigen</button>`;
  const subject = current.subjects.find((s) => s.id === ui.selSubject);
  if (!subject) return html + '<p class="muted">Bitte zuerst ein Fach auswählen.</p>';
  html += `<div class="mode-toggle"><button class="${ui.erfassenMode === "einzeln" ? "active" : ""}" data-action="set-erfassen-mode" data-mode="einzeln">👤 Einzeln</button><button class="${ui.erfassenMode === "klasse" ? "active" : ""}" data-action="set-erfassen-mode" data-mode="klasse">👥 Ganze Klasse</button></div>`;
  html += ui.erfassenMode === "klasse" ? renderKlasseErfassung(current, subject) : renderEinzelErfassung(current, subject);
  return html;
}

function renderBereichBreakdown(subject, entries) {
  const stats = computeSubjectStats(entries, subject);
  let html = '<div class="gap-sm">';
  if (stats.useKaSplit) {
    html += `<div class="bereich-row" style="background:var(--grade-high-bg);color:var(--grade-high-text);"><span>📕 Klassenarbeiten <span style="opacity:0.8;">${stats.kaPercent}%</span></span><span>${stats.kaAvg !== null ? `Ø ${stats.kaAvg.toFixed(1)} (${stats.kaCount})` : "–"}</span></div>`;
  }
  stats.byBereich.forEach((b) => {
    html += `<div class="bereich-row"><span class="flex-row" style="gap:6px;align-items:center;">${escapeHtml(b.name)} <span class="badge ${b.typ}">${TYP_LABEL[b.typ]}</span> <span class="muted">${b.percent}%</span></span><span style="color:#5a5648;">${b.avg !== null ? `Ø ${b.avg.toFixed(1)} (${b.count})` : "–"}</span></div>`;
  });
  html += `<div class="bereich-row total"><span>Gesamt</span><span>${stats.overall !== null ? `Ø ${stats.overall.toFixed(1)} · Vorschlag ${stats.suggested}` : "keine Noten"}</span></div>`;
  html += "</div>";
  return html;
}
function renderUebersicht() {
  let html = renderClassSubjectPicker();
  const current = state.classes.find((c) => c.id === ui.selClass);
  const subject = current ? current.subjects.find((s) => s.id === ui.selSubject) : null;
  if (current && subject) {
    html += `<button type="button" class="btn btn-outline btn-block" style="margin-bottom:12px;" data-action="print-uebersicht">📄 Klassenliste als PDF exportieren</button>`;
    html += '<div class="gap-sm">';
    current.students.forEach((s) => {
      const entries = (state.grades[s.id] && state.grades[s.id][subject.id]) || [];
      const stats = computeSubjectStats(entries, subject);
      html += `<details class="card student-detail"><summary><span style="font-weight:500;">${escapeHtml(s.name)}</span><span class="flex-row" style="gap:12px;font-size:0.78rem;color:#5a5648;"><span>${entries.length} Note(n)</span><span style="font-weight:600;">${stats.overall !== null ? `Ø ${stats.overall.toFixed(1)} · Note ${stats.suggested}` : "–"}</span></span></summary>`;
      html += '<div class="detail-body"><div class="flex-row wrap" style="gap:4px;">';
      html += entries.map((e) => renderGradeChip(e.value, true, s.id, subject.id, e.id, e.istKlassenarbeit) + (e.photo ? renderPhotoBlock(e.photo, { type: "grade", studentId: s.id, subjectId: subject.id, entryId: e.id }) : "")).join("");
      html += "</div>";
      const noted = entries.filter((e) => e.notiz);
      if (noted.length > 0) {
        html += '<div class="gap-sm" style="margin-top:2px;">';
        noted.forEach((e) => {
          html += `<div style="display:flex;align-items:flex-start;gap:4px;">${renderGradeNoteSnippet(e)}<button class="icon-btn" style="flex-shrink:0;" data-action="edit-grade-notiz" data-student="${s.id}" data-subject="${subject.id}" data-entry="${e.id}">✏️</button></div>`;
        });
        html += "</div>";
      }
      html += renderBereichBreakdown(subject, entries);
      html += "</div></details>";
    });
    html += "</div>";
  }
  return html;
}

// --- Gespräch: Einzel + Schnellnotiz ---
function renderNotesSection(student) {
  const notes = state.notes[student.id] || [];
  const catOptions = NOTE_CATEGORIES.map((c) => `<option>${c}</option>`).join("");
  let html = "<div>";
  html += '<div class="section-title">📝 Notizen für Elterngespräche</div>';
  html += `<div class="card" style="padding:12px;margin-bottom:12px;"><div class="gap-sm">`;
  html += `<select id="note-category" class="field" style="width:100%;">${catOptions}</select>`;
  html += `<textarea id="note-text" placeholder="z. B. Hausaufgaben zwei Mal vergessen (03.02., 10.02.)" style="min-height:60px;"></textarea>`;
  html += `<div><input type="file" accept="image/*" capture="environment" id="note-photo-input" style="display:none;" data-change="capture-note-photo" /><button type="button" class="btn btn-outline" data-action="trigger-note-photo">📷 Foto aufnehmen</button><div id="note-photo-preview" style="margin-top:6px;"></div><div class="muted" style="font-size:0.68rem;margin-top:4px;">Tipp: Wenn möglich lieber das Beweisstück fotografieren als das Gesicht des Kindes.</div></div>`;
  html += `<button class="btn btn-primary btn-block" data-action="save-note" data-student="${student.id}">➕ Notiz speichern</button>`;
  html += `</div></div><div class="gap-sm">`;
  html += notes.length === 0 ? '<p class="muted-light" style="font-size:0.78rem;">Noch keine Notizen.</p>' : "";
  notes.forEach((n) => { html += `<div class="note-item"><div><div class="note-meta">${formatDate(n.date)} · ${escapeHtml(n.category)}</div><div>${escapeHtml(n.text)}</div>${n.photo ? `<div style="margin-top:4px;">${renderPhotoBlock(n.photo, { type: "note", studentId: student.id, noteId: n.id })}</div>` : ""}</div><button class="icon-btn" data-action="delete-note" data-student="${student.id}" data-note="${n.id}">🗑</button></div>`; });
  html += "</div></div>";
  return html;
}
function renderEinzelGespraech(current) {
  const student = current.students.find((s) => s.id === ui.selStudent);
  if (!student) {
    let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    current.students.forEach((s) => { html += `<button class="card" style="padding:12px;text-align:left;font-size:0.88rem;border:1px solid var(--card-border);cursor:pointer;" data-action="set-student" data-id="${s.id}">${escapeHtml(s.name)}</button>`; });
    html += "</div>";
    return html;
  }
  let html = `<button data-action="back-to-class" style="background:none;border:none;color:#8a8578;font-size:0.75rem;cursor:pointer;margin-bottom:6px;padding:0;">← zurück zur Klasse</button>`;
  html += `<h3 class="serif" style="margin:0 0 12px;">${escapeHtml(student.name)}</h3>`;
  html += `<button type="button" class="btn btn-outline btn-block" style="margin-bottom:12px;" data-action="print-student" data-student="${student.id}">📄 Als PDF exportieren (z. B. für Elterngespräch)</button>`;
  const att = computeAttendanceSummary(student.id);
  html += `<div class="card" style="padding:10px 12px;margin-bottom:12px;"><div style="font-weight:500;font-size:0.88rem;margin-bottom:6px;">🗓️ Anwesenheit</div>`;
  html += `<div class="bereich-row"><span>Fehltage entschuldigt</span><span>${att.tageE}</span></div>`;
  html += `<div class="bereich-row"><span>Fehltage unentschuldigt</span><span>${att.tageU}</span></div>`;
  html += `<div class="bereich-row"><span>Fehlstunden entschuldigt/unentschuldigt</span><span>${att.stundenE} / ${att.stundenU}</span></div>`;
  html += `<div class="bereich-row"><span>Verspätungen</span><span>${att.verspCount} (${att.verspMinuten} Min. gesamt)</span></div></div>`;
  html += '<div class="gap-sm" style="margin-bottom:20px;">';
  current.subjects.forEach((sub) => {
    const entries = (state.grades[student.id] && state.grades[student.id][sub.id]) || [];
    const noted = entries.filter((e) => e.notiz);
    html += `<div class="card" style="padding:10px 12px;"><div style="font-weight:500;font-size:0.88rem;margin-bottom:6px;">${escapeHtml(sub.name)}</div>${renderBereichBreakdown(sub, entries)}`;
    if (noted.length > 0) {
      html += '<div class="gap-sm" style="margin-top:8px;">';
      noted.forEach((e) => {
        html += `<div style="display:flex;align-items:flex-start;gap:4px;">${renderGradeChip(e.value, false, undefined, undefined, undefined, e.istKlassenarbeit)} ${renderGradeNoteSnippet(e)}<button class="icon-btn" style="flex-shrink:0;" data-action="edit-grade-notiz" data-student="${student.id}" data-subject="${sub.id}" data-entry="${e.id}">✏️</button></div>`;
      });
      html += "</div>";
    }
    html += `</div>`;
  });
  html += "</div>";
  html += renderNotesSection(student);
  return html;
}
function noteMatches(studentId, category, text, date) {
  return (state.notes[studentId] || []).some((n) => n.category === category && n.text === text && n.date === date);
}
function renderSchnellNotiz(current) {
  const catOptions = NOTE_CATEGORIES.map((c) => `<option>${c}</option>`).join("");
  const today = todayISO();
  let html = '<div class="card" style="padding:14px;">';
  html += `<div class="gap-sm" style="margin-bottom:12px;">`;
  html += `<div><div class="field-label">Kategorie</div><select id="quicknote-category" class="field" data-change="refresh-quicknote-chips">${catOptions}</select></div>`;
  html += `<div><div class="field-label">Bezeichnung (optional, für alle gleich)</div><input id="quicknote-text" class="field" type="text" data-change="refresh-quicknote-chips" placeholder="z. B. HA S. 34 nicht gemacht" /></div>`;
  html += `</div><p class="muted" style="font-size:0.75rem;margin:0 0 10px;">Auf ein Kind tippen, um die Notiz für heute (${formatDate(today)}) hinzuzufügen. Nochmal tippen entfernt sie wieder.</p>`;
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;" id="quicknote-grid">';
  current.students.forEach((s) => {
    html += `<button type="button" class="chip-toggle" data-action="toggle-quicknote" data-student="${s.id}">${escapeHtml(s.name)}</button>`;
  });
  html += "</div></div>";
  return html;
}
function refreshQuickNoteChips() {
  const category = document.getElementById("quicknote-category")?.value;
  const text = document.getElementById("quicknote-text")?.value.trim();
  const today = todayISO();
  document.querySelectorAll("#quicknote-grid .chip-toggle").forEach((chip) => {
    const studentId = chip.dataset.student;
    chip.classList.toggle("active", noteMatches(studentId, category, text, today));
  });
}
function renderGespraech() {
  let html = '<div class="pill-row" style="margin-bottom:8px;">';
  state.classes.forEach((c) => { html += `<button class="pill ${c.id === ui.selClass ? "active" : ""}" data-action="set-class" data-id="${c.id}">${escapeHtml(c.name)}</button>`; });
  html += "</div>";
  const current = state.classes.find((c) => c.id === ui.selClass);
  html += `<div class="mode-toggle"><button class="${ui.gespraechMode === "einzeln" ? "active" : ""}" data-action="set-gespraech-mode" data-mode="einzeln">👤 Einzelgespräch</button><button class="${ui.gespraechMode === "schnell" ? "active" : ""}" data-action="set-gespraech-mode" data-mode="schnell">⚡ Schnellnotiz Klasse</button></div>`;
  html += ui.gespraechMode === "schnell" ? renderSchnellNotiz(current) : renderEinzelGespraech(current);
  return html;
}

// --- Listen (Abgabe-Tracker) ---
function renderListEntryPhotoControls(list, student, entry) {
  let html = '<div class="att-detail">';
  html += `<input type="file" accept="image/*" capture="environment" id="list-photo-input-${list.id}-${student.id}" style="display:none;" data-change="capture-list-photo" data-list="${list.id}" data-student="${student.id}" />`;
  html += `<button type="button" class="icon-btn" data-action="trigger-list-photo" data-list="${list.id}" data-student="${student.id}" title="Zettel fotografieren">📷 Zettel</button>`;
  if (entry.photo) html += renderPhotoBlock(entry.photo, { type: "list", listId: list.id, studentId: student.id });
  html += "</div>";
  return html;
}
function renderListChoiceSummary(list, current) {
  const counts = {};
  list.options.forEach((opt) => { counts[opt] = 0; });
  let noResponse = 0;
  current.students.forEach((s) => {
    const e = list.entries[s.id];
    if (e && e.value && counts.hasOwnProperty(e.value)) counts[e.value]++;
    else if (!e) noResponse++;
  });
  let html = '<div style="padding:0 14px 10px;" class="gap-sm">';
  html += '<div class="field-label">Übersicht</div>';
  list.options.forEach((opt) => { html += `<div class="bereich-row"><span>${escapeHtml(opt)}</span><span>${counts[opt]}</span></div>`; });
  html += `<div class="bereich-row"><span>Noch keine Rückmeldung</span><span>${noResponse}</span></div>`;
  html += "</div>";
  return html;
}
function renderListen() {
  let html = '<div class="pill-row" style="margin-bottom:12px;">';
  state.classes.forEach((c) => { html += `<button class="pill ${c.id === ui.selClass ? "active" : ""}" data-action="set-class" data-id="${c.id}">${escapeHtml(c.name)}</button>`; });
  html += "</div>";
  const current = state.classes.find((c) => c.id === ui.selClass);
  const lists = state.lists.filter((l) => l.classId === current.id);
  html += '<div class="gap-sm" style="margin-bottom:14px;">';
  if (lists.length === 0) html += '<p class="muted-light" style="font-size:0.8rem;">Noch keine Liste für diese Klasse.</p>';
  lists.forEach((list) => {
    const total = current.students.length;
    const respondedCount = current.students.filter((s) => list.entries[s.id]).length;
    const isOpen = ui.openListId === list.id;
    const pct = total > 0 ? Math.round((respondedCount / total) * 100) : 0;
    const wordAbgegeben = list.responseType === "choice" ? "zurückgemeldet" : "abgegeben";
    html += `<div class="card">`;
    html += `<div class="list-card-header" data-action="toggle-list" data-id="${list.id}">`;
    html += `<div><div style="font-weight:500;font-size:0.9rem;">${escapeHtml(list.name)}</div><div class="muted" style="font-size:0.75rem;">${respondedCount}/${total} ${wordAbgegeben} · seit ${formatDate(list.createdDate)}</div><div class="progress-bar" style="width:160px;"><div class="progress-bar-fill" style="width:${pct}%;"></div></div></div>`;
    html += `<button class="icon-btn" data-action="print-list" data-id="${list.id}" title="Als PDF exportieren">📄</button><button class="icon-btn" data-action="delete-list" data-id="${list.id}" data-name="${escapeHtml(list.name)}">🗑</button>`;
    html += `</div>`;
    if (isOpen) {
      if (list.responseType === "choice") html += renderListChoiceSummary(list, current);
      html += '<div style="padding:0 14px 14px;">';
      current.students.forEach((s) => {
        const entry = list.entries[s.id];
        html += `<div class="list-entry-row">`;
        if (list.responseType === "choice") {
          html += `<div class="att-row-main"><span class="batch-name">${escapeHtml(s.name)}</span></div><div class="flex-row wrap" style="gap:6px;margin-top:4px;">`;
          list.options.forEach((opt) => {
            const active = entry && entry.value === opt;
            html += `<button type="button" class="pill small ${active ? "active" : ""}" data-action="list-set-choice" data-list="${list.id}" data-student="${s.id}" data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`;
          });
          html += `</div>`;
        } else {
          const done = !!entry;
          html += `<div class="att-row-main"><span class="batch-name">${escapeHtml(s.name)}</span><button type="button" class="chip-toggle small ${done ? "done" : ""}" data-action="list-toggle-checkbox" data-list="${list.id}" data-student="${s.id}">${done ? "✓ abgegeben" : "abgegeben?"}</button></div>`;
        }
        if (entry) html += renderListEntryPhotoControls(list, s, entry);
        html += `</div>`;
      });
      html += "</div>";
    }
    html += "</div>";
  });
  html += "</div>";
  html += `<div class="card" style="padding:14px;"><div class="field-label">Neue Liste für ${escapeHtml(current.name)}</div>`;
  html += `<div class="gap-sm" style="margin-top:6px;">`;
  html += `<input id="new-list-name" class="field" style="width:100%;" type="text" placeholder="z. B. Ausflugsgeld, Betreuung Wandertag …" />`;
  html += `<select id="new-list-type" class="field" style="width:100%;"><option value="checkbox">Einfach (abgegeben ja/nein)</option><option value="choice">Mit Auswahlmöglichkeiten (z. B. „wird betreut / geht nach Hause / wird abgeholt")</option></select>`;
  html += `<textarea id="new-list-options" placeholder="Nur bei „Mit Auswahlmöglichkeiten": ein Stichwort pro Zeile, z. B.&#10;wird betreut&#10;geht nach Hause&#10;wird abgeholt" style="min-height:70px;"></textarea>`;
  html += `<button class="btn btn-primary btn-block" data-action="add-list" data-class="${current.id}">➕ Liste anlegen</button>`;
  html += `</div></div>`;
  return html;
}

function renderBereichEditor(classId, subject) {
  let html = '<div style="padding:10px 12px 12px;"><div class="gap-sm" style="margin-bottom:8px;">';
  const percentSum = subject.bereiche.reduce((s, b) => s + (Number(b.percent) || 0), 0);
  subject.bereiche.forEach((b) => {
    html += `<div class="bereich-editor-row" data-class="${classId}" data-subject="${subject.id}" data-bereich="${b.id}">`;
    html += `<input type="text" class="name-input" data-change="update-bereich" data-field="name" value="${escapeHtml(b.name)}" />`;
    html += `<select data-change="update-bereich" data-field="typ"><option value="muendlich" ${b.typ === "muendlich" ? "selected" : ""}>Mündlich</option><option value="schriftlich" ${b.typ === "schriftlich" ? "selected" : ""}>Schriftlich</option></select>`;
    html += `<input type="number" class="percent-input" min="0" max="100" data-change="update-bereich" data-field="percent" value="${b.percent}" /><span class="muted" style="font-size:0.72rem;">%</span>`;
    html += `<button class="icon-btn" data-action="delete-bereich" data-class="${classId}" data-subject="${subject.id}" data-id="${b.id}">🗑</button></div>`;
  });
  html += "</div>";
  html += `<p style="font-size:0.7rem;color:${percentSum === 100 ? "#8a8578" : "#b8872f"};margin:0 0 8px;">Summe der Bereichs-Prozente: ${percentSum}%${percentSum !== 100 ? " (sollte idealerweise 100% ergeben)" : ""}</p>`;
  html += `<div class="flex-row" style="margin-bottom:8px;"><input id="nb-name-${subject.id}" type="text" class="field flex-1" placeholder="Neuer Bereich" style="font-size:0.78rem;" /><select id="nb-typ-${subject.id}" style="font-size:0.78rem;"><option value="muendlich">Mündlich</option><option value="schriftlich">Schriftlich</option></select><input id="nb-percent-${subject.id}" type="number" min="0" max="100" value="10" style="width:54px;font-size:0.78rem;" /><button class="btn btn-primary" style="font-size:0.75rem;padding:6px 10px;" data-action="add-bereich" data-class="${classId}" data-subject="${subject.id}">➕</button></div>`;
  html += `<button class="btn btn-outline btn-block" style="font-size:0.75rem;margin-bottom:10px;" data-action="apply-template" data-class="${classId}" data-subject="${subject.id}">✨ Deutsch-Vorlage laden (Rechtschreiben, Grammatik, Lesen, Texte verfassen, Zuhören/Sprechen)</button>`;
  html += `<div class="flex-row" style="align-items:center;gap:6px;font-size:0.8rem;"><span class="muted">📕 Klassenarbeiten-Anteil an der Gesamtnote</span><input type="number" min="0" max="100" value="${subject.kaPercent || 0}" data-change="set-ka-percent" data-class="${classId}" data-subject="${subject.id}" style="width:54px;" /><span class="muted">%</span></div>`;
  html += `<p class="muted" style="font-size:0.68rem;margin-top:4px;">Als „Klassenarbeit" markierte Noten (roter Rahmen) werden dann separat aus ihrem Bereich herausgerechnet. 0% = sie zählen ganz normal in ihrem Bereich mit.</p>`;
  html += "</div>";
  return html;
}
function renderVerwalten() {
  const active = state.classes.find((c) => c.id === ui.verwaltenActiveClassId) || state.classes[0] || null;

  let html = '<section class="panel"><div class="section-title">Klassen</div><div class="flex-row wrap" style="margin-bottom:10px;">';
  state.classes.forEach((c) => {
    html += `<div class="pill ${active && active.id === c.id ? "active" : ""}" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;" data-action="set-active-class" data-id="${c.id}">${escapeHtml(c.name)} <button data-action="delete-class" data-id="${c.id}" data-name="${escapeHtml(c.name)}" style="background:none;border:none;color:inherit;cursor:pointer;">✕</button></div>`;
  });
  html += `</div><div class="flex-row"><input id="new-class-name" class="field flex-1" type="text" placeholder="z. B. 7b" /><button class="btn btn-primary" data-action="add-class">➕ Klasse</button></div></section>`;

  if (active) {
    html += `<section class="panel"><div class="section-title">Fächer in ${escapeHtml(active.name)}</div><div class="gap-sm" style="margin-bottom:10px;">`;
    if (active.subjects.length === 0) html += '<p class="muted-light" style="font-size:0.78rem;">Noch kein Fach angelegt.</p>';
    active.subjects.forEach((s) => {
      const isOpen = ui.openSubjectId === s.id;
      html += `<div class="card" style="border:1px solid var(--card-border);"><div class="subject-row-header"><button class="expand ${isOpen ? "open" : ""}" data-action="toggle-subject" data-id="${s.id}"><span>▸</span>${escapeHtml(s.name)} <span class="muted" style="font-size:0.75rem;">(${s.bereiche.length} Bereiche${s.kaPercent ? `, KA ${s.kaPercent}%` : ""})</span></button><button class="icon-btn" data-action="delete-subject" data-class="${active.id}" data-id="${s.id}" data-name="${escapeHtml(s.name)}">🗑</button></div>`;
      if (isOpen) html += renderBereichEditor(active.id, s);
      html += `</div>`;
    });
    html += `</div><div class="flex-row"><input id="new-subject-name" class="field flex-1" type="text" placeholder="z. B. Deutsch, Mathematik …" /><button class="btn btn-primary" data-action="add-subject" data-class="${active.id}">➕ Fach</button></div>`;
    html += `<p class="muted" style="font-size:0.7rem;margin-top:6px;">Ein Fach namens „Deutsch" bekommt automatisch die 5 Teilbereiche. Bei anderen Fächern kannst du die Vorlage im aufgeklappten Fach ebenfalls laden oder eigene Bereiche anlegen.</p></section>`;

    html += `<section class="panel"><div class="section-title">Schüler:innen in ${escapeHtml(active.name)}</div><div class="gap-sm" style="margin-bottom:10px;">`;
    if (active.students.length === 0) html += '<p class="muted-light" style="font-size:0.78rem;">Noch niemand eingetragen.</p>';
    active.students.forEach((s) => {
      html += `<div class="flex-row" style="justify-content:space-between;background:var(--pill-bg);border-radius:8px;padding:6px 12px;font-size:0.88rem;"><span>${escapeHtml(s.name)}</span><button class="icon-btn" data-action="delete-student" data-class="${active.id}" data-id="${s.id}">🗑</button></div>`;
    });
    html += `</div><textarea id="new-students-text" placeholder="Ein Name pro Zeile, z. B. Anna Muster" style="min-height:70px;margin-bottom:8px;"></textarea><button class="btn btn-accent btn-block" data-action="add-students" data-class="${active.id}">➕ Schüler:innen hinzufügen</button></section>`;
  }

  html += '<section class="panel"><div class="section-title">Kriterien der mündlichen Mitarbeit</div><p class="muted" style="font-size:0.78rem;margin-bottom:8px;">Diese Liste erscheint bei der Noteneingabe, sobald ein „mündlicher" Bereich ausgewählt ist.</p><div class="gap-sm" style="margin-bottom:8px;">';
  const kriterien = state.mitarbeitKriterien && state.mitarbeitKriterien.length ? state.mitarbeitKriterien : DEFAULT_KRITERIEN;
  kriterien.forEach((k, i) => { html += `<div class="flex-row" style="justify-content:space-between;background:var(--pill-bg);border-radius:8px;padding:6px 12px;font-size:0.85rem;"><span>${escapeHtml(k)}</span><button class="icon-btn" data-action="delete-kriterium" data-index="${i}">🗑</button></div>`; });
  html += `</div><div class="flex-row"><input id="new-kriterium-name" class="field flex-1" type="text" placeholder="z. B. Hört aktiv zu" /><button class="btn btn-primary" data-action="add-kriterium">➕</button></div></section>`;

  html += '<section class="panel"><div class="section-title">Datensicherung</div><p class="muted" style="font-size:0.8rem;margin-bottom:10px;">Diese Daten liegen nur auf diesem Gerät/Browser. Exportiere regelmäßig eine Sicherung, besonders vor einem Gerätewechsel oder App-Update.</p>';
  html += '<div class="backup-buttons"><button class="btn btn-primary flex-1" data-action="export-data">⬇️ Sichern (Datei herunterladen)</button><button class="btn btn-outline flex-1" data-action="import-data">⬆️ Wiederherstellen</button></div>';
  html += '<input type="file" id="import-file-input" accept="application/json" style="display:none;" data-change="import-file" /></section>';

  return html;
}

function findAttendanceEntry(studentId, date, type) {
  return (state.attendance[studentId] || []).find((e) => e.date === date && e.type === type);
}
function computeAttendanceSummary(studentId) {
  const entries = state.attendance[studentId] || [];
  let tageE = 0, tageU = 0, stundenE = 0, stundenU = 0, verspCount = 0, verspMinuten = 0;
  entries.forEach((e) => {
    if (e.type === "tag") { if (e.status === "entschuldigt") tageE++; else tageU++; }
    else if (e.type === "stunde") { const n = e.anzahl || 1; if (e.status === "entschuldigt") stundenE += n; else stundenU += n; }
    else if (e.type === "verspaetung") { verspCount++; verspMinuten += e.minuten || 0; }
  });
  return { tageE, tageU, stundenE, stundenU, verspCount, verspMinuten };
}
function renderAttTagDetail(s, entry) {
  let html = '<div class="att-detail">';
  html += `<button type="button" class="pill small ${entry.status === "entschuldigt" ? "active" : ""}" data-action="att-set-tag-status" data-student="${s.id}" data-status="entschuldigt">entschuldigt</button>`;
  html += `<button type="button" class="pill small ${entry.status === "unentschuldigt" ? "active" : ""}" data-action="att-set-tag-status" data-student="${s.id}" data-status="unentschuldigt">unentschuldigt</button>`;
  html += `<input type="file" accept="image/*" capture="environment" id="att-photo-input-${s.id}" style="display:none;" data-change="capture-att-photo" data-student="${s.id}" />`;
  html += `<button type="button" class="icon-btn" data-action="trigger-att-photo" data-student="${s.id}" title="Entschuldigungszettel fotografieren">📷 Zettel</button>`;
  if (entry.photo) html += renderPhotoBlock(entry.photo, { type: "attendance", studentId: s.id, entryId: entry.id });
  html += "</div>";
  return html;
}
function renderAttVerspDetail(s, entry) {
  const options = [2, 4, 6, 8, 10, 12, 14, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 90].map((m) => `<option value="${m}" ${entry.minuten === m ? "selected" : ""}>${m} Min.</option>`).join("");
  return `<div class="att-detail"><select data-change="att-set-minutes" data-student="${s.id}" style="font-size:0.78rem;">${options}</select></div>`;
}
function renderAttStundeDetail(s, entry) {
  let html = '<div class="att-detail">';
  html += `<input type="number" min="1" max="10" value="${entry.anzahl}" data-change="att-set-stunden-anzahl" data-student="${s.id}" style="width:50px;font-size:0.78rem;" /> Std.`;
  html += `<button type="button" class="pill small ${entry.status === "entschuldigt" ? "active" : ""}" data-action="att-set-stunde-status" data-student="${s.id}" data-status="entschuldigt">entschuldigt</button>`;
  html += `<button type="button" class="pill small ${entry.status === "unentschuldigt" ? "active" : ""}" data-action="att-set-stunde-status" data-student="${s.id}" data-status="unentschuldigt">unentschuldigt</button>`;
  html += "</div>";
  return html;
}
function renderAnwesenheit() {
  let html = '<div class="pill-row" style="margin-bottom:12px;">';
  state.classes.forEach((c) => { html += `<button class="pill ${c.id === ui.selClass ? "active" : ""}" data-action="set-class" data-id="${c.id}">${escapeHtml(c.name)}</button>`; });
  html += "</div>";
  const current = state.classes.find((c) => c.id === ui.selClass);
  if (!current) return html;
  html += `<div class="card" style="padding:12px;margin-bottom:12px;"><div class="field-label">Datum</div><input type="date" id="att-date" class="field" value="${ui.attDate}" data-change="set-att-date" /></div>`;
  html += '<div class="card" style="overflow:hidden;margin-bottom:16px;">';
  current.students.forEach((s) => {
    const tagEntry = findAttendanceEntry(s.id, ui.attDate, "tag");
    const verspEntry = findAttendanceEntry(s.id, ui.attDate, "verspaetung");
    const stundeEntry = findAttendanceEntry(s.id, ui.attDate, "stunde");
    html += `<div class="att-row"><div class="att-row-main"><span class="batch-name">${escapeHtml(s.name)}</span><div class="flex-row wrap" style="gap:6px;">`;
    html += `<button type="button" class="chip-toggle small ${tagEntry ? "active" : ""}" data-action="att-toggle-tag" data-student="${s.id}">🚫 Fehltag</button>`;
    html += `<button type="button" class="chip-toggle small ${verspEntry ? "active" : ""}" data-action="att-toggle-versp" data-student="${s.id}">⏰ Verspätung</button>`;
    html += `<button type="button" class="chip-toggle small ${stundeEntry ? "active" : ""}" data-action="att-toggle-stunde" data-student="${s.id}">🕐 Fehlstunden</button>`;
    html += "</div></div>";
    if (tagEntry) html += renderAttTagDetail(s, tagEntry);
    if (verspEntry) html += renderAttVerspDetail(s, verspEntry);
    if (stundeEntry) html += renderAttStundeDetail(s, stundeEntry);
    html += "</div>";
  });
  html += "</div>";
  html += '<div class="card" style="padding:0;overflow:hidden;"><div class="section-title" style="padding:14px 14px 8px;">Zusammenfassung (gesamter Zeitraum)</div><table class="grades-table"><thead><tr><th>Name</th><th>Tage E/U</th><th>Std. E/U</th><th>Versp.</th></tr></thead><tbody>';
  current.students.forEach((s) => {
    const sum = computeAttendanceSummary(s.id);
    html += `<tr><td>${escapeHtml(s.name)}</td><td>${sum.tageE}/${sum.tageU}</td><td>${sum.stundenE}/${sum.stundenU}</td><td>${sum.verspCount} (${sum.verspMinuten} Min.)</td></tr>`;
  });
  html += "</tbody></table></div>";
  return html;
}

function renderEmptyState() {
  return `<div class="card empty-state"><div style="font-size:2.2rem;">🎓</div><h2 class="serif" style="margin:10px 0 6px;">Noch keine Klasse angelegt</h2><p class="muted" style="font-size:0.85rem;">Leg zuerst eine Klasse mit Fächern und Schüler:innen an, dann kannst du sofort Noten erfassen.</p><button class="btn btn-primary" style="margin-top:12px;" data-action="set-view" data-view="verwalten">➕ Klasse anlegen</button></div>`;
}
function renderMain() {
  if (state.classes.length === 0 && ui.view !== "verwalten") return renderEmptyState();
  switch (ui.view) {
    case "erfassen": return renderErfassen();
    case "anwesenheit": return renderAnwesenheit();
    case "uebersicht": return renderUebersicht();
    case "gespraech": return renderGespraech();
    case "listen": return renderListen();
    case "verwalten": return renderVerwalten();
    default: return "";
  }
}
// ---------- PDF-Export (über die native Druckfunktion des Browsers, „Als PDF speichern") ----------
function ensurePrintArea() {
  let area = document.getElementById("print-area");
  if (!area) { area = document.createElement("div"); area.id = "print-area"; document.body.appendChild(area); }
  return area;
}
function printHtml(titleText, bodyHtml) {
  const area = ensurePrintArea();
  area.innerHTML = `<div class="print-doc"><h1>${escapeHtml(titleText)}</h1>${bodyHtml}<div class="print-footer">Exportiert am ${formatDate(todayISO())} aus dem Notenheft</div></div>`;
  window.print();
}
function buildUebersichtPrintHtml(current, subject) {
  let html = `<h2>${escapeHtml(current.name)} – ${escapeHtml(subject.name)}</h2>`;
  html += "<table><thead><tr><th>Name</th><th>Noten</th><th>Ø</th><th>Vorschlag</th></tr></thead><tbody>";
  current.students.forEach((s) => {
    const entries = (state.grades[s.id] && state.grades[s.id][subject.id]) || [];
    const stats = computeSubjectStats(entries, subject);
    const notenText = entries.map((e) => `${valueToLabel(e.value)}${e.istKlassenarbeit ? " (KA)" : ""}${e.label ? " " + e.label : ""}`).join(", ") || "–";
    html += `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(notenText)}</td><td>${stats.overall !== null ? stats.overall.toFixed(1) : "–"}</td><td>${stats.suggested ?? "–"}</td></tr>`;
  });
  html += "</tbody></table>";
  return html;
}
function buildStudentPrintHtml(current, student) {
  let html = `<h2>${escapeHtml(student.name)} (${escapeHtml(current.name)})</h2>`;
  const att = computeAttendanceSummary(student.id);
  html += `<p>Fehltage entschuldigt: ${att.tageE} · unentschuldigt: ${att.tageU} · Fehlstunden E/U: ${att.stundenE}/${att.stundenU} · Verspätungen: ${att.verspCount} (${att.verspMinuten} Min.)</p>`;
  current.subjects.forEach((sub) => {
    const entries = (state.grades[student.id] && state.grades[student.id][sub.id]) || [];
    const stats = computeSubjectStats(entries, sub);
    html += `<h3>${escapeHtml(sub.name)} – Ø ${stats.overall !== null ? stats.overall.toFixed(1) : "–"} (Vorschlag ${stats.suggested ?? "–"})</h3>`;
    if (entries.length) {
      html += "<table><thead><tr><th>Datum</th><th>Bereich</th><th>Note</th><th>Bezeichnung</th><th>Notiz</th></tr></thead><tbody>";
      entries.forEach((e) => {
        const b = sub.bereiche.find((x) => x.id === e.bereichId);
        html += `<tr><td>${formatDate(e.date)}</td><td>${b ? escapeHtml(b.name) : "–"}</td><td>${valueToLabel(e.value)}${e.istKlassenarbeit ? " (KA)" : ""}</td><td>${escapeHtml(e.label || "–")}</td><td>${escapeHtml(e.notiz || "–")}</td></tr>`;
      });
      html += "</tbody></table>";
    } else {
      html += "<p>Keine Noten.</p>";
    }
  });
  const notes = state.notes[student.id] || [];
  html += "<h3>Notizen</h3>";
  if (notes.length) {
    html += "<table><thead><tr><th>Datum</th><th>Kategorie</th><th>Text</th></tr></thead><tbody>";
    notes.forEach((n) => { html += `<tr><td>${formatDate(n.date)}</td><td>${escapeHtml(n.category)}</td><td>${escapeHtml(n.text)}</td></tr>`; });
    html += "</tbody></table>";
  } else {
    html += "<p>Keine Notizen.</p>";
  }
  return html;
}
function buildListPrintHtml(current, list) {
  let html = `<h2>${escapeHtml(list.name)} (${escapeHtml(current.name)})</h2>`;
  html += `<p>Angelegt am ${formatDate(list.createdDate)}</p>`;
  html += "<table><thead><tr><th>Name</th><th>Status</th><th>Datum</th></tr></thead><tbody>";
  current.students.forEach((s) => {
    const entry = list.entries[s.id];
    let statusText = "–";
    if (entry) statusText = list.responseType === "choice" ? entry.value || "–" : "✓ abgegeben";
    html += `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(statusText)}</td><td>${entry ? formatDate(entry.date) : "–"}</td></tr>`;
  });
  html += "</tbody></table>";
  return html;
}

function render() {
  document.getElementById("app").innerHTML = renderHeader() + renderBanner() + renderNav() + `<main>${renderMain()}</main>` + renderFooter();
  if (ui.view === "erfassen" && ui.erfassenMode === "klasse") refreshBatchHighlights();
  if (ui.view === "gespraech" && ui.gespraechMode === "schnell") refreshQuickNoteChips();
}

const App = {};
App.setView = (v) => { ui.view = v; render(); };
App.setClass = (id) => { ui.selClass = id; ui.entryStudent = null; ui.selStudent = null; const c = state.classes.find((x) => x.id === id); ui.selSubject = c && c.subjects.length ? c.subjects[0].id : null; render(); };
App.setSubject = (id) => { ui.selSubject = id; ui.entryStudent = null; render(); };
App.setErfassenMode = (mode) => { ui.erfassenMode = mode; render(); };
App.setGespraechMode = (mode) => { ui.gespraechMode = mode; render(); };
App.toggleEntryStudent = (id) => { ui.entryStudent = ui.entryStudent === id ? null : id; currentGradeValue = 2; pendingGradePhoto = null; pendingKriterienRatings = {}; render(); };
App.setGradeValue = (btn) => {
  const form = btn.closest(".grade-form");
  currentGradeValue = parseFloat(btn.dataset.value);
  form.querySelectorAll(".grade-btn").forEach((b) => b.classList.toggle("selected", parseFloat(b.dataset.value) === currentGradeValue));
  const display = form.querySelector(".gf-value-display");
  if (display) display.textContent = valueToLabel(currentGradeValue);
};
App.setKriteriumRating = (btn) => {
  const idx = btn.dataset.kriteriumIndex;
  const level = btn.dataset.level;
  const row = btn.parentElement;
  row.querySelectorAll(".kriterium-btn").forEach((b) => b.classList.toggle("active", b === btn));
  pendingKriterienRatings[idx] = level;
};
function refreshMitarbeitKriterienVisibility() {
  const select = document.getElementById("gf-bereich");
  const block = document.getElementById("gf-kriterien-block");
  if (!select || !block) return;
  const opt = select.options[select.selectedIndex];
  block.style.display = opt && opt.dataset.typ === "muendlich" ? "" : "none";
}
App.saveGrade = (studentId, subjectId) => {
  const bereichSelect = document.getElementById("gf-bereich");
  if (!bereichSelect || !bereichSelect.value) return;
  const labelInput = document.getElementById("gf-label");
  const weightInput = document.getElementById("gf-weight");
  const notizInput = document.getElementById("gf-notiz");
  const kaCheckbox = document.getElementById("gf-ist-klassenarbeit");
  const kriterienListe = state.mitarbeitKriterien && state.mitarbeitKriterien.length ? state.mitarbeitKriterien : DEFAULT_KRITERIEN;
  const kriterien = {};
  Object.keys(pendingKriterienRatings).forEach((idx) => { const name = kriterienListe[idx]; if (name) kriterien[name] = pendingKriterienRatings[idx]; });
  const entry = {
    id: uid(), value: currentGradeValue, bereichId: bereichSelect.value,
    label: labelInput ? labelInput.value.trim() : "", weight: weightInput ? Number(weightInput.value) || 1 : 1,
    date: todayISO(), photo: pendingGradePhoto || undefined,
    kriterien: Object.keys(kriterien).length ? kriterien : undefined,
    notiz: (notizInput && notizInput.value.trim()) || undefined,
    istKlassenarbeit: !!(kaCheckbox && kaCheckbox.checked),
  };
  if (!state.grades[studentId]) state.grades[studentId] = {};
  if (!state.grades[studentId][subjectId]) state.grades[studentId][subjectId] = [];
  state.grades[studentId][subjectId].push(entry);
  pendingGradePhoto = null;
  pendingKriterienRatings = {};
  saveState(); render();
};
App.editGradeNotiz = (studentId, subjectId, entryId) => {
  const entries = (state.grades[studentId] && state.grades[studentId][subjectId]) || [];
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return;
  const result = prompt("Notiz für dich (z. B. besonders schön formuliert, nicht abgegeben, abgeschrieben):", entry.notiz || "");
  if (result === null) return;
  entry.notiz = result.trim() || undefined;
  saveState(); render();
};
App.deleteGrade = (studentId, subjectId, entryId) => {
  if (state.grades[studentId] && state.grades[studentId][subjectId]) state.grades[studentId][subjectId] = state.grades[studentId][subjectId].filter((e) => e.id !== entryId);
  saveState(); render();
};
App.batchSetGrade = (rowEl, btn) => {
  const studentId = btn.dataset.student;
  const subjectId = btn.dataset.subject;
  const bereichId = document.getElementById("batch-bereich").value;
  if (!bereichId) return;
  const label = document.getElementById("batch-label").value.trim();
  const weight = Number(document.getElementById("batch-weight").value) || 1;
  const date = document.getElementById("batch-date").value || todayISO();
  const value = parseFloat(btn.dataset.value);
  rowEl.dataset.currentValue = value;
  const existing = findBatchEntry(studentId, subjectId, bereichId, label, date);
  if (existing) { existing.value = value; existing.weight = weight; }
  else {
    if (!state.grades[studentId]) state.grades[studentId] = {};
    if (!state.grades[studentId][subjectId]) state.grades[studentId][subjectId] = [];
    state.grades[studentId][subjectId].push({ id: uid(), value, bereichId, label, weight, date });
  }
  saveState();
  rowEl.querySelectorAll(".grade-btn").forEach((b) => b.classList.toggle("selected", parseFloat(b.dataset.value) === value));
  rowEl.classList.add("done");
  const doneRows = document.querySelectorAll(".batch-row.done").length;
  const totalRows = document.querySelectorAll(".batch-row").length;
  const progressEl = document.getElementById("batch-progress-text");
  if (progressEl) progressEl.textContent = `${doneRows}/${totalRows} erfasst`;
};
App.setStudent = (id) => { ui.selStudent = id; pendingNotePhoto = null; render(); };
App.saveNote = (studentId) => {
  const cat = document.getElementById("note-category").value;
  let text = document.getElementById("note-text").value.trim();
  if (!text && !pendingNotePhoto) return;
  if (!text) text = "(siehe Foto)";
  state.notes[studentId] = [{ id: uid(), date: todayISO(), category: cat, text, photo: pendingNotePhoto || undefined }, ...(state.notes[studentId] || [])];
  pendingNotePhoto = null;
  saveState(); render();
};
App.deleteNote = (studentId, noteId) => { state.notes[studentId] = (state.notes[studentId] || []).filter((n) => n.id !== noteId); saveState(); render(); };
App.toggleQuickNote = (chip) => {
  const studentId = chip.dataset.student;
  const category = document.getElementById("quicknote-category").value;
  const text = document.getElementById("quicknote-text").value.trim();
  const today = todayISO();
  const list = state.notes[studentId] || [];
  const idx = list.findIndex((n) => n.category === category && n.text === text && n.date === today);
  if (idx >= 0) { list.splice(idx, 1); chip.classList.remove("active"); }
  else { list.unshift({ id: uid(), date: today, category, text }); chip.classList.add("active"); }
  state.notes[studentId] = list;
  saveState();
};
App.addList = (classId) => {
  const nameInput = document.getElementById("new-list-name");
  const typeSelect = document.getElementById("new-list-type");
  const optionsText = document.getElementById("new-list-options");
  const name = nameInput.value.trim();
  if (!name) return;
  const responseType = typeSelect.value;
  const options = responseType === "choice" ? optionsText.value.split("\n").map((t) => t.trim()).filter(Boolean) : [];
  if (responseType === "choice" && options.length === 0) { alert("Bitte mindestens eine Auswahlmöglichkeit eintragen (ein Stichwort pro Zeile)."); return; }
  state.lists.push({ id: uid(), classId, name, createdDate: todayISO(), responseType, options, entries: {} });
  saveState(); render();
};
App.deleteList = (id, name) => {
  if (!confirm(`Liste „${name}“ wirklich löschen?`)) return;
  state.lists = state.lists.filter((l) => l.id !== id);
  saveState(); render();
};
App.toggleList = (id) => { ui.openListId = ui.openListId === id ? null : id; render(); };
App.toggleListCheckbox = (listId, studentId) => {
  const list = state.lists.find((l) => l.id === listId);
  if (!list) return;
  if (list.entries[studentId]) delete list.entries[studentId];
  else list.entries[studentId] = { date: todayISO() };
  saveState(); render();
};
App.setListChoice = (listId, studentId, value) => {
  const list = state.lists.find((l) => l.id === listId);
  if (!list) return;
  const existing = list.entries[studentId];
  if (existing && existing.value === value) delete list.entries[studentId];
  else list.entries[studentId] = { ...(existing || {}), date: todayISO(), value };
  saveState(); render();
};
App.captureListPhoto = (input) => {
  const listId = input.dataset.list, studentId = input.dataset.student;
  const file = input.files && input.files[0];
  if (!file) return;
  readAndCompressImage(file, (dataUrl) => {
    const list = state.lists.find((l) => l.id === listId);
    if (list && list.entries[studentId]) { list.entries[studentId].photo = dataUrl; saveState(); render(); }
  });
};

App.captureGradePhoto = (input) => {
  const file = input.files && input.files[0];
  if (!file) return;
  readAndCompressImage(file, (dataUrl) => {
    pendingGradePhoto = dataUrl;
    const preview = document.getElementById("gf-photo-preview");
    if (preview) preview.innerHTML = renderPhotoThumb(dataUrl) + ` <button type="button" class="icon-btn" data-action="remove-grade-photo">✕ entfernen</button>`;
  });
};
App.removeGradePhoto = () => {
  pendingGradePhoto = null;
  const input = document.getElementById("gf-photo-input");
  if (input) input.value = "";
  const preview = document.getElementById("gf-photo-preview");
  if (preview) preview.innerHTML = "";
};
App.captureNotePhoto = (input) => {
  const file = input.files && input.files[0];
  if (!file) return;
  readAndCompressImage(file, (dataUrl) => {
    pendingNotePhoto = dataUrl;
    const preview = document.getElementById("note-photo-preview");
    if (preview) preview.innerHTML = renderPhotoThumb(dataUrl) + ` <button type="button" class="icon-btn" data-action="remove-note-photo">✕ entfernen</button>`;
  });
};
App.removeNotePhoto = () => {
  pendingNotePhoto = null;
  const input = document.getElementById("note-photo-input");
  if (input) input.value = "";
  const preview = document.getElementById("note-photo-preview");
  if (preview) preview.innerHTML = "";
};
App.viewPhotoFull = (src) => {
  const overlay = document.createElement("div");
  overlay.className = "photo-overlay";
  overlay.innerHTML = `<img src="${src}" alt="Foto in Vollbild" />`;
  overlay.addEventListener("click", () => overlay.remove());
  document.body.appendChild(overlay);
};
function findStudentById(id) {
  for (const c of state.classes) { const s = c.students.find((x) => x.id === id); if (s) return s; }
  return null;
}
function safeFilenamePart(str) { return String(str).replace(/[^a-zA-Z0-9äöüÄÖÜß-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); }
function getPhotoOwner(block) {
  const type = block.dataset.context;
  const studentId = block.dataset.student;
  if (type === "grade") return (((state.grades[studentId] || {})[block.dataset.subject]) || []).find((e) => e.id === block.dataset.entry);
  if (type === "attendance") return (state.attendance[studentId] || []).find((e) => e.id === block.dataset.entry);
  if (type === "list") { const list = state.lists.find((l) => l.id === block.dataset.list); return list ? list.entries[studentId] : null; }
  return (state.notes[studentId] || []).find((n) => n.id === block.dataset.note);
}
App.downloadPhoto = (block) => {
  const img = block.querySelector("img");
  if (!img) return;
  const student = findStudentById(block.dataset.student);
  const owner = getPhotoOwner(block);
  const parts = ["Foto", student ? safeFilenamePart(student.name) : "Schueler"];
  if (owner) { parts.push(owner.date); if (owner.label) parts.push(safeFilenamePart(owner.label)); }
  const filename = parts.join("_") + ".jpg";
  const a = document.createElement("a");
  a.href = img.src;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
App.removePhotoField = (block) => {
  if (!confirm("Foto aus der App entfernen? Am besten vorher mit ⬇️ auf dem Gerät sichern – das lässt sich danach nicht rückgängig machen.")) return;
  const owner = getPhotoOwner(block);
  if (owner) delete owner.photo;
  saveState(); render();
};

App.setAttDate = (value) => { ui.attDate = value || todayISO(); render(); };
App.toggleAttTag = (studentId) => {
  const list = state.attendance[studentId] = state.attendance[studentId] || [];
  const idx = list.findIndex((e) => e.date === ui.attDate && e.type === "tag");
  if (idx >= 0) list.splice(idx, 1);
  else list.push({ id: uid(), date: ui.attDate, type: "tag", status: "unentschuldigt" });
  saveState(); render();
};
App.toggleAttVersp = (studentId) => {
  const list = state.attendance[studentId] = state.attendance[studentId] || [];
  const idx = list.findIndex((e) => e.date === ui.attDate && e.type === "verspaetung");
  if (idx >= 0) list.splice(idx, 1);
  else list.push({ id: uid(), date: ui.attDate, type: "verspaetung", minuten: 10 });
  saveState(); render();
};
App.toggleAttStunde = (studentId) => {
  const list = state.attendance[studentId] = state.attendance[studentId] || [];
  const idx = list.findIndex((e) => e.date === ui.attDate && e.type === "stunde");
  if (idx >= 0) list.splice(idx, 1);
  else list.push({ id: uid(), date: ui.attDate, type: "stunde", anzahl: 1, status: "unentschuldigt" });
  saveState(); render();
};
App.setAttTagStatus = (studentId, status) => {
  const entry = findAttendanceEntry(studentId, ui.attDate, "tag");
  if (entry) { entry.status = status; saveState(); render(); }
};
App.setAttStundeStatus = (studentId, status) => {
  const entry = findAttendanceEntry(studentId, ui.attDate, "stunde");
  if (entry) { entry.status = status; saveState(); render(); }
};
App.setAttMinutes = (studentId, minutes) => {
  const entry = findAttendanceEntry(studentId, ui.attDate, "verspaetung");
  if (entry) { entry.minuten = Number(minutes) || 0; saveState(); render(); }
};
App.setAttStundenAnzahl = (studentId, anzahl) => {
  const entry = findAttendanceEntry(studentId, ui.attDate, "stunde");
  if (entry) { entry.anzahl = Math.max(1, Number(anzahl) || 1); saveState(); render(); }
};
App.captureAttPhoto = (input) => {
  const studentId = input.dataset.student;
  const file = input.files && input.files[0];
  if (!file) return;
  readAndCompressImage(file, (dataUrl) => {
    const entry = findAttendanceEntry(studentId, ui.attDate, "tag");
    if (entry) { entry.photo = dataUrl; saveState(); render(); }
  });
};

function attachEvents() {
  const app = document.getElementById("app");
  app.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const a = el.dataset.action;
    if (a === "set-grade-value") { App.setGradeValue(el); return; }
    if (a === "set-kriterium-rating") { App.setKriteriumRating(el); return; }
    if (a === "batch-set-grade") { App.batchSetGrade(el.closest(".batch-row"), el); return; }
    if (a === "toggle-quicknote") { App.toggleQuickNote(el); return; }
    if (a === "view-photo-full") { App.viewPhotoFull(el.getAttribute("src")); return; }
    if (a === "download-photo") { App.downloadPhoto(el.closest(".photo-block")); return; }
    if (a === "remove-photo-field") { App.removePhotoField(el.closest(".photo-block")); return; }
    switch (a) {
      case "set-view": App.setView(el.dataset.view); break;
      case "set-class": App.setClass(el.dataset.id); break;
      case "set-subject": App.setSubject(el.dataset.id); break;
      case "set-erfassen-mode": App.setErfassenMode(el.dataset.mode); break;
      case "set-gespraech-mode": App.setGespraechMode(el.dataset.mode); break;
      case "toggle-entry-student": App.toggleEntryStudent(el.dataset.id); break;
      case "save-grade": App.saveGrade(el.dataset.student, el.dataset.subject); break;
      case "delete-grade": App.deleteGrade(el.dataset.student, el.dataset.subject, el.dataset.entry); break;
      case "edit-grade-notiz": App.editGradeNotiz(el.dataset.student, el.dataset.subject, el.dataset.entry); break;
      case "set-student": App.setStudent(el.dataset.id); break;
      case "back-to-class": App.setStudent(null); break;
      case "save-note": App.saveNote(el.dataset.student); break;
      case "delete-note": App.deleteNote(el.dataset.student, el.dataset.note); break;
      case "add-list": App.addList(el.dataset.class); break;
      case "delete-list": App.deleteList(el.dataset.id, el.dataset.name); break;
      case "toggle-list": App.toggleList(el.dataset.id); break;
      case "trigger-grade-photo": document.getElementById("gf-photo-input").click(); break;
      case "trigger-note-photo": document.getElementById("note-photo-input").click(); break;
      case "remove-grade-photo": App.removeGradePhoto(); break;
      case "remove-note-photo": App.removeNotePhoto(); break;
      case "att-toggle-tag": App.toggleAttTag(el.dataset.student); break;
      case "att-toggle-versp": App.toggleAttVersp(el.dataset.student); break;
      case "att-toggle-stunde": App.toggleAttStunde(el.dataset.student); break;
      case "att-set-tag-status": App.setAttTagStatus(el.dataset.student, el.dataset.status); break;
      case "att-set-stunde-status": App.setAttStundeStatus(el.dataset.student, el.dataset.status); break;
      case "trigger-att-photo": document.getElementById("att-photo-input-" + el.dataset.student).click(); break;
      case "list-toggle-checkbox": App.toggleListCheckbox(el.dataset.list, el.dataset.student); break;
      case "list-set-choice": App.setListChoice(el.dataset.list, el.dataset.student, el.dataset.value); break;
      case "trigger-list-photo": document.getElementById("list-photo-input-" + el.dataset.list + "-" + el.dataset.student).click(); break;
      case "show-mitarbeit-popup": { const c = state.classes.find((x) => x.id === ui.selClass); if (c) showMitarbeitPopup(c); } break;
      case "close-mitarbeit-popup": App.closeMitarbeitPopup(); break;
      case "print-uebersicht": App.printUebersicht(); break;
      case "print-student": App.printStudent(el.dataset.student); break;
      case "print-list": App.printList(el.dataset.id); break;
      case "add-kriterium": App.addKriterium(); break;
      case "delete-kriterium": App.deleteKriterium(Number(el.dataset.index)); break;
      case "add-class": App.addClass(); break;
      case "delete-class": App.deleteClass(el.dataset.id, el.dataset.name); break;
      case "set-active-class": App.setActiveClass(el.dataset.id); break;
      case "toggle-subject": App.toggleSubject(el.dataset.id); break;
      case "add-subject": App.addSubject(el.dataset.class); break;
      case "delete-subject": App.deleteSubject(el.dataset.class, el.dataset.id, el.dataset.name); break;
      case "add-students": App.addStudents(el.dataset.class); break;
      case "delete-student": App.deleteStudent(el.dataset.class, el.dataset.id); break;
      case "add-bereich": App.addBereich(el.dataset.class, el.dataset.subject); break;
      case "delete-bereich": App.deleteBereich(el.dataset.class, el.dataset.subject, el.dataset.id); break;
      case "apply-template": App.applyTemplate(el.dataset.class, el.dataset.subject); break;
      case "export-data": App.exportData(); break;
      case "import-data": document.getElementById("import-file-input").click(); break;
    }
  });
  app.addEventListener("change", (e) => {
    const el = e.target.closest("[data-change]");
    if (!el) return;
    if (el.dataset.change === "update-bereich") App.updateBereichFromRow(el);
    if (el.dataset.change === "import-file") App.handleImportFile(el);
    if (el.dataset.change === "refresh-batch-highlights") refreshBatchHighlights();
    if (el.dataset.change === "refresh-mitarbeit-kriterien") refreshMitarbeitKriterienVisibility();
    if (el.dataset.change === "refresh-quicknote-chips") refreshQuickNoteChips();
    if (el.dataset.change === "capture-grade-photo") App.captureGradePhoto(el);
    if (el.dataset.change === "capture-note-photo") App.captureNotePhoto(el);
    if (el.dataset.change === "set-att-date") App.setAttDate(el.value);
    if (el.dataset.change === "att-set-minutes") App.setAttMinutes(el.dataset.student, el.value);
    if (el.dataset.change === "att-set-stunden-anzahl") App.setAttStundenAnzahl(el.dataset.student, el.value);
    if (el.dataset.change === "capture-att-photo") App.captureAttPhoto(el);
    if (el.dataset.change === "capture-list-photo") App.captureListPhoto(el);
    if (el.dataset.change === "set-ka-percent") App.setKaPercent(el.dataset.class, el.dataset.subject, el.value);
  });
}

// ---------- Mitarbeitsnoten-Zufallsauswahl (faire Rotation) ----------
function findClassBySubjectId(subjectId) {
  return state.classes.find((c) => c.subjects.some((s) => s.id === subjectId));
}
function drawFromPool(mq, currentIds, excludeIds, count) {
  let pool = currentIds.filter((id) => !mq.used.includes(id) && !excludeIds.includes(id));
  const picks = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) {
      // Alle schon dran gewesen (oder ausgeschlossen) -> Zyklus neu beginnen, aktuelle Auswahl bleibt ausgeschlossen
      mq.used = [];
      pool = currentIds.filter((id) => !excludeIds.includes(id) && !picks.includes(id));
      if (pool.length === 0) break;
    }
    const idx = Math.floor(Math.random() * pool.length);
    const chosen = pool[idx];
    picks.push(chosen);
    mq.used.push(chosen);
    pool.splice(idx, 1);
  }
  return picks;
}
function ensureTodaysHistory(subject, students) {
  if (!state.mitarbeitAuswahl) state.mitarbeitAuswahl = {};
  const currentIds = students.map((s) => s.id);
  let mq = state.mitarbeitAuswahl[subject.id];
  if (!mq) { mq = { used: [], history: {} }; state.mitarbeitAuswahl[subject.id] = mq; }
  mq.used = mq.used.filter((id) => currentIds.includes(id));
  const today = todayISO();
  if (!mq.history[today]) {
    const picks = drawFromPool(mq, currentIds, [], 2);
    while (picks.length < 2) picks.push(null); // falls Klasse weniger als 2 Kinder hat
    mq.history[today] = picks;
    saveState();
  } else {
    // Bereinigen, falls ein Kind zwischenzeitlich aus der Klasse entfernt wurde
    mq.history[today] = mq.history[today].map((id) => (id && currentIds.includes(id) ? id : id ? null : null));
  }
  return mq;
}
App.setMitarbeitSlot = (subjectId, slotIndex, newValue) => {
  const mq = state.mitarbeitAuswahl[subjectId];
  if (!mq) return;
  const today = todayISO();
  const arr = mq.history[today] || [null, null];
  const oldId = arr[slotIndex];
  if (oldId && arr[1 - slotIndex] !== oldId) mq.used = mq.used.filter((id) => id !== oldId);
  const newId = newValue || null;
  arr[slotIndex] = newId;
  if (newId && !mq.used.includes(newId)) mq.used.push(newId);
  mq.history[today] = arr;
  saveState();
  const classObj = findClassBySubjectId(subjectId);
  if (classObj) showMitarbeitPopup(classObj);
};
App.rerollMitarbeitSlot = (subjectId, slotIndex) => {
  const mq = state.mitarbeitAuswahl[subjectId];
  if (!mq) return;
  const today = todayISO();
  const arr = mq.history[today] || [null, null];
  const oldId = arr[slotIndex];
  const classObj = findClassBySubjectId(subjectId);
  if (!classObj) return;
  if (oldId && arr[1 - slotIndex] !== oldId) mq.used = mq.used.filter((id) => id !== oldId);
  const currentIds = classObj.students.map((s) => s.id);
  const exclude = [arr[1 - slotIndex]].filter(Boolean);
  const drawn = drawFromPool(mq, currentIds, exclude, 1);
  arr[slotIndex] = drawn[0] || null;
  mq.history[today] = arr;
  saveState();
  showMitarbeitPopup(classObj);
};
function showMitarbeitPopup(classObj) {
  let inner = '<h3 class="serif" style="margin:0 0 12px;">🎲 Mitarbeitsnoten heute</h3>';
  if (classObj.subjects.length === 0 || classObj.students.length === 0) {
    inner += '<p class="muted" style="font-size:0.85rem;">Keine Fächer oder Schüler:innen in dieser Klasse.</p>';
  } else {
    classObj.subjects.forEach((sub) => {
      ensureTodaysHistory(sub, classObj.students);
      const slots = state.mitarbeitAuswahl[sub.id].history[todayISO()];
      inner += `<div style="margin-bottom:12px;font-size:0.9rem;"><strong>${escapeHtml(sub.name)}:</strong><div class="gap-sm" style="margin-top:6px;">`;
      [0, 1].forEach((slotIdx) => {
        const currentId = slots[slotIdx];
        const options = ['<option value="">– niemand –</option>']
          .concat(classObj.students.map((s) => `<option value="${s.id}" ${s.id === currentId ? "selected" : ""}>${escapeHtml(s.name)}</option>`))
          .join("");
        inner += `<div class="flex-row" style="gap:6px;align-items:center;">`;
        inner += `<select data-subject="${sub.id}" data-slot="${slotIdx}" style="flex:1;font-size:0.82rem;">${options}</select>`;
        inner += `<button type="button" class="icon-btn" data-action="reroll-mitarbeit-slot" data-subject="${sub.id}" data-slot="${slotIdx}" title="Neu würfeln">🎲</button>`;
        inner += `</div>`;
      });
      inner += "</div></div>";
    });
  }
  inner += '<button type="button" class="btn btn-primary btn-block" style="margin-top:8px;" data-action="close-mitarbeit-popup">Alles klar</button>';
  let overlay = document.getElementById("mitarbeit-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "mitarbeit-overlay";
    overlay.className = "modal-overlay";
    // Das Popup hängt außerhalb von #app im DOM, deshalb braucht es eigene Klick-/Change-Handler
    // statt sich auf die zentrale Delegation zu verlassen.
    overlay.addEventListener("click", (e) => {
      const rerollBtn = e.target.closest('[data-action="reroll-mitarbeit-slot"]');
      if (rerollBtn) { App.rerollMitarbeitSlot(rerollBtn.dataset.subject, Number(rerollBtn.dataset.slot)); return; }
      if (e.target === overlay || e.target.closest('[data-action="close-mitarbeit-popup"]')) App.closeMitarbeitPopup();
    });
    overlay.addEventListener("change", (e) => {
      const select = e.target.closest("select[data-subject]");
      if (select) App.setMitarbeitSlot(select.dataset.subject, Number(select.dataset.slot), select.value);
    });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="card" style="max-width:320px;width:100%;padding:18px;">${inner}</div>`;
}
App.closeMitarbeitPopup = () => {
  const overlay = document.getElementById("mitarbeit-overlay");
  if (overlay) overlay.remove();
  if (!state.mitarbeitAuswahl) state.mitarbeitAuswahl = {};
  state.mitarbeitAuswahl._popupSeenDate = todayISO();
  saveState();
};
App.printUebersicht = () => {
  const current = state.classes.find((c) => c.id === ui.selClass);
  const subject = current ? current.subjects.find((s) => s.id === ui.selSubject) : null;
  if (!current || !subject) return;
  printHtml(`${current.name} – ${subject.name}`, buildUebersichtPrintHtml(current, subject));
};
App.printStudent = (studentId) => {
  const current = state.classes.find((c) => c.id === ui.selClass);
  const student = current ? current.students.find((s) => s.id === studentId) : null;
  if (!current || !student) return;
  printHtml(`${student.name} – ${current.name}`, buildStudentPrintHtml(current, student));
};
App.printList = (listId) => {
  const list = state.lists.find((l) => l.id === listId);
  if (!list) return;
  const current = state.classes.find((c) => c.id === list.classId);
  if (!current) return;
  printHtml(`${list.name} – ${current.name}`, buildListPrintHtml(current, list));
};
App.setKaPercent = (classId, subjectId, value) => {
  const c = state.classes.find((x) => x.id === classId);
  const s = c && c.subjects.find((x) => x.id === subjectId);
  if (!s) return;
  s.kaPercent = Math.max(0, Math.min(100, Number(value) || 0));
  saveState(); render();
};
App.addKriterium = () => {
  const input = document.getElementById("new-kriterium-name");
  const val = input.value.trim();
  if (!val) return;
  if (!state.mitarbeitKriterien || !state.mitarbeitKriterien.length) state.mitarbeitKriterien = DEFAULT_KRITERIEN.slice();
  state.mitarbeitKriterien.push(val);
  saveState(); render();
};
App.deleteKriterium = (idx) => {
  if (!state.mitarbeitKriterien || !state.mitarbeitKriterien.length) state.mitarbeitKriterien = DEFAULT_KRITERIEN.slice();
  state.mitarbeitKriterien.splice(idx, 1);
  saveState(); render();
};

// ---------- Verwalten: Klassen / Fächer / Bereiche / Schüler:innen ----------
App.addClass = () => {
  const input = document.getElementById("new-class-name");
  const name = input.value.trim();
  if (!name) return;
  const c = { id: uid(), name, subjects: [], students: [] };
  state.classes.push(c);
  ui.verwaltenActiveClassId = c.id;
  saveState(); render();
};
App.deleteClass = (id, name) => {
  if (!confirm(`Klasse „${name}" inkl. aller Noten und Notizen löschen?`)) return;
  state.classes = state.classes.filter((c) => c.id !== id);
  if (ui.verwaltenActiveClassId === id) ui.verwaltenActiveClassId = null;
  if (ui.selClass === id) { ui.selClass = null; ui.selSubject = null; }
  saveState(); render();
};
App.setActiveClass = (id) => { ui.verwaltenActiveClassId = id; ui.openSubjectId = null; render(); };
App.toggleSubject = (id) => { ui.openSubjectId = ui.openSubjectId === id ? null : id; render(); };
App.addSubject = (classId) => {
  const input = document.getElementById("new-subject-name");
  const name = input.value.trim();
  if (!name) return;
  const isDeutsch = name.trim().toLowerCase() === "deutsch";
  const s = { id: uid(), name, bereiche: isDeutsch ? deutschBereiche() : defaultBereiche(), kaPercent: 0 };
  const c = state.classes.find((x) => x.id === classId);
  c.subjects.push(s);
  saveState(); render();
};
App.deleteSubject = (classId, subjectId, name) => {
  if (!confirm(`Fach „${name}" inkl. aller zugehörigen Noten löschen?`)) return;
  const c = state.classes.find((x) => x.id === classId);
  c.subjects = c.subjects.filter((s) => s.id !== subjectId);
  const newGrades = {};
  Object.entries(state.grades).forEach(([studentId, bySubject]) => {
    const nb = { ...bySubject };
    delete nb[subjectId];
    newGrades[studentId] = nb;
  });
  state.grades = newGrades;
  saveState(); render();
};
App.addStudents = (classId) => {
  const ta = document.getElementById("new-students-text");
  const names = ta.value.split("\n").map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return;
  const c = state.classes.find((x) => x.id === classId);
  names.forEach((name) => c.students.push({ id: uid(), name }));
  saveState(); render();
};
App.deleteStudent = (classId, studentId) => {
  if (!confirm("Diese:n Schüler:in inkl. aller Noten und Notizen aus dieser Klasse entfernen?")) return;
  const c = state.classes.find((x) => x.id === classId);
  c.students = c.students.filter((s) => s.id !== studentId);
  saveState(); render();
};
function countEntriesForBereich(subjectId, bereichId) {
  let n = 0;
  Object.values(state.grades).forEach((bySubject) => { n += ((bySubject[subjectId] || [])).filter((e) => e.bereichId === bereichId).length; });
  return n;
}
function countEntriesForSubject(subjectId) {
  let n = 0;
  Object.values(state.grades).forEach((bySubject) => { n += (bySubject[subjectId] || []).length; });
  return n;
}
function removeEntriesForBereich(subjectId, bereichId) {
  Object.keys(state.grades).forEach((studentId) => {
    const bySubject = state.grades[studentId];
    if (bySubject[subjectId]) bySubject[subjectId] = bySubject[subjectId].filter((e) => e.bereichId !== bereichId);
  });
}
function removeEntriesForSubject(subjectId) {
  Object.keys(state.grades).forEach((studentId) => { delete state.grades[studentId][subjectId]; });
}
App.addBereich = (classId, subjectId) => {
  const nameInput = document.getElementById("nb-name-" + subjectId);
  const typSelect = document.getElementById("nb-typ-" + subjectId);
  const percentInput = document.getElementById("nb-percent-" + subjectId);
  const name = nameInput.value.trim();
  if (!name) return;
  const s = state.classes.find((x) => x.id === classId).subjects.find((x) => x.id === subjectId);
  s.bereiche.push({ id: uid(), name, typ: typSelect.value, percent: Number(percentInput.value) || 0 });
  saveState(); render();
};
App.updateBereichFromRow = (el) => {
  const row = el.closest(".bereich-editor-row");
  const s = state.classes.find((x) => x.id === row.dataset.class).subjects.find((x) => x.id === row.dataset.subject);
  const b = s.bereiche.find((x) => x.id === row.dataset.bereich);
  const field = el.dataset.field;
  b[field] = field === "percent" ? Number(el.value) || 0 : el.value;
  saveState(); render();
};
App.deleteBereich = (classId, subjectId, bereichId) => {
  const count = countEntriesForBereich(subjectId, bereichId);
  if (count > 0 && !confirm(`Dieser Bereich enthält ${count} Note(n). Bereich inklusive dieser Noten löschen?`)) return;
  const c = state.classes.find((x) => x.id === classId);
  const s = c.subjects.find((x) => x.id === subjectId);
  s.bereiche = s.bereiche.filter((b) => b.id !== bereichId);
  if (count > 0) removeEntriesForBereich(subjectId, bereichId);
  saveState(); render();
};
App.applyTemplate = (classId, subjectId) => {
  const count = countEntriesForSubject(subjectId);
  if (count > 0 && !confirm(`Die Vorlage ersetzt alle Bereiche dieses Fachs. Alle ${count} bisher erfassten Note(n) in diesem Fach werden dabei gelöscht. Fortfahren?`)) return;
  const c = state.classes.find((x) => x.id === classId);
  const s = c.subjects.find((x) => x.id === subjectId);
  s.bereiche = deutschBereiche();
  if (count > 0) removeEntriesForSubject(subjectId);
  saveState(); render();
};

// ---------- Datensicherung (Export/Import) ----------
App.exportData = () => {
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `notenheft-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
App.handleImportFile = (input) => {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.classes) throw new Error("ungültiges Format");
      if (!confirm("Import ersetzt alle aktuell gespeicherten Daten auf diesem Gerät durch die Datei. Fortfahren?")) return;
      state = {
        classes: normalizeLoadedClasses(parsed.classes),
        grades: parsed.grades || {},
        notes: parsed.notes || {},
        lists: parsed.lists || [],
        attendance: parsed.attendance || {},
        mitarbeitAuswahl: parsed.mitarbeitAuswahl || {},
        mitarbeitKriterien: parsed.mitarbeitKriterien && parsed.mitarbeitKriterien.length ? parsed.mitarbeitKriterien : DEFAULT_KRITERIEN.slice(),
      };
      ui.view = "erfassen";
      ui.selClass = state.classes[0] ? state.classes[0].id : null;
      ui.selSubject = state.classes[0] && state.classes[0].subjects[0] ? state.classes[0].subjects[0].id : null;
      ui.verwaltenActiveClassId = state.classes[0] ? state.classes[0].id : null;
      saveState(); render();
      alert("Daten erfolgreich wiederhergestellt.");
    } catch (err) {
      alert("Die Datei konnte nicht gelesen werden. Ist es eine gültige Notenheft-Sicherungsdatei?");
    }
    input.value = "";
  };
  reader.readAsText(file);
};

function init() {
  loadState();
  if (state.classes.length > 0) {
    ui.selClass = state.classes[0].id;
    ui.selSubject = state.classes[0].subjects[0] ? state.classes[0].subjects[0].id : null;
    ui.verwaltenActiveClassId = state.classes[0].id;
  } else {
    ui.view = "verwalten";
  }
  attachEvents();
  render();
  const seenDate = state.mitarbeitAuswahl && state.mitarbeitAuswahl._popupSeenDate;
  if (seenDate !== todayISO() && state.classes.length > 0) {
    const current = state.classes.find((c) => c.id === ui.selClass);
    if (current) showMitarbeitPopup(current);
  }
}
document.addEventListener("DOMContentLoaded", init);
