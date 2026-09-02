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

/** 数字 → かな読み（検索・タブ用） */
const DIGIT_READINGS = {
  "0": ["ぜろ", "れい", "ゼロ"],
  "1": ["いち", "わん", "ワン"],
  "2": ["に", "ツー", "つー"],
  "3": ["さん", "スリー", "すりー"],
  "4": ["よん", "し", "フォー"],
  "5": ["ご", "ファイブ"],
  "6": ["ろく", "シックス"],
  "7": ["なな", "しち", "セブン"],
  "8": ["はち", "エイト"],
  "9": ["きゅう", "く", "ナイン"],
};

/** よく出る漢字・複合語の読み（検索ヒット用） */
const WORD_READINGS = [
  ["東京リベンジャーズ", ["とうきょうりべんじゃーず", "とうりべ", "ひがしりべ"]],
  ["東京", ["とうきょう", "とう"]],
  ["東リベ", ["とうりべ", "とうきょうりべ"]],
  ["新世紀", ["しんせいき"]],
  ["新", ["しん"]],
  ["機動戦士", ["きどうせんし"]],
  ["機動", ["きどう"]],
  ["戦国", ["せんごく"]],
  ["戦", ["せん"]],
  ["大海", ["おおうみ"]],
  ["大", ["だい", "おお"]],
  ["物語", ["ものがたり"]],
  ["化物語", ["ばけものがたり"]],
  ["化", ["ばけ", "か"]],
  ["呪術", ["じゅじゅつ"]],
  ["鬼滅", ["きめつ"]],
  ["鬼", ["おに", "き"]],
  ["進撃", ["しんげき"]],
  ["進", ["しん"]],
  ["銀魂", ["ぎんたま"]],
  ["銀", ["ぎん"]],
  ["金", ["きん"]],
  ["黒", ["くろ"]],
  ["白", ["しろ", "はく"]],
  ["青", ["あお"]],
  ["赤", ["あか"]],
  ["黄", ["き"]],
  ["海", ["うみ"]],
  ["火", ["ひ", "か"]],
  ["花", ["はな"]],
  ["神", ["かみ", "しん"]],
  ["魔", ["ま"]],
  ["龍", ["りゅう"]],
  ["竜", ["りゅう"]],
  ["獣", ["けもの", "じゅう"]],
  ["侍", ["さむらい"]],
  ["忍", ["にん", "しのび"]],
  ["押忍", ["おす"]],
  ["番長", ["ばんちょう"]],
  ["無双", ["むそう"]],
  ["超", ["ちょう"]],
  ["聖", ["せい"]],
  ["百", ["ひゃく"]],
  ["千", ["せん"]],
  ["万", ["まん"]],
  ["一", ["いち"]],
  ["二", ["に"]],
  ["三", ["さん"]],
  ["四", ["よん", "し"]],
  ["五", ["ご"]],
  ["六", ["ろく"]],
  ["七", ["なな"]],
  ["八", ["はち"]],
  ["九", ["きゅう"]],
  ["零", ["れい"]],
  ["喰種", ["ぐーる", "ぐール"]],
  ["炎炎", ["えんえん"]],
  ["消防", ["しょうぼう"]],
  ["彼女", ["かのじょ"]],
  ["異世界", ["いせかい"]],
  ["魔法", ["まほう"]],
  ["少女", ["しょうじょ"]],
  ["愛", ["あい"]],
  ["清流", ["せいりゅう"]],
  ["義風", ["ぎふう"]],
  ["慶次", ["けいじ"]],
  ["リング", ["りんぐ"]],
  ["からくり", ["からくり"]],
  ["うたわれるもの", ["うたわれるもの"]],
  ["バイオハザード", ["ばいおはざーど", "ばいお"]],
  ["エヴァンゲリオン", ["えゔぁんげりおん", "えばんげりおん", "エヴァ"]],
  ["ゴジラ", ["ごじら"]],
  ["ガンダム", ["がんだむ"]],
];

