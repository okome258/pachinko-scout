#!/usr/bin/env python3
"""DMMぱちタウンからパチンコ機種スペックを取得し machines.json を更新する。

一覧ページ: 名前・dmm_id・初当り確率（低/高）
詳細ページ: LT/RUSH突入率・継続率・出玉・電サポなど → ev_spec
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

BASE_URL = "https://p-town.dmm.com/machines/pachinko"
DMM_MACHINE_URL = "https://p-town.dmm.com/machines/{id}"
MAX_PAGES = 8
USER_AGENT = "PachinkoScoutBot/1.0 (+https://github.com/okome258/pachinko-scout)"


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=45) as res:
        return res.read().decode("utf-8", errors="replace")


def slugify(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9\u3040-\u9fff]+", "_", name.strip())
    return ("p_" + s[:40]).lower()


def hall_display_name(name: str) -> str:
    """メーカー冠・型式プレフィックスを落としたホール通称。"""
    s = str(name or "")
    s = re.sub(r"^(P|PA|e|CR|Ｐ|ＣＲ)\s*", "", s, flags=re.I)
    s = re.sub(r"^(フィーバー|FEVER)\s*", "", s, flags=re.I)
    s = re.sub(r"\s*(フィーバー|FEVER)\s*", " ", s, flags=re.I)
    s = re.sub(r"第\s*\d+\s*世代", "", s)
    s = re.sub(r"(スマパチ|ぱちんこ|パチンコ)\s*", "", s)
    s = re.sub(r"\s*LT[- ]?Light\s*ver\.?", " Light", s, flags=re.I)
    s = re.sub(r"\s*Light\s*ver\.?", " Light", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip()


def infer_type(denom: float) -> str:
    if denom <= 120:
        return "amadeji"
    if denom <= 250:
        return "light_mid"
    if denom <= 400:
        return "mid"
    return "heavy"


def infer_lt_critical(machine_type: str, name: str) -> bool:
    if machine_type in ("amadeji", "light_mid"):
        return False
    if re.search(r"羽根|羽根物|甘|99ver|119ver|遊タイム|ちょいパチ", name, re.I):
        return False
    return True


def default_ceiling(denom: float) -> int:
    return int(round(denom * 2.8))


def parse_percent(text: str | None) -> float | None:
    if not text or text.strip() in ("-", "―", "－", "なし"):
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*%", text)
    return round(float(m.group(1)) / 100, 4) if m else None


def parse_total_percent(text: str | None) -> float | None:
    if not text:
        return None
    m = re.search(r"トータル[^%]{0,40}?約?\s*(\d+(?:\.\d+)?)\s*%", text)
    if m:
        return round(float(m.group(1)) / 100, 4)
    m = re.search(r"合算[^%]{0,40}?約?\s*(\d+(?:\.\d+)?)\s*%", text)
    return round(float(m.group(1)) / 100, 4) if m else None


def parse_denoms(text: str | None) -> dict[str, float | None]:
    result: dict[str, float | None] = {
        "first_hit_denom": None,
        "high_prob_denom": None,
        "rush_denom": None,
        "lt_denom": None,
    }
    if not text:
        return result

    for m in re.finditer(r"1/([\d.]+)(?:\s*[（(]([^）)]+)[）)])?", text):
        denom = float(m.group(1))
        label = (m.group(2) or "").lower()
        if any(k in label for k in ("高確", "右打", "確変", "突入", "rush", "st中", "lt中", "電サ")):
            if result["high_prob_denom"] is None or denom < result["high_prob_denom"]:
                result["high_prob_denom"] = denom
            if "rush" in label or "st" in label:
                result["rush_denom"] = denom
            if "lt" in label:
                result["lt_denom"] = denom
        elif any(k in label for k in ("通常", "低確", "初当", "ヘソ")):
            result["first_hit_denom"] = denom
        elif result["first_hit_denom"] is None:
            result["first_hit_denom"] = denom
        elif result["high_prob_denom"] is None and denom < result["first_hit_denom"]:
            result["high_prob_denom"] = denom

    if result["first_hit_denom"] is None:
        m = re.search(r"1/([\d.]+)", text)
        if m:
            result["first_hit_denom"] = float(m.group(1))

    return result


def parse_payouts(text: str | None) -> list[int]:
    if not text:
        return []
    nums = [int(float(x)) for x in re.findall(r"(\d{2,5})", text)]
    nums = [n for n in nums if 100 <= n <= 99999]
    return sorted(set(nums))


def parse_spins_list(text: str | None) -> list[int]:
    if not text:
        return []
    return sorted({int(float(x)) for x in re.findall(r"(\d+)\s*回", text)})


def parse_overview_rates(text: str | None) -> dict[str, float | None]:
    rates: dict[str, float | None] = {
        "rush_entry_rate": None,
        "lt_entry_rate": None,
        "lt_entry_rate_total": None,
    }
    if not text:
        return rates

    for m in re.finditer(r"初当[りリ][^。\n%]{0,50}?約?\s*(\d+(?:\.\d+)?)\s*%", text):
        rates["rush_entry_rate"] = round(float(m.group(1)) / 100, 4)
        break

    m = re.search(r"RUSH[^。\n%]{0,40}?約?\s*(\d+(?:\.\d+)?)\s*%", text, re.I)
    if m and rates["rush_entry_rate"] is None:
        rates["rush_entry_rate"] = round(float(m.group(1)) / 100, 4)

    m = re.search(r"ST[^。\n%]{0,40}?トータル[^。\n%]{0,30}?約?\s*(\d+(?:\.\d+)?)\s*%", text, re.I)
    if m:
        rates["lt_entry_rate_total"] = round(float(m.group(1)) / 100, 4)

    m = re.search(r"トータル[^。\n%]{0,30}?ST[^。\n%]{0,30}?約?\s*(\d+(?:\.\d+)?)\s*%", text, re.I)
    if m and rates["lt_entry_rate_total"] is None:
        rates["lt_entry_rate_total"] = round(float(m.group(1)) / 100, 4)

    m = re.search(r"初当[りリ][^。\n%]{0,50}?(\d+(?:\.\d+)?)\s*%[^。\n]{0,30}?ST", text, re.I)
    if m:
        rates["lt_entry_rate"] = round(float(m.group(1)) / 100, 4)

    return rates


def infer_machine_mode(specs: dict[str, str], overview: str) -> str:
    blob = " ".join(specs.values()) + " " + overview
    if specs.get("確変突入率") and specs["確変突入率"].strip() not in ("-", "―"):
        return "kakuhen"
    if re.search(r"RUSH|ゾンデミック|連チャン", blob, re.I):
        return "rush_lt"
    if re.search(r"LT|ラッキートリガー|ST\d+", blob, re.I):
        return "lt_st"
    if re.search(r"遊タイム|甘デジ|羽根", blob):
        return "amadeji"
    return "unknown"


def parse_spec_table(html: str) -> dict[str, str]:
    specs: dict[str, str] = {}
    for m in re.finditer(
        r'<th class="th">([^<]+)</th>\s*<td class="td">\s*(.*?)\s*</td>',
        html,
        re.S,
    ):
        key = re.sub(r"\s+", " ", m.group(1)).strip()
        val = re.sub(r"<[^>]+>", " ", m.group(2))
        val = re.sub(r"\s+", " ", val).strip()
        specs[key] = val
    return specs


def build_ev_spec(dmm_id: str, specs: dict[str, str], listing_high: float | None = None) -> dict:
    prob_text = specs.get("大当り確率", "")
    denoms = parse_denoms(prob_text)
    if listing_high and denoms["high_prob_denom"] is None:
        denoms["high_prob_denom"] = listing_high

    payouts = parse_payouts(specs.get("大当り出玉"))
    small_hit = payouts[0] if payouts else 300
    big_payouts = [p for p in payouts if p >= 1000]
    avg_big = round(sum(big_payouts) / len(big_payouts)) if big_payouts else None

    kakuhen_entry = parse_percent(specs.get("確変突入率"))
    lt_entry_text = specs.get("LT突入率")
    lt_entry = None
    if lt_entry_text and not re.search(r"フォーチュン|ST中|RUSH中|ゾンデミック", lt_entry_text, re.I):
        lt_entry = parse_percent(lt_entry_text)
    lt_entry_total = parse_total_percent(lt_entry_text) or parse_total_percent(specs.get("機種概要", ""))

    overview = specs.get("機種概要", "")
    overview_rates = parse_overview_rates(overview)

    rush_zone_text = None
    for key, val in specs.items():
        if re.search(r"ゾーン突入|RUSH突入", key, re.I):
            rush_zone_text = val
            break
    rush_entry = overview_rates["rush_entry_rate"]
    if rush_zone_text:
        percents = re.findall(r"(\d+(?:\.\d+)?)\s*%", rush_zone_text)
        if percents:
            rush_entry = round(float(percents[0]) / 100, 4)
        else:
            m = re.search(r"通常[^%]{0,20}?(\d+(?:\.\d+)?)\s*%", rush_zone_text)
            if m:
                rush_entry = round(float(m.group(1)) / 100, 4)
    if lt_entry is None and overview_rates["lt_entry_rate"]:
        lt_entry = overview_rates["lt_entry_rate"]
    if lt_entry is None:
        for key, val in specs.items():
            if not re.search(r"突入率", key):
                continue
            if re.search(r"確変|ゾーン|RUSH|連チャン", key, re.I):
                continue
            if key in ("LT突入率",):
                continue
            p = parse_percent(val)
            if p is not None:
                lt_entry = p
                break
    if lt_entry_total is None and overview_rates["lt_entry_rate_total"]:
        lt_entry_total = overview_rates["lt_entry_rate_total"]

    lt_cont = parse_percent(specs.get("LT継続率"))
    spins = parse_spins_list(specs.get("電サポ回転数"))
    mode = infer_machine_mode(specs, overview)

    rush_cont = None
    m = re.search(r"RUSH[^。\n]{0,30}?継続率[^。\n]{0,10}?約?\s*(\d+(?:\.\d+)?)\s*%", overview, re.I)
    if m:
        rush_cont = round(float(m.group(1)) / 100, 4)

    if mode == "rush_lt":
        entry_primary = rush_entry or lt_entry_total or lt_entry
    elif mode == "lt_st":
        entry_primary = lt_entry_total or lt_entry or rush_entry
    elif mode == "kakuhen":
        entry_primary = kakuhen_entry or lt_entry_total
    else:
        entry_primary = lt_entry_total or lt_entry or rush_entry or kakuhen_entry

    ev: dict = {
        "spec_level": "detail",
        "dmm_id": dmm_id,
        "dmm_url": DMM_MACHINE_URL.format(id=dmm_id),
        "machine_mode": mode,
        "first_hit_denom": denoms["first_hit_denom"],
        "high_prob_denom": denoms["high_prob_denom"],
        "rush_denom": denoms["rush_denom"],
        "lt_denom": denoms["lt_denom"],
        "kakuhen_entry_rate": kakuhen_entry,
        "rush_entry_rate": rush_entry,
        "lt_entry_rate": lt_entry,
        "lt_entry_rate_total": lt_entry_total,
        "entry_rate_primary": entry_primary,
        "lt_continuation_rate": lt_cont,
        "rush_continuation_rate": rush_cont,
        "continuation_rate": lt_cont or rush_cont,
        "payouts": payouts,
        "small_hit_payout": small_hit,
        "avg_big_payout": avg_big,
        "electric_support_spins": spins,
        "fetched": date.today().isoformat(),
    }

    # 理論インデックス: 初当り後の「稼げるモード」入りやすさ × 出玉 / 初当り確率
    if entry_primary and denoms["first_hit_denom"]:
        payout_est = avg_big or (payouts[-1] if payouts else 1500)
        ev["theoretical_index"] = round(
            entry_primary * payout_est / denoms["first_hit_denom"] * 100,
            2,
        )
    else:
        ev["theoretical_index"] = None

    return {k: v for k, v in ev.items() if v is not None}


def parse_machines_from_html(html: str) -> list[dict]:
    machines: list[dict] = []
    seen: set[str] = set()

    for m in re.finditer(
        r'<li class="unit"><a class="link" href="/machines/(\d+)">(.*?)</a></li>',
        html,
        re.S,
    ):
        dmm_id = m.group(1)
        block = m.group(2)
        title_m = re.search(r'<p class="title">([^<]+)</p>', block)
        if not title_m:
            continue
        name = re.sub(r"\s+", " ", title_m.group(1)).strip()
        if not name or len(name) < 3:
            continue

        prob_m = re.search(r"大当[りリ]確率\s*[:：]\s*([^<]+)", block, re.S)
        if not prob_m:
            continue

        prob_line = re.sub(r"<[^>]+>", " ", prob_m.group(1))
        denoms = parse_denoms(prob_line)
        denom = denoms["first_hit_denom"]
        if not denom:
            continue

        mid = slugify(name)
        if mid in seen:
            continue
        seen.add(mid)

        mtype = infer_type(denom)
        machines.append(
            {
                "id": mid,
                "display_name": hall_display_name(name),
                "names": [name, re.sub(r"^[PePAe]+", "", name).strip()],
                "type": mtype,
                "first_hit_denom": round(denom, 1),
                "high_prob_denom": round(denoms["high_prob_denom"], 1)
                if denoms["high_prob_denom"]
                else None,
                "dmm_id": dmm_id,
                "ceiling_spins": default_ceiling(denom),
                "lt_critical": infer_lt_critical(mtype, name),
                "small_hit_max": 300 if mtype in ("mid", "heavy") else 450,
                "good_hit_min": 3000 if mtype in ("mid", "heavy") else 2000,
                "ceiling_near_ratio": 0.75,
                "source": "dmm_ptown",
                "ev_spec": {
                    "spec_level": "listing",
                    "dmm_id": dmm_id,
                    "first_hit_denom": round(denom, 1),
                    "high_prob_denom": round(denoms["high_prob_denom"], 1)
                    if denoms["high_prob_denom"]
                    else None,
                },
            }
        )

    return machines


def fetch_detail_ev_spec(dmm_id: str, listing_high: float | None = None) -> dict | None:
    try:
        html = fetch_html(DMM_MACHINE_URL.format(id=dmm_id))
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"  detail {dmm_id} failed: {exc}", file=sys.stderr)
        return None
    specs = parse_spec_table(html)
    if not specs.get("大当り確率"):
        return None
    return build_ev_spec(dmm_id, specs, listing_high)


def merge_ev_spec(old: dict | None, new: dict | None) -> dict | None:
    if not new:
        return old
    if old and old.get("ev_spec_locked"):
        return old
    if not old:
        return new
    merged = {**old, **new}
    # 手動で入れた theoretical_index 等は detail で上書きOK
    return merged


def merge_machines(existing: list[dict], fetched: list[dict]) -> list[dict]:
    by_id = {m["id"]: m for m in existing}
    for fm in fetched:
        if fm["id"] in by_id:
            old = by_id[fm["id"]]
            old["first_hit_denom"] = fm.get("first_hit_denom", old.get("first_hit_denom"))
            if fm.get("high_prob_denom"):
                old["high_prob_denom"] = fm["high_prob_denom"]
            if fm.get("dmm_id"):
                old["dmm_id"] = fm["dmm_id"]
            old["names"] = list(dict.fromkeys(old.get("names", []) + fm.get("names", [])))[:5]
            # picker_label がある機種は手動通称を優先。それ以外はメーカー冠を落とす
            if not old.get("picker_label") and fm.get("display_name"):
                old["display_name"] = fm["display_name"]
            elif not old.get("picker_label") and old.get("names"):
                old["display_name"] = hall_display_name(old["names"][0])
            old["ev_spec"] = merge_ev_spec(old.get("ev_spec"), fm.get("ev_spec"))
            if old.get("source", "").endswith("+manual"):
                pass
            elif "manual" in old.get("source", ""):
                old["source"] = "dmm_ptown+manual"
            else:
                old["source"] = "dmm_ptown"
        else:
            by_id[fm["id"]] = fm
    return sorted(by_id.values(), key=lambda x: x.get("names", [""])[0])


def refresh_display_names(machines: list[dict]) -> None:
    for m in machines:
        if m.get("picker_label"):
            continue
        official = (m.get("names") or [None])[0]
        if official:
            m["display_name"] = hall_display_name(official)


def enrich_with_details(machines: list[dict], sleep_sec: float, limit: int | None, force: bool = False) -> int:
    updated = 0
    targets = [m for m in machines if m.get("dmm_id")]
    if limit:
        targets = targets[:limit]

    for i, m in enumerate(targets, 1):
        dmm_id = m["dmm_id"]
        if not force and m.get("ev_spec", {}).get("spec_level") == "detail":
            fetched_today = m["ev_spec"].get("fetched") == date.today().isoformat()
            if fetched_today:
                continue

        print(f"  detail [{i}/{len(targets)}] {m['names'][0][:30]} (id={dmm_id})")
        ev = fetch_detail_ev_spec(dmm_id, m.get("high_prob_denom"))
        if ev:
            m["ev_spec"] = merge_ev_spec(m.get("ev_spec"), ev)
            if ev.get("first_hit_denom"):
                m["first_hit_denom"] = ev["first_hit_denom"]
            if ev.get("high_prob_denom"):
                m["high_prob_denom"] = ev["high_prob_denom"]
            # LT重要機種をスペックから再推定
            if ev.get("lt_entry_rate_total") or ev.get("lt_entry_rate"):
                if m.get("type") in ("mid", "heavy"):
                    m["lt_critical"] = True
            updated += 1
        if sleep_sec > 0:
            time.sleep(sleep_sec)
    return updated


def find_machines_json(root: Path) -> Path:
    for candidate in (root / "machines.json", root / "mobile" / "machines.json"):
        if candidate.exists():
            return candidate
    raise FileNotFoundError("machines.json not found")


def sync_machines_json(source: Path, root: Path) -> None:
    text = source.read_text(encoding="utf-8")
    for rel in ("mobile/machines.json", "github-root/machines.json", "github-push/machines.json"):
        dest = root / rel
        if dest.parent.exists():
            dest.write_text(text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch pachinko machine specs from DMM p-town")
    parser.add_argument("--no-detail", action="store_true", help="Skip detail page fetch")
    parser.add_argument("--detail-sleep", type=float, default=0.45, help="Seconds between detail requests")
    parser.add_argument("--list-only", action="store_true", help="Only refresh listing, no detail")
    parser.add_argument("--detail-limit", type=int, default=None, help="Max detail pages (for testing)")
    parser.add_argument("--force-detail", action="store_true", help="Re-fetch detail pages even if updated today")
    parser.add_argument("--detail-only", action="store_true", help="Skip listing, refresh detail pages only")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    target = find_machines_json(root)
    data = json.loads(target.read_text(encoding="utf-8"))
    all_fetched: list[dict] = []

    if args.detail_only:
        machines = data.get("machines", [])
        print(f"Detail-only mode: {len(machines)} machines in DB")
    else:
        print("Fetching listing pages...")
        for page in range(1, MAX_PAGES + 1):
            url = BASE_URL if page == 1 else f"{BASE_URL}?page={page}"
            try:
                html = fetch_html(url)
                batch = parse_machines_from_html(html)
                if not batch:
                    break
                all_fetched.extend(batch)
                print(f"  page {page}: +{len(batch)} machines")
            except Exception as exc:
                print(f"  page {page} skip: {exc}", file=sys.stderr)
                break

        if not all_fetched:
            print("No machines fetched from listing — keeping existing DB", file=sys.stderr)
            machines = data.get("machines", [])
        else:
            machines = merge_machines(data.get("machines", []), all_fetched)
            print(f"Listing merged: {len(machines)} machines")

    if not args.no_detail and not args.list_only:
        print("Fetching detail pages...")
        n = enrich_with_details(machines, args.detail_sleep, args.detail_limit, force=args.force_detail)
        detail_count = sum(1 for m in machines if m.get("ev_spec", {}).get("spec_level") == "detail")
        print(f"  detail updated this run: {n} (total with detail spec: {detail_count})")

    data["machines"] = machines
    refresh_display_names(machines)
    data["version"] = date.today().isoformat()
    data["updated"] = date.today().isoformat()
    data["fetch_source"] = "dmm_ptown+detail"
    data["machine_count"] = len(machines)
    data["detail_spec_count"] = sum(
        1 for m in machines if m.get("ev_spec", {}).get("spec_level") == "detail"
    )

    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sync_machines_json(target, root)
    print(f"Wrote {len(machines)} machines ({data['detail_spec_count']} with detail ev_spec) to {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
