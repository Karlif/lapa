/* app.js — Google Sheets web app client */

"use strict";

// ── Configuration ──────────────────────────────────────────────────────────
const BACKEND_URL = "https://script.google.com/macros/s/AKfycbxb8An9591mvZAbEJgixMdBcbkje76UZ9v_nCgbB1OiRNlwG0oswSG-z-XOMS9iMJn_4w/exec";

// ── State ──────────────────────────────────────────────────────────────────
let currentUser        = null;   // logged-in username (User1 etc.)
let currentDisplayName = null;   // display name from _Users col B
let pendingUser        = null;
let pendingDisplayName = null;
let currentSheet       = null;
let sheetData          = null;

// ── API helper (JSONP — avoids Apps Script CORS redirect issue) ───────────
function api(payload) {
  return new Promise((resolve, reject) => {
    const cbName = "_cb" + Date.now();
    const script = document.createElement("script");
    const cleanup = () => { delete window[cbName]; script.remove(); };
    window[cbName] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("Savienojuma kļūda")); };
    script.src = BACKEND_URL
      + "?callback=" + cbName
      + "&data=" + encodeURIComponent(JSON.stringify(payload));
    document.head.appendChild(script);
  });
}

// ── View helpers ──────────────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function setLoading(on) {
  document.getElementById("loading").classList.toggle("visible", on);
}

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("user-btn-container");
  try {
    const res = await api({ action: "listUsers" });
    if (res.ok && res.users.length) {
      container.innerHTML = "";
      res.users.sort((a, b) => {
        const pa = a.points !== null ? a.points : -Infinity;
        const pb = b.points !== null ? b.points : -Infinity;
        if (pb !== pa) return pb - pa;
        return a.name.localeCompare(b.name, "lv");
      });
      res.users.forEach(u => {
        const btn = document.createElement("button");
        btn.className = "user-btn";
        btn.dataset.user = u.username;
        btn.textContent = u.points !== null ? u.name + " (" + u.points + ")" : u.name;
        btn.addEventListener("click", () => selectUser(u.username, u.name));
        container.appendChild(btn);
      });
    } else {
      container.textContent = "Kļūda: " + (res.error || "lietotāji nav atrasti");
    }
  } catch (err) {
    container.textContent = "Savienojuma kļūda: " + err.message;
    console.error(err);
  }

  document.getElementById("pw-ok").addEventListener("click", doLogin);
  document.getElementById("pw-cancel").addEventListener("click", cancelLogin);
  document.getElementById("pw-input").addEventListener("keydown", e => {
    if (e.key === "Enter") doLogin();
  });

  document.getElementById("btn-my-sheet").addEventListener("click",   () => loadSheet(currentUser));
  document.getElementById("btn-change-pw").addEventListener("click",  showChangePassword);
  document.getElementById("btn-change-name").addEventListener("click", showChangeName);
  document.getElementById("btn-results").addEventListener("click",    () => loadSheet("Results"));
  document.getElementById("btn-logout").addEventListener("click",     doLogout);

  document.getElementById("cpw-save").addEventListener("click",   doChangePassword);
  document.getElementById("cpw-cancel").addEventListener("click", () => showView("view-options"));
  document.getElementById("confirm-pw").addEventListener("keydown", e => {
    if (e.key === "Enter") doChangePassword();
  });

  document.getElementById("cname-save").addEventListener("click",   doChangeName);
  document.getElementById("cname-cancel").addEventListener("click", () => showView("view-options"));
  document.getElementById("new-name").addEventListener("keydown", e => {
    if (e.key === "Enter") doChangeName();
  });

  document.getElementById("btn-save-sheet").addEventListener("click", saveSheetChanges);
  document.getElementById("btn-back").addEventListener("click",       () => showView("view-options"));
});

// ── Login flow ────────────────────────────────────────────────────────────
function selectUser(username, displayName) {
  pendingUser        = username;
  pendingDisplayName = displayName || username;
  document.getElementById("pw-username").textContent = pendingDisplayName;
  document.getElementById("pw-input").value = "";
  document.getElementById("pw-error").textContent = "";
  document.getElementById("password-prompt").hidden = false;
  setTimeout(() => document.getElementById("pw-input").focus(), 50);
}

function cancelLogin() {
  pendingUser        = null;
  pendingDisplayName = null;
  document.getElementById("password-prompt").hidden = true;
  document.getElementById("pw-input").value = "";
  document.getElementById("pw-error").textContent = "";
}

