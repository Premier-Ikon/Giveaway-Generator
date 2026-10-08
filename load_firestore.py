"""Load Fly a Fan entries into the named Firestore database.

Each stored row is an id, a source, and how many drawing lines that id has.
Shopify purchases use the customer email as the id, the customer name for the
live read, and source "gotbluff". Entry weight stays Net sales × 5. The spin
quest file is one line per entry, with that id and source "spin quest".
"""

import csv
import hashlib
import io
import subprocess
import sys
import zipfile
from pathlib import Path

from google.cloud import firestore
from google.oauth2.credentials import Credentials

from config import DATABASE, MULTIPLIER, PROJECT

ORDERS_ZIP = Path("/Users/dylanguzman/Downloads/SWEEPSTAKES REPORT - 2026-08-19 - 2026-09-30.csv.zip")
SPIN_ZIP = Path("/Users/dylanguzman/Downloads/bluff_aug19_sep30_entries.txt.zip")
CHUNK_ROWS = 400
GOTBLUFF = "gotbluff"
SPIN_QUEST = "spin quest"


def client():
    token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
    return firestore.Client(project=PROJECT, database=DATABASE, credentials=Credentials(token))


def entry_count(value):
    try:
        count = int(float(value) * MULTIPLIER)
    except (TypeError, ValueError):
        return 0
    return count if count > 0 else 0


def read_zip_csv(path):
    with zipfile.ZipFile(path) as archive:
        name = next(
            item
            for item in archive.namelist()
            if item.endswith(".csv") and not item.startswith("__MACOSX") and not Path(item).name.startswith("._")
        )
        text = io.TextIOWrapper(archive.open(name), encoding="utf-8-sig", newline="")
        return list(csv.DictReader(text))


def add_entry(order, totals, ident, count, fold):
    key = ident.casefold() if fold else ident
    row = totals.get(key)
    if row is None:
        row = {"id": ident, "entries": 0}
        totals[key] = row
        order.append(key)
    row["entries"] += count


def gotbluff_rows():
    order = []
    totals = {}
    for record in read_zip_csv(ORDERS_ZIP):
        count = entry_count(record.get("Net sales"))
        email = (record.get("Customer email") or "").strip()
        name = (record.get("Customer name") or "").strip()
        if count <= 0 or not email:
            continue
        add_entry(order, totals, email, count, fold=True)
        if name and not totals[email.casefold()].get("name"):
            totals[email.casefold()]["name"] = name
    return [
        {
            "id": totals[key]["id"],
            "name": totals[key].get("name", ""),
            "source": GOTBLUFF,
            "entries": totals[key]["entries"],
        }
        for key in order
    ]


def spin_quest_rows():
    order = []
    totals = {}
    with zipfile.ZipFile(SPIN_ZIP) as archive:
        name = next(
            item
            for item in archive.namelist()
            if item.endswith(".txt") and not item.startswith("__MACOSX") and not Path(item).name.startswith("._")
        )
        with archive.open(name) as raw:
            for line in raw:
                ident = line.decode("utf-8", "replace").strip()
                if ident:
                    add_entry(order, totals, ident, 1, fold=False)
    return [{"id": totals[key]["id"], "source": SPIN_QUEST, "entries": totals[key]["entries"]} for key in order]


def wipe(db, collection):
    removed = 0
    while True:
        docs = list(db.collection(collection).limit(400).stream())
        if not docs:
            return removed
        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()
        removed += len(docs)


def write_chunks(db, source, rows):
    written = 0
    batch = db.batch()
    pending = 0
    slug = "gotbluff" if source == GOTBLUFF else "spinquest"
    for index in range(0, len(rows), CHUNK_ROWS):
        chunk = rows[index:index + CHUNK_ROWS]
        ref = db.collection("runs").document(f"{slug}-{index // CHUNK_ROWS:05d}")
        batch.set(ref, {
            "source": source,
            "index": index // CHUNK_ROWS,
            "rows": chunk,
        })
        pending += 1
        written += 1
        if pending == 25:
            batch.commit()
            batch = db.batch()
            pending = 0
            print(f"  wrote {written} chunks for {source}")
    if pending:
        batch.commit()
    return written


def main():
    gotbluff = gotbluff_rows()
    spin_quest = spin_quest_rows()
    gotbluff_lines = sum(row["entries"] for row in gotbluff)
    spin_lines = sum(row["entries"] for row in spin_quest)
    print(f"gotbluff ids {len(gotbluff):,} lines {gotbluff_lines:,}")
    print(f"spin quest ids {len(spin_quest):,} lines {spin_lines:,}")
    print(f"total lines {gotbluff_lines + spin_lines:,}")

    db = client()
    print(f"clearing previous data in {DATABASE}")
    print(f"removed {wipe(db, 'runs')} old chunks")
    gotbluff_chunks = write_chunks(db, GOTBLUFF, gotbluff)
    spin_chunks = write_chunks(db, SPIN_QUEST, spin_quest)
    db.collection("meta").document("summary").set({
        "title": "Bluff Fly a Fan Sep 2026",
        "multiplier": MULTIPLIER,
        "totalLines": gotbluff_lines + spin_lines,
        "gotbluffLines": gotbluff_lines,
        "spinQuestLines": spin_lines,
        "gotbluffIds": len(gotbluff),
        "spinQuestIds": len(spin_quest),
        "files": [
            {"id": GOTBLUFF, "label": "Shopify", "lines": gotbluff_lines, "rule": "email, Net sales × 5"},
            {"id": SPIN_QUEST, "label": "Spin quest", "lines": spin_lines, "rule": "one line per entry"},
        ],
    })
    print(f"stored {gotbluff_chunks + spin_chunks} chunks in {DATABASE}")


if __name__ == "__main__":
    main()
