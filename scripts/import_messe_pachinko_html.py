"""Import one user-saved Minrepo pachinko report into SQLite.

This program deliberately does not fetch any website. Save the publicly viewed
report in a browser, then pass that local HTML file to this importer.
"""

from __future__ import annotations

import argparse
import re
import sqlite3
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path


class TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tables: list[list[list[str]]] = []
        self._table: list[list[str]] | None = None
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "table":
            self._table = []
        elif tag == "tr" and self._table is not None:
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = []

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._cell is not None and self._row is not None:
            self._row.append("".join(self._cell).strip())
            self._cell = None
        elif tag == "tr" and self._row is not None and self._table is not None:
            if self._row:
                self._table.append(self._row)
            self._row = None
        elif tag == "table" and self._table is not None:
            self.tables.append(self._table)
            self._table = None


def parse_number(value: str) -> int:
    cleaned = re.sub(r"[^\d-]", "", value.replace("−", "-"))
    return int(cleaned)


def report_date(html: str, explicit: str | None) -> str:
    if explicit:
        return explicit
    match = re.search(r'"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})', html)
    if not match:
        raise ValueError("--date is required when datePublished is absent from the saved HTML")
    return match.group(1)


def extract_rows(html: str) -> list[tuple[str, str, int, int]]:
    parser = TableParser()
    parser.feed(html)
    rows: list[tuple[str, str, int, int]] = []
    for table in parser.tables:
        for index, header in enumerate(table):
            if header[:4] != ["機種", "台番", "差玉", "回転数"]:
                continue
            for values in table[index + 1 :]:
                if values[:4] == header[:4]:
                    continue
                if len(values) < 4:
                    continue
                try:
                    machine, unit = values[0].strip(), str(parse_number(values[1]))
                    net, spins = parse_number(values[2]), parse_number(values[3])
                except ValueError:
                    continue
                if machine:
                    rows.append((machine, unit, net, spins))
    if not rows:
        raise ValueError("機種・台番・差玉・回転数の全台表を見つけられませんでした")
    return rows


def init_db(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS pachinko_daily_stats (
          hall_id TEXT NOT NULL,
          game_date TEXT NOT NULL,
          unit_number TEXT NOT NULL,
          machine_name TEXT NOT NULL,
          spins INTEGER NOT NULL,
          net_balls INTEGER NOT NULL,
          source_url TEXT NOT NULL,
          imported_at TEXT NOT NULL,
          PRIMARY KEY (hall_id, game_date, unit_number)
        )
        """
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="Import a saved Messe Musashisakai Minrepo report")
    ap.add_argument("--html", type=Path, required=True, help="browser-saved Minrepo full-machine HTML")
    ap.add_argument("--source-url", required=True, help="original public report URL, kept for attribution")
    ap.add_argument("--db", type=Path, default=Path("data/messe_pachinko.sqlite"))
    ap.add_argument("--date", help="YYYY-MM-DD; otherwise read schema.org datePublished")
    args = ap.parse_args()

    html = args.html.read_text(encoding="utf-8")
    date = report_date(html, args.date)
    rows = extract_rows(html)
    args.db.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()

    with sqlite3.connect(args.db) as connection:
        init_db(connection)
        connection.executemany(
            """
            INSERT INTO pachinko_daily_stats
              (hall_id, game_date, unit_number, machine_name, spins, net_balls, source_url, imported_at)
            VALUES ('100686', ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(hall_id, game_date, unit_number) DO UPDATE SET
              machine_name=excluded.machine_name, spins=excluded.spins, net_balls=excluded.net_balls,
              source_url=excluded.source_url, imported_at=excluded.imported_at
            """,
            [(date, unit, machine, spins, net, args.source_url, now) for machine, unit, net, spins in rows],
        )
    print(f"Imported {len(rows)} rows for {date} into {args.db}")


if __name__ == "__main__":
    main()