async function doLogin() {
  const password = document.getElementById("pw-input").value;
  document.getElementById("pw-error").textContent = "";
  setLoading(true);
  try {
    const res = await api({ action: "login", username: pendingUser, password });
    if (!res.ok) {
      document.getElementById("pw-input").value = "";
      document.getElementById("pw-error").textContent = "Nepareiza parole. Mēģiniet vēlreiz.";
      document.getElementById("pw-input").focus();
      return;
    }
    currentUser        = pendingUser;
    currentDisplayName = pendingDisplayName;
    pendingUser        = null;
    pendingDisplayName = null;
    document.getElementById("password-prompt").hidden = true;
    document.getElementById("welcome-msg").textContent = "Sveiki, " + currentDisplayName + "!";
    showView("view-options");
  } catch (err) {
    document.getElementById("pw-error").textContent = "Kļūda: " + err.message;
  } finally {
    setLoading(false);
  }
}

function doLogout() {
  currentUser        = null;
  currentDisplayName = null;
  pendingUser        = null;
  pendingDisplayName = null;
  currentSheet       = null;
  sheetData          = null;
  cancelLogin();
  showView("view-login");
}

// ── Change name ───────────────────────────────────────────────────────────
function showChangeName() {
  document.getElementById("new-name").value         = currentDisplayName || "";
  document.getElementById("cname-error").textContent   = "";
  document.getElementById("cname-success").textContent = "";
  showView("view-change-name");
  setTimeout(() => document.getElementById("new-name").focus(), 50);
}

async function doChangeName() {
  const newName = document.getElementById("new-name").value.trim();
  const errEl   = document.getElementById("cname-error");
  const sucEl   = document.getElementById("cname-success");
  errEl.textContent = "";
  sucEl.textContent = "";

  if (newName.length < 2) {
    errEl.textContent = "Vārdam jābūt vismaz 2 rakstzīmēm."; return;
  }

  setLoading(true);
  try {
    const res = await api({ action: "changeName", username: currentUser, newName });
    if (!res.ok) {
      errEl.textContent = res.error || "Vārda maiņa neizdevās.";
      return;
    }
    currentDisplayName = newName;
    document.getElementById("welcome-msg").textContent = "Sveiki, " + currentDisplayName + "!";
    sucEl.textContent = "Vārds veiksmīgi nomainīts!";
    setTimeout(() => showView("view-options"), 1500);
  } catch (err) {
    errEl.textContent = "Kļūda: " + err.message;
  } finally {
    setLoading(false);
  }
}

// ── Change password ───────────────────────────────────────────────────────
function showChangePassword() {
  document.getElementById("cpw-username").textContent = currentDisplayName || currentUser;
  document.getElementById("old-pw").value      = "";
  document.getElementById("new-pw").value      = "";
  document.getElementById("confirm-pw").value  = "";
  document.getElementById("cpw-error").textContent   = "";
  document.getElementById("cpw-success").textContent = "";
  showView("view-change-pw");
  setTimeout(() => document.getElementById("old-pw").focus(), 50);
}

async function doChangePassword() {
  const oldPassword = document.getElementById("old-pw").value;
  const newPassword = document.getElementById("new-pw").value;
  const confirmPw   = document.getElementById("confirm-pw").value;
  const errEl  = document.getElementById("cpw-error");
  const sucEl  = document.getElementById("cpw-success");
  errEl.textContent = "";
  sucEl.textContent = "";

  if (!oldPassword || !newPassword || !confirmPw) {
    errEl.textContent = "Visi lauki ir obligāti."; return;
  }
  if (newPassword !== confirmPw) {
    errEl.textContent = "Jaunās paroles nesakrīt."; return;
  }
  if (newPassword.length < 4) {
    errEl.textContent = "Jaunajai parolei jābūt vismaz 4 rakstzīmēm."; return;
  }

  setLoading(true);
  try {
    const res = await api({ action: "changePassword", username: currentUser, oldPassword, newPassword });
    if (!res.ok) {
      errEl.textContent = res.error || "Paroles maiņa neizdevās.";
      return;
    }
    sucEl.textContent = "Parole veiksmīgi nomainīta!";
    document.getElementById("old-pw").value     = "";
    document.getElementById("new-pw").value     = "";
    document.getElementById("confirm-pw").value = "";
    setTimeout(() => showView("view-options"), 1500);
  } catch (err) {
    errEl.textContent = "Kļūda: " + err.message;
  } finally {
    setLoading(false);
  }
}