/** 漢字タイトル先頭 → 五十音タブ */
const KANJI_TAB_HINTS = {
  東: "と",
  新: "し",
  機: "き",
  戦: "せ",
  化: "は", // 化物語＝ばけもの → は行
  大: "お", // 大海＝おおうみ → お（だいより通称優先）
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
  呪: "し", // じゅ → し
  鬼: "お",
  進: "し",
  一: "い",
  二: "に",
  三: "さ",
  四: "よ",
  五: "こ",
  六: "ろ",
  七: "な",
  八: "は",
  九: "き",
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
  忍: "に",
  押: "お",
  喰: "く",
  炎: "え",
  消: "し",
  彼: "か",
  異: "い",
  魔: "ま",
  愛: "あ",
  清: "せ",
  義: "き",
  慶: "け",
  環: "か",
  美: "み",
  夜: "よ",
  夢: "ゆ",
  星: "ほ",
  月: "つ",
  風: "ふ",
  水: "み",
  山: "や",
  川: "か",
  空: "そ",
  天: "て",
  地: "ち",
  王: "お",
  帝: "て",
  軍: "く",
  隊: "た",
  者: "も",
  物: "も",
  語: "こ",
};

/** 通称ヒント（表示名・タブ両用） */
const SERIES_NICK_HINTS = [
  { re: /東京リベンジャー|東リベ/i, nick: "東リベ", tab: "と" },
  { re: /バイオハザード\s*RE|バイオ\s*RE|RE\s*:?\s*2/i, nick: null, tab: "は" },
  { re: /バイオハザード\s*6|eバイオ|バイオ\s*6/i, nick: null, tab: "は" },
  { re: /エヴァンゲリオン|エヴァ|ゴジエヴァ/i, nick: null, tab: "え" },
  { re: /CR\s*パチンコ\s*777|パチンコ\s*777|\b777\b/i, nick: null, tab: "な" },
];

function fullWidthToHalf(str) {
  return String(str || "").replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
  );
}

/** テキスト中の数字・漢字をかな読みに展開（検索用） */
export function expandReadings(text) {
  let s = fullWidthToHalf(text);
  const out = new Set([s, s.toLowerCase()]);

  // 複合語・漢字読み
  for (const [word, readings] of WORD_READINGS) {
    if (s.includes(word)) {
      for (const r of readings) out.add(r.toLowerCase());
    }
  }

  // 数字列（777 → なな… / いち…）
  const digitRuns = s.match(/\d+/g) || [];
  for (const run of digitRuns) {
    const byDigit = [...run]
      .map((d) => (DIGIT_READINGS[d] ? DIGIT_READINGS[d][0] : ""))
      .join("");
    if (byDigit) out.add(byDigit);
    // 先頭桁だけでもタブ・短い検索用
    if (DIGIT_READINGS[run[0]]) {
      for (const r of DIGIT_READINGS[run[0]]) out.add(r);
    }
    if (run === "777") {
      out.add("なな");
      out.add("すりーせぶん");
      out.add("スリーセブン".toLowerCase());
    }
  }

  // 先頭1文字の読み
  const first = cleanHallLabel(s).charAt(0);
  if (DIGIT_READINGS[first]) {
    for (const r of DIGIT_READINGS[first]) out.add(r);
  }
  if (KANJI_TAB_HINTS[first]) out.add(KANJI_TAB_HINTS[first]);

  return [...out].filter(Boolean);
}

function firstReadingTab(label) {
  const cleaned = cleanHallLabel(label);
  if (!cleaned) return OTHER_TAB;
  const first = fullWidthToHalf(cleaned).charAt(0);

  const kana = normalizeToKanaTab(first);
  if (kana !== OTHER_TAB) return kana;

  if (DIGIT_READINGS[first]) {
    return normalizeToKanaTab(DIGIT_READINGS[first][0].charAt(0));
  }

  if (KANJI_TAB_HINTS[first]) {
    return normalizeToKanaTab(KANJI_TAB_HINTS[first]);
  }

  // 英字先頭 → だいたいカタカナ読みの近似は難しいので「他」
  return OTHER_TAB;
}

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

  return firstReadingTab(getPickerLabel(machine));
}

/** @deprecated use getMachineKanaTab */
export function getMachineGyo(machine) {
  return getMachineKanaTab(machine);
}

export function machineSearchText(machine) {
  const base = [
    getPickerLabel(machine),
    pickDisplayName(machine),
    ...(machine?.names || []),
    machine?.id,
    ...(machine?.series || []),
  ]
    .filter(Boolean)
    .join(" ");

  const readings = expandReadings(base);
  // names 個別にも展開
  for (const n of machine?.names || []) {
    for (const r of expandReadings(n)) readings.push(r);
  }
  return [...new Set([base.toLowerCase(), ...readings.map((r) => r.toLowerCase())])].join(" ");
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
