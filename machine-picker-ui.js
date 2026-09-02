/** あ～わ行フィルタ付き機種選択UI（通称名で表示・分類） */

import { getAllMachineOptions, getSeriesGroups, saveCustomMachine } from "./machine-picker.js";

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

/** リスト用の表示名（シリーズ識別子 RE / 6 などを残す） */
export function getPickerLabel(machine) {
  if (machine?.picker_label) return machine.picker_label;
  if (machine?.display_name) return machine.display_name;

  const names = (machine?.names || []).map(normalizeMachineLabel).filter((n) => n.length >= 2);
  const jp = names.filter((n) => /[\u3040-\u9fff]/.test(n));
  const pool = jp.length ? jp : names;
  if (!pool.length) return "—";

  const scored = pool
    .map((n) => {
      let s = 0;
      if (/RE\s*:?\s*2|RE2/i.test(n)) s += 30;
      if (/バイオハザード\s*6|e\s*バイオ/i.test(n)) s += 28;
      if (/\d|RE|:/i.test(n)) s += 10;
      if (n.length <= 16) s += 6;
      return { n, s };
    })
    .sort((a, b) => b.s - a.s || a.n.localeCompare(b.n, "ja"));

  return scored[0].n;
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
    getPickerLabel(machine),
    pickDisplayName(machine),
    ...(machine?.names || []),
    machine?.id,
    ...(machine?.series || []),
  ];
  return parts.join(" ").toLowerCase();
}

function resolveSeriesMachines(db, seriesId) {
  const group = getSeriesGroups(db).find((g) => g.id === seriesId);
  if (!group) return [];
  const all = getAllMachineOptions(db);
  const byId = new Map(all.map((m) => [m.id, m]));
  const ordered = (group.machine_ids || [])
    .map((id) => byId.get(id))
    .filter(Boolean);
  if (ordered.length) return ordered;
  const q = (group.keywords || []).join(" ").toLowerCase();
  return all.filter((m) => machineSearchText(m).includes(q.split(" ")[0]));
}

export function filterMachines(machines, { gyo = "all", query = "", seriesId = null }) {
  const q = query.trim().toLowerCase();

  if (seriesId) {
    return machines.filter((m) => resolveSeriesMachines({ machines }, seriesId).some((x) => x.id === m.id));
  }

  return machines.filter((m) => {
    const text = machineSearchText(m);
    if (q) return text.includes(q);
    if (gyo === "all") return true;
    return getMachineGyo(m) === gyo;
  });
}

export function mountMachinePicker(modalEl, db, handlers) {
  const { getSelectedId, onSelect, onClose } = handlers;

  const tabsEl = modalEl.querySelector("#pickerGyoTabs");
  const seriesEl = modalEl.querySelector("#pickerSeriesChips");
  const searchEl = modalEl.querySelector("#pickerSearch");
  const listEl = modalEl.querySelector("#pickerList");
  const currentEl = modalEl.querySelector("#pickerCurrent");
  let activeGyo = "all";
  let activeSeriesId = null;

  function allOptions() {
    return getAllMachineOptions(db).sort((a, b) =>
      getPickerLabel(a).localeCompare(getPickerLabel(b), "ja"),
    );
  }

  function renderSeriesChips() {
    if (!seriesEl) return;
    seriesEl.innerHTML = "";
    const groups = getSeriesGroups(db);
    if (!groups.length) {
      seriesEl.style.display = "none";
      return;
    }
    seriesEl.style.display = "flex";
    for (const g of groups) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `picker-series-chip${g.id === activeSeriesId ? " active" : ""}`;
      btn.textContent = g.label;
      btn.onclick = () => {
        activeSeriesId = activeSeriesId === g.id ? null : g.id;
        if (activeSeriesId) {
          activeGyo = "all";
          searchEl.value = "";
        }
        renderTabs();
        renderSeriesChips();
        renderList();
      };
      seriesEl.appendChild(btn);
    }
  }

  function renderTabs() {
    tabsEl.innerHTML = "";
    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = `picker-gyo-tab${activeGyo === "all" ? " active" : ""}`;
    allBtn.textContent = "すべて";
    allBtn.onclick = () => {
      activeGyo = "all";
      activeSeriesId = null;
      renderTabs();
      renderSeriesChips();
      renderList();
    };
    tabsEl.appendChild(allBtn);

    for (const row of GYO) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `picker-gyo-tab${row.id === activeGyo ? " active" : ""}`;
      btn.textContent = row.id === "他" ? "他" : `${row.id}行`;
      btn.onclick = () => {
        activeGyo = row.id;
        activeSeriesId = null;
        renderTabs();
        renderSeriesChips();
        renderList();
      };
      tabsEl.appendChild(btn);
    }
  }

  function renderList() {
    const selected = getSelectedId();
    let items;
    if (activeSeriesId) {
      items = resolveSeriesMachines(db, activeSeriesId);
    } else {
      items = filterMachines(allOptions(), {
        gyo: activeGyo,
        query: searchEl.value,
      });
    }
    listEl.innerHTML = "";
    if (!items.length) {
      const hint =
        searchEl.value.trim() || activeSeriesId
          ? "該当なし — 検索語を変えるか「すべて」を選んでください"
          : "該当なし — 「すべて」タブか検索（例: バイオ）を使ってください";
      listEl.innerHTML = `<p class="picker-empty">${hint}</p>`;
      return;
    }
    for (const m of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `picker-item${m.id === selected ? " selected" : ""}`;
      const title = getPickerLabel(m);
      const official = m.names?.[0] && m.names[0] !== title ? m.names[0] : "";
      const denom = m.first_hit_denom ? `1/${Math.round(m.first_hit_denom)}` : "";
      const seriesTag = (m.series || [])[0] ? `<span class="picker-item-tag">${m.series[0]}</span>` : "";
      btn.innerHTML = `${seriesTag}<span class="picker-item-name">${title}</span><span class="picker-item-meta">${denom}</span>${
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
      ? `選択中: ${getPickerLabel(m)}（1/${Math.round(m.first_hit_denom || 0)}）`
      : "未選択 — リストから選んでください";
  }

  searchEl.oninput = () => {
    if (searchEl.value.trim()) {
      activeGyo = "all";
      activeSeriesId = null;
      renderTabs();
      renderSeriesChips();
    }
    renderList();
  };
  searchEl.placeholder = "例: バイオ、RE2、東リベ、エヴァ";

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
      activeGyo = gyo || "all";
      activeSeriesId = null;
      searchEl.value = "";
      renderTabs();
      renderSeriesChips();
      renderCurrent();
      renderList();
      modalEl.classList.add("show");
    },
    openSeries(seriesId) {
      activeSeriesId = seriesId;
      activeGyo = "all";
      searchEl.value = "";
      renderTabs();
      renderSeriesChips();
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
