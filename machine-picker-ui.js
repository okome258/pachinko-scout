/** あ～わ行フィルタ付き機種選択UI（通称名で表示・分類） */

import { getAllMachineOptions, saveCustomMachine } from "./machine-picker.js";

const GYO = [
  { id: "あ", chars: "あいうえおアイウエオ" },
  { id: "か", chars: "かきくけこがぎぐげごカキクケコガギグゲゴ" },
  { id: "さ", chars: "さしすせそざじずぜぞサシスセソザジズゼゾ" },
  { id: "た", chars: "たちつてとだぢづでどタチツテトダヂヅデド" },
  { id: "な", chars: "なにぬねのナニヌネノ" },
  { id: "は", chars: "はひふへほばびぶべぼぱぴぷぺぽハヒフヘホバビブベボパピプペポ" },
  { id: "ま", chars: "まみむめもマミムメモ" },
  { id: "や", chars: "やゆよヤユヨ" },
  { id: "ら", chars: "らりるれろラリルレロ" },
  { id: "わ", chars: "わをんワヲン" },
  { id: "他", chars: "" },
];

/** e/P/CR などの型式プレフィックスを除去 */
export function normalizeMachineLabel(name) {
  return String(name || "")
    .replace(/^(P|PA|e|CR|Ｐ|ＣＲ)\s*/i, "")
    .trim();
}

/** 末尾の機種番号・ver表記を除去（バイオハザード6 → バイオハザード） */
export function stripVersionSuffix(name) {
  const m = String(name).match(/^(.{3,}?)((?:\d{1,3})(?:ver\.?)?)$/i);
  if (m && /[\u3040-\u9fff]/.test(m[1])) return m[1];
  return name;
}

/** ホールで通称として使う表示名を選ぶ */
export function pickDisplayName(machine) {
  if (machine?.display_name) return machine.display_name;

  const raw = machine?.names || [];
  const candidates = raw
    .map(normalizeMachineLabel)
    .filter((n) => n && n.length >= 2);

  const jp = candidates.filter((n) => /[\u3040-\u9fff]/.test(n));
  const pool = jp.length ? jp : candidates;
  if (!pool.length) return "—";

  const score = (n) => {
    let s = Math.min(n.length, 30);
    if (n.length < 4) s -= 8;
    if (/^[A-Z0-9]+$/i.test(n)) s -= 15;
    if (/物語|リベンジャーズ|ハザード|無双|ガンダム|エヴァ|物語|戦記/.test(n)) s += 12;
    return s;
  };

  pool.sort((a, b) => score(b) - score(a) || a.localeCompare(b, "ja"));
  return stripVersionSuffix(pool[0]);
}

export function getGyo(name) {
  const label = stripVersionSuffix(normalizeMachineLabel(name));
  const c = label.charAt(0);
  if (!c) return "他";
  for (const row of GYO) {
    if (row.id === "他") continue;
    if (row.chars.includes(c)) return row.id;
  }
  return "他";
}

export function getMachineGyo(machine) {
  return getGyo(pickDisplayName(machine));
}

export function machineSearchText(machine) {
  const parts = [
    pickDisplayName(machine),
    ...(machine?.names || []),
    machine?.id,
  ];
  return parts.join(" ").toLowerCase();
}

export function filterMachines(machines, { gyo = "あ", query = "" }) {
  const q = query.trim().toLowerCase();
  return machines.filter((m) => {
    if (gyo !== "all" && getMachineGyo(m) !== gyo) return false;
    if (!q) return true;
    return machineSearchText(m).includes(q);
  });
}

export function mountMachinePicker(modalEl, db, handlers) {
  const { getSelectedId, onSelect, onClose } = handlers;

  const tabsEl = modalEl.querySelector("#pickerGyoTabs");
  const searchEl = modalEl.querySelector("#pickerSearch");
  const listEl = modalEl.querySelector("#pickerList");
  const currentEl = modalEl.querySelector("#pickerCurrent");
  let activeGyo = "あ";

  function allOptions() {
    return getAllMachineOptions(db).sort((a, b) =>
      pickDisplayName(a).localeCompare(pickDisplayName(b), "ja"),
    );
  }

  function renderTabs() {
    tabsEl.innerHTML = "";
    for (const row of GYO) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `picker-gyo-tab${row.id === activeGyo ? " active" : ""}`;
      btn.textContent = row.id === "他" ? "他" : `${row.id}行`;
      btn.onclick = () => {
        activeGyo = row.id;
        renderTabs();
        renderList();
      };
      tabsEl.appendChild(btn);
    }
  }

  function renderList() {
    const selected = getSelectedId();
    const items = filterMachines(allOptions(), {
      gyo: activeGyo,
      query: searchEl.value,
    });
    listEl.innerHTML = "";
    if (!items.length) {
      listEl.innerHTML = '<p class="picker-empty">該当なし — 検索または行を変更</p>';
      return;
    }
    for (const m of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `picker-item${m.id === selected ? " selected" : ""}`;
      const title = pickDisplayName(m);
      const official = m.names?.[0] && m.names[0] !== title ? m.names[0] : "";
      const denom = m.first_hit_denom ? `1/${Math.round(m.first_hit_denom)}` : "";
      btn.innerHTML = `<span class="picker-item-name">${title}</span><span class="picker-item-meta">${denom}</span>${
        official ? `<span class="picker-item-sub">${official}</span>` : ""
      }`;
      btn.onclick = () => {
        onSelect(m);
        renderCurrent();
        renderList();
      };
      listEl.appendChild(btn);
    }
  }

  function renderCurrent() {
    const id = getSelectedId();
    const m = allOptions().find((x) => x.id === id);
    currentEl.textContent = m
      ? `選択中: ${pickDisplayName(m)}（1/${Math.round(m.first_hit_denom || 0)}）`
      : "未選択 — リストから選んでください";
  }

  searchEl.oninput = () => renderList();
  searchEl.placeholder = "例: バイオ、東リベ、エヴァ";

  modalEl.querySelector("#pickerCloseBtn").onclick = () => onClose();
  modalEl.querySelector("#pickerBackdrop").onclick = () => onClose();

  modalEl.querySelector("#pickerSaveCustomBtn").onclick = () => {
    const name = modalEl.querySelector("#pickerCustomName").value.trim();
    if (!name) return alert("機種名を入力");
    const entry = saveCustomMachine({
      name,
      first_hit_denom: modalEl.querySelector("#pickerCustomDenom").value || 319,
      ceiling_spins: modalEl.querySelector("#pickerCustomCeiling").value || 840,
      lt_critical: modalEl.querySelector("#pickerCustomLt").checked,
    });
    onSelect(entry);
    renderCurrent();
    renderList();
  };

  return {
    open(gyo) {
      activeGyo = gyo || "あ";
      searchEl.value = "";
      renderTabs();
      renderCurrent();
      renderList();
      modalEl.classList.add("show");
    },
    close() {
      modalEl.classList.remove("show");
    },
    refresh() {
      renderCurrent();
      renderList();
    },
  };
}
