"""Load the Fly a Fan sweepstakes files into the named Firestore database.

Orders: each row becomes int(Net sales × 5) drawing lines.
AMOE: each row becomes int(Ntries × 5) drawing lines.
Email, name, entry count, and phone are stored. The purchase file has no
phone column, so the number is taken from the AMOE form when the email matches.
"""

import csv
import io
import subprocess
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from google.cloud import firestore
from google.oauth2.credentials import Credentials

from config import DATABASE, MULTIPLIER, PROJECT

ORDERS_ZIP = Path("/Users/dylanguzman/Downloads/SWEEPSTAKES REPORT - 2026-08-19 - 2026-09-30.csv.zip")
AMOE_ZIP = Path("/Users/dylanguzman/Downloads/AUGUST-SEPTEMBER 2026 FLY A FAN SWEEPSTAKES AMOE.csv.zip")
CHUNK_ROWS = 400


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


def phones_by_email():
    counts = defaultdict(Counter)
    for record in read_zip_csv(AMOE_ZIP):
        email = (record.get("Email") or "").strip().lower()
        phone = (record.get("Phone Number") or "").strip()
        if email and phone:
            counts[email][phone] += 1
    chosen = {}
    several = 0
    for email, counter in counts.items():
        if len(counter) > 1:
            several += 1
        chosen[email] = counter.most_common(1)[0][0]
    return chosen, several


def orders_rows(phones):
    rows = []
    for record in read_zip_csv(ORDERS_ZIP):
        count = entry_count(record.get("Net sales"))
        if count <= 0:
            continue
        email = (record.get("Customer email") or "").strip()
        rows.append({
            "email": email,
            "name": (record.get("Customer name") or "").strip(),
            "phone": phones.get(email.lower(), ""),
            "entries": count,
        })
    return rows


def amoe_rows():
    rows = []
    for record in read_zip_csv(AMOE_ZIP):
        count = entry_count(record.get("Ntries"))
        if count <= 0:
            continue
        rows.append({
            "email": (record.get("Email") or "").strip(),
            "name": (record.get("First and Last Name") or "").strip(),
            "entries": count,
        })
    return rows


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


def write_chunks(db, source, label, rows):
    written = 0
    batch = db.batch()
    pending = 0
    for index in range(0, len(rows), CHUNK_ROWS):
        chunk = rows[index:index + CHUNK_ROWS]
        ref = db.collection("runs").document(f"{source}-{index // CHUNK_ROWS:05d}")
        batch.set(ref, {
            "source": source,
            "label": label,
            "index": index // CHUNK_ROWS,
            "rows": chunk,
        })
        pending += 1
        written += 1
        # A commit is capped at about 10 MB. Keep batches small.
        if pending == 25:
            batch.commit()
            batch = db.batch()
            pending = 0
            print(f"  wrote {written} chunks for {source}")
    if pending:
        batch.commit()
    return written


def add_phones(db, phones):
    updated = 0
    with_phone = 0
    batch = db.batch()
    pending = 0
    for doc in db.collection("runs").stream():
        data = doc.to_dict() or {}
        if data.get("source") != "orders":
            continue
        rows = data.get("rows") or []
        for row in rows:
            phone = phones.get((row.get("email") or "").strip().lower(), "")
            row["phone"] = phone
            updated += 1
            if phone:
                with_phone += 1
        batch.update(doc.reference, {"rows": rows})
        pending += 1
        if pending == 25:
            batch.commit()
            batch = db.batch()
            pending = 0
    if pending:
        batch.commit()
    return updated, with_phone


def main():
    phones, several = phones_by_email()
    print(f"amoe phones {len(phones):,}, emails with more than one number {several:,}")
    if "--phones-only" in sys.argv:
        updated, with_phone = add_phones(client(), phones)
        print(f"updated {updated:,} purchase rows, {with_phone:,} have a phone")
        return

    order_runs = orders_rows(phones)
    amoe_runs = amoe_rows()
    order_lines = sum(row["entries"] for row in order_runs)
    amoe_lines = sum(row["entries"] for row in amoe_runs)
    emails = set()
    for row in order_runs + amoe_runs:
        if row["email"]:
            emails.add(row["email"].lower())
    print(f"orders runs {len(order_runs):,} lines {order_lines:,}")
    print(f"amoe runs {len(amoe_runs):,} lines {amoe_lines:,}")
    print(f"total lines {order_lines + amoe_lines:,} people {len(emails):,}")

    db = client()
    print(f"clearing previous data in {DATABASE}")
    print(f"removed {wipe(db, 'runs')} old chunks")
    order_chunks = write_chunks(db, "orders", "Sweepstakes report", order_runs)
    amoe_chunks = write_chunks(db, "amoe", "AMOE", amoe_runs)
    db.collection("meta").document("summary").set({
        "title": "Bluff Fly a Fan Sep 2026",
        "multiplier": MULTIPLIER,
        "totalLines": order_lines + amoe_lines,
        "people": len(emails),
        "orderRuns": len(order_runs),
        "amoeRuns": len(amoe_runs),
        "orderLines": order_lines,
        "amoeLines": amoe_lines,
        "files": [
            {"id": "orders", "label": "Sweepstakes report", "lines": order_lines, "rule": "Net sales × 5"},
            {"id": "amoe", "label": "AMOE", "lines": amoe_lines, "rule": "Ntries × 5"},
        ],
    })
    print(f"stored {order_chunks + amoe_chunks} chunks in {DATABASE}")


if __name__ == "__main__":
    main()
