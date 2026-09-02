/** あいうえお…五十音タブ付き機種選択UI（通称名で表示・分類） */

import { getAllMachineOptions, getSeriesGroups, saveCustomMachine } from "./machine-picker.js";

const KANA_TABS = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん".split("");
const OTHER_TAB = "他";

const VOICED_TO_BASE = {
  が: "か",
  ぎ: "き",
  ぐ: "く",
  げ: "け",
  ご: "こ",
  ざ: "さ",
  じ: "し",
  ず: "す",
  ぜ: "せ",
  ぞ: "そ",
  だ: "た",
  ぢ: "ち",
  づ: "つ",
  で: "て",
  ど: "と",
  ば: "は",
  び: "ひ",
  ぶ: "ふ",
  べ: "へ",
  ぼ: "ほ",
  ぱ: "は",
  ぴ: "ひ",
  ぷ: "ふ",
  ぺ: "へ",
  ぽ: "ほ",
  ヴ: "う",
};

function toHiragana(char) {
  const code = char.charCodeAt(0);
  if (code >= 0x30a1 && code <= 0x30f6) return String.fromCharCode(code - 0x60);
  return char;
}

/** 先頭文字 → あいうえおタブの1文字 */
export function normalizeToKanaTab(char) {
  if (!char) return OTHER_TAB;
  let h = toHiragana(char);
  if (VOICED_TO_BASE[h]) h = VOICED_TO_BASE[h];
  if (KANA_TABS.includes(h)) return h;
  return OTHER_TAB;
}