// ── Sheet view ────────────────────────────────────────────────────────────
async function loadSheet(sheetName) {
  setLoading(true);
  document.getElementById("sheet-error").textContent   = "";
  document.getElementById("sheet-success").textContent = "";
  try {
    const res = await api({ action: "getSheet", username: currentUser, sheet: sheetName });
    if (!res.ok) {
      document.getElementById("sheet-error").textContent = res.error || "Tabulu neizdevās ielādēt.";
      showView("view-sheet");
      return;
    }
    currentSheet = sheetName;
    sheetData    = res;
    document.getElementById("sheet-title").textContent =
      sheetName === currentUser ? currentDisplayName : "Rezultāti";
    document.getElementById("btn-save-sheet").hidden = true;
    renderTable(res.values, res.locked);
    showView("view-sheet");
  } catch (err) {
    alert("Kļūda ielādējot tabulu: " + err.message);
  } finally {
    setLoading(false);
  }
}

function renderTable(values, locked) {
  const table = document.getElementById("sheet-table");
  table.innerHTML = "";
  const thead = table.createTHead();
  const tbody = table.createTBody();

  values.forEach((row, ri) => {
    const isHeader = ri === 0;
    const tr = document.createElement("tr");

    row.forEach((cell, ci) => {
      const el = document.createElement(isHeader ? "th" : "td");

      if (!locked[ri][ci]) {
        const input = document.createElement("input");
        input.type  = "text";
        input.value = cell;
        input.dataset.row = ri;
        input.dataset.col = ci;
        input.classList.add("cell-input");

        input.addEventListener("blur", async () => {
          const row = parseInt(input.dataset.row, 10);
          const col = parseInt(input.dataset.col, 10);
          if (input.value === sheetData.values[row][col]) return;
          const td = input.parentElement;
          td.classList.remove("cell-save-error");
          try {
            const res = await api({ action: "setCell", username: currentUser, sheet: currentSheet, row, col, value: input.value });
            if (res.ok) {
              sheetData.values[row][col] = input.value;
              td.classList.add("cell-saved");
              setTimeout(() => td.classList.remove("cell-saved"), 800);
              document.getElementById("sheet-error").textContent = "";
            } else {
              td.classList.add("cell-save-error");
              document.getElementById("sheet-error").textContent = res.error || "Saglabāšana neizdevās.";
            }
          } catch (err) {
            td.classList.add("cell-save-error");
            document.getElementById("sheet-error").textContent = "Kļūda saglabājot: " + err.message;
          }
        });

        el.appendChild(input);
      } else {
        el.textContent = cell;
        if (!isHeader) {
          el.classList.add("locked-cell");
          if (currentSheet === "Results" && ci >= 6) {
            const m = String(cell).match(/\((-?\d+)\)$/);
            if (m) {
              const pts = parseInt(m[1], 10);
              if (pts === 200)     el.classList.add("result-exact");
              else if (pts > 0)   el.classList.add("result-positive");
              else if (pts < 0)   el.classList.add("result-negative");
            }
          }
        }
      }

      tr.appendChild(el);
    });

    (isHeader ? thead : tbody).appendChild(tr);
  });
}

async function saveSheetChanges() {
  const inputs = document.querySelectorAll("#sheet-table .cell-input");
  const errEl  = document.getElementById("sheet-error");
  const sucEl  = document.getElementById("sheet-success");
  errEl.textContent = "";
  sucEl.textContent = "";

  const changes = [];
  inputs.forEach(input => {
    const ri  = parseInt(input.dataset.row, 10);
    const ci  = parseInt(input.dataset.col, 10);
    const orig = sheetData.values[ri][ci];
    if (input.value !== orig) {
      changes.push({ row: ri, col: ci, value: input.value });
    }
  });

  if (changes.length === 0) {
    sucEl.textContent = "Nav izmaiņu, ko saglabāt.";
    return;
  }

  setLoading(true);
  try {
    for (const ch of changes) {
      const res = await api({
        action: "setCell",
        username: currentUser,
        sheet: currentSheet,
        row: ch.row,
        col: ch.col,
        value: ch.value,
      });
      if (!res.ok) {
        errEl.textContent = "Saglabāšana neizdevās rindai " + (ch.row + 1) + ": " + (res.error || "nezināma kļūda");
        return;
      }
      sheetData.values[ch.row][ch.col] = ch.value;
    }
    sucEl.textContent = changes.length + " šūna(s) saglabāta(s).";
  } catch (err) {
    errEl.textContent = "Kļūda saglabājot: " + err.message;
  } finally {
    setLoading(false);
  }
}