/** e/P/CR・メーカー冠・世代表記を落としてホール通称寄りにする */
export function normalizeMachineLabel(name) {
  let s = String(name || "");
  s = s.replace(/^(P|PA|e|CR|Ｐ|ＣＲ)\s*/i, "");
  s = s.replace(/^(フィーバー|FEVER)\s*/i, "");
  s = s.replace(/\s*(フィーバー|FEVER)\s*/gi, " ");
  s = s.replace(/第\s*\d+\s*世代/g, "");
  s = s.replace(/(スマパチ|ぱちんこ|パチンコ)\s*/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** 表示用にさらに軽くする（検索用 names は別途残す） */
export function cleanHallLabel(name) {
  let s = normalizeMachineLabel(name);
  // Light / LT は残しつつ冗長な ver 文言だけ落とす
  s = s.replace(/\s*LT[- ]?Light\s*ver\.?/gi, " Light");
  s = s.replace(/\s*Light\s*ver\.?/gi, " Light");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** 末尾の機種番号・ver表記を除去（バイオハザード6 → バイオハザード） */
export function stripVersionSuffix(name) {
  const m = String(name).match(/^(.{3,}?)((?:\d{1,3})(?:ver\.?)?)$/i);
  if (m && /[\u3040-\u9fff]/.test(m[1])) return m[1];
  return name;
}

/** リスト用の表示名（シリーズ識別子 RE / 6 などを残す） */
export function getPickerLabel(machine) {
  if (machine?.picker_label) return cleanHallLabel(machine.picker_label);
  if (machine?.display_name) return cleanHallLabel(machine.display_name);

  const names = (machine?.names || []).map(cleanHallLabel).filter((n) => n.length >= 2);
  const jp = names.filter((n) => /[\u3040-\u9fff]/.test(n));
  const pool = jp.length ? jp : names;
  if (!pool.length) return "—";

  const scored = pool
    .map((n) => {
      let s = 0;
      if (/RE\s*:?\s*2|RE2/i.test(n)) s += 30;
      if (/バイオハザード\s*6|e\s*バイオ|バイオ\s*6/i.test(n)) s += 28;
      if (/エヴァンゲリオン|エヴァ/i.test(n)) s += 26;
      if (/東リベ/.test(n)) s += 40;
      if (/東京リベンジャー/.test(n)) s += 20;
      if (/\d|RE|:/i.test(n)) s += 10;
      if (n.length <= 16) s += 6;
      if (/フィーバー/i.test(n)) s -= 20;
      return { n, s };
    })
    .sort((a, b) => b.s - a.s || a.n.localeCompare(b.n, "ja"));

  let best = scored[0].n;
  if (/東京リベンジャー/.test(best) && !/東リベ/.test(best)) {
    best = best.replace(/東京リベンジャーズ?/, "東リベ");
  }
  return best;
}

/** ホールで通称として使う表示名を選ぶ */
export function pickDisplayName(machine) {
  if (machine?.display_name) return cleanHallLabel(machine.display_name);

  const raw = machine?.names || [];
  const candidates = raw
    .map(cleanHallLabel)
    .filter((n) => n && n.length >= 2);

  const jp = candidates.filter((n) => /[\u3040-\u9fff]/.test(n));
  const pool = jp.length ? jp : candidates;
  if (!pool.length) return "—";

  const score = (n) => {
    let s = Math.min(n.length, 30);
    if (n.length < 4) s -= 8;
    if (/^[A-Z0-9]+$/i.test(n)) s -= 15;
    if (/物語|リベンジャーズ|ハザード|無双|ガンダム|エヴァ|戦記/.test(n)) s += 12;
    if (/^エヴァ/.test(n)) s += 20;
    if (/フィーバー/i.test(n)) s -= 20;
    return s;
  };

  pool.sort((a, b) => score(b) - score(a) || a.localeCompare(b, "ja"));
  const best = pool[0];
  if (/エヴァンゲリオン/.test(best)) return "エヴァ";
  return stripVersionSuffix(best);
}

/** 漢字タイトル先頭 → 五十音タブ（通称読み） */
const KANJI_TAB_HINTS = {
  東: "と", // 東京リベンジャーズ / 東リベ
  新: "し", // 新世紀エヴァ
  機: "き", // 機動戦士ガンダム
  戦: "せ", // 戦国乙女 など
  化: "け", // 化物語
  大: "た", // 大海物語（だ→た）
  海: "う",
  火: "ひ",
  花: "は",
  銀: "き",
  金: "き",
  黒: "く",
  白: "し",
  青: "あ",
  赤: "あ",
  黄: "き",
  呪: "じ", // 呪術 → じ
  鬼: "お", // 鬼滅 → お
  進: "し", // 進撃
  一: "い",
  二: "に",
  三: "さ",
  百: "ひ",
  千: "せ",
  万: "ま",
  無: "む",
  超: "ち",
  聖: "せ",
  神: "か",
  魔: "ま",
  龍: "り",
  竜: "り",
  獣: "け",
  侍: "さ",
  忍: "お",
  押: "お",
  ぱ: "は", // ぱちんこ… already stripped
};

/** 通称ヒント（表示名・タブ両用） */
const SERIES_NICK_HINTS = [
  { re: /東京リベンジャー|東リベ/i, nick: "東リベ", tab: "と" },
  { re: /バイオハザード\s*RE|バイオ\s*RE|RE\s*:?\s*2/i, nick: null, tab: "は" },
  { re: /バイオハザード\s*6|eバイオ|バイオ\s*6/i, nick: null, tab: "は" },
  { re: /エヴァンゲリオン|^エヴァ|ゴジエヴァ/i, nick: null, tab: "え" },
];

export function getMachineKanaTab(machine) {
  if (machine?.picker_index) return machine.picker_index;

  const blob = [
    machine?.picker_label,
    machine?.display_name,
    ...(machine?.names || []),
    machine?.id,
  ]
    .filter(Boolean)
    .join(" ");

  for (const hint of SERIES_NICK_HINTS) {
    if (hint.tab && hint.re.test(blob)) return hint.tab;
  }

  const label = getPickerLabel(machine);
  const first = label.charAt(0);
  if (!first) return OTHER_TAB;

  const kana = normalizeToKanaTab(first);
  if (kana !== OTHER_TAB) return kana;

  if (KANJI_TAB_HINTS[first]) {
    return normalizeToKanaTab(KANJI_TAB_HINTS[first]);
  }

  return OTHER_TAB;
}

/** @deprecated use getMachineKanaTab */
export function getMachineGyo(machine) {
  return getMachineKanaTab(machine);
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
  const keywords = (group.keywords || []).map((k) => k.toLowerCase());
  return all.filter((m) => keywords.some((k) => machineSearchText(m).includes(k)));
}

export function filterMachines(machines, { kana = "all", query = "", seriesId = null }) {
  const q = query.trim().toLowerCase();

  if (seriesId) {
    return machines.filter((m) => resolveSeriesMachines({ machines }, seriesId).some((x) => x.id === m.id));
  }

  return machines.filter((m) => {
    const text = machineSearchText(m);
    if (q) return text.includes(q);
    if (kana === "all") return true;
    if (kana === OTHER_TAB) return getMachineKanaTab(m) === OTHER_TAB;
    return getMachineKanaTab(m) === kana;
  });
}

export function mountMachinePicker(modalEl, db, handlers) {
  const { getSelectedId, onSelect, onClose } = handlers;

  const tabsEl = modalEl.querySelector("#pickerGyoTabs");
  const seriesEl = modalEl.querySelector("#pickerSeriesChips");
  const searchEl = modalEl.querySelector("#pickerSearch");
  const listEl = modalEl.querySelector("#pickerList");
  const currentEl = modalEl.querySelector("#pickerCurrent");
  let activeKana = "all";
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
          activeKana = "all";
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
    allBtn.className = `picker-gyo-tab${activeKana === "all" ? " active" : ""}`;
    allBtn.textContent = "すべて";
    allBtn.onclick = () => {
      activeKana = "all";
      activeSeriesId = null;
      renderTabs();
      renderSeriesChips();
      renderList();
    };
    tabsEl.appendChild(allBtn);

    for (const kana of KANA_TABS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `picker-gyo-tab${kana === activeKana ? " active" : ""}`;
      btn.textContent = kana;
      btn.onclick = () => {
        activeKana = kana;
        activeSeriesId = null;
        renderTabs();
        renderSeriesChips();
        renderList();
      };
      tabsEl.appendChild(btn);
    }

    const otherBtn = document.createElement("button");
    otherBtn.type = "button";
    otherBtn.className = `picker-gyo-tab${activeKana === OTHER_TAB ? " active" : ""}`;
    otherBtn.textContent = OTHER_TAB;
    otherBtn.onclick = () => {
      activeKana = OTHER_TAB;
      activeSeriesId = null;
      renderTabs();
      renderSeriesChips();
      renderList();
    };
    tabsEl.appendChild(otherBtn);
  }

  function renderList() {
    const selected = getSelectedId();
    let items;
    if (activeSeriesId) {
      items = resolveSeriesMachines(db, activeSeriesId);
    } else {
      items = filterMachines(allOptions(), {
        kana: activeKana,
        query: searchEl.value,
      });
    }
    listEl.innerHTML = "";
    if (!items.length) {
      const hint =
        searchEl.value.trim() || activeSeriesId
          ? "該当なし — 検索語を変えるか「すべて」を選んでください"
          : "該当なし — 「すべて」か検索（例: エヴァ）を使ってください";
      listEl.innerHTML = `<p class="picker-empty">${hint}</p>`;
      return;
    }
    for (const m of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `picker-item${m.id === selected ? " selected" : ""}`;
      const title = getPickerLabel(m);
      const group = pickDisplayName(m);
      const official = m.names?.[0] && m.names[0] !== title ? m.names[0] : "";
      const denom = m.first_hit_denom ? `1/${Math.round(m.first_hit_denom)}` : "";
      const seriesTag = (m.series || [])[0] ? `<span class="picker-item-tag">${m.series[0]}</span>` : "";
      const sub = official || (group && group !== title ? group : "");
      btn.innerHTML = `${seriesTag}<span class="picker-item-name">${title}</span><span class="picker-item-meta">${denom}</span>${
        sub ? `<span class="picker-item-sub">${sub}</span>` : ""
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
      activeKana = "all";
      activeSeriesId = null;
      renderTabs();
      renderSeriesChips();
    }
    renderList();
  };
  searchEl.placeholder = "例: エヴァ、バイオ、RE2、東リベ";

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
    open(kana) {
      activeKana = kana || "all";
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
      activeKana = "all";
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
