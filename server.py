"""Local dashboard for the Fly a Fan drawing list stored in Firestore."""

import json
import subprocess
from bisect import bisect_right
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from google.cloud import firestore
from google.oauth2.credentials import Credentials

from config import DATABASE, HOST, PORT, PROJECT

STATIC = Path(__file__).with_name("static")


def client():
    token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
    return firestore.Client(project=PROJECT, database=DATABASE, credentials=Credentials(token))


class Drawing:
    def __init__(self, summary, runs):
        self.summary = summary
        self.runs = runs
        self.starts = [run["start"] for run in runs]
        self.total = summary["totalLines"]
        people = {}
        for run in runs:
            key = run["email"].lower()
            person = people.get(key)
            if person is None:
                people[key] = {
                    "email": run["email"],
                    "name": run["name"],
                    "entries": run["entries"],
                    "sources": [run["label"]],
                    "firstLine": run["start"],
                }
            else:
                person["entries"] += run["entries"]
                if run["label"] not in person["sources"]:
                    person["sources"].append(run["label"])
                if run["name"] and not person["name"]:
                    person["name"] = run["name"]
        self.people = sorted(people.values(), key=lambda person: (-person["entries"], person["email"].lower()))

    def lines(self, at, limit):
        if self.total <= 0:
            return []
        at = min(max(1, at), self.total)
        limit = min(max(1, limit), 200)
        index = bisect_right(self.starts, at) - 1
        page = []
        line = at
        while len(page) < limit and index < len(self.runs):
            run = self.runs[index]
            last = run["start"] + run["entries"] - 1
            take = min(limit - len(page), last - line + 1)
            for offset in range(take):
                page.append({
                    "line": line + offset,
                    "email": run["email"],
                    "name": run["name"],
                    "source": run["label"],
                })
            line += take
            index += 1
        return page

    def find(self, query):
        needle = query.strip().lower()
        if not needle:
            return None
        for run in self.runs:
            if needle in run["email"].lower() or needle in run["name"].lower():
                return run["start"]
        return None


def load_drawing():
    db = client()
    summary = db.collection("meta").document("summary").get()
    if not summary.exists:
        raise SystemExit("Firestore has no summary document. Run load_firestore.py first.")
    chunks = []
    for doc in db.collection("runs").stream():
        chunks.append(doc.to_dict())
    chunks.sort(key=lambda chunk: (0 if chunk["source"] == "orders" else 1, chunk["index"]))
    runs = []
    line = 1
    for chunk in chunks:
        for row in chunk["rows"]:
            entries = int(row["entries"])
            if entries <= 0:
                continue
            runs.append({
                "email": row.get("email") or "",
                "name": row.get("name") or "",
                "entries": entries,
                "label": chunk.get("label") or chunk["source"],
                "start": line,
            })
            line += entries
    data = summary.to_dict()
    data["totalLines"] = line - 1
    return Drawing(data, runs)


class Handler(BaseHTTPRequestHandler):
    drawing = None

    def log_message(self, fmt, *args):
        return

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/":
            return self._file("index.html", "text/html; charset=utf-8")
        if parsed.path == "/api/summary":
            summary = dict(self.drawing.summary)
            summary["loadedRuns"] = len(self.drawing.runs)
            summary["loadedPeople"] = len(self.drawing.people)
            return self._json(summary)
        if parsed.path == "/api/lines":
            params = parse_qs(parsed.query)
            at = int(params.get("at", ["1"])[0] or 1)
            limit = int(params.get("limit", ["100"])[0] or 100)
            query = params.get("q", [""])[0]
            if query:
                found = self.drawing.find(query)
                if found is None:
                    return self._json({"at": at, "total": self.drawing.total, "rows": [], "match": None})
                at = found
            rows = self.drawing.lines(at, limit)
            return self._json({"at": at, "total": self.drawing.total, "rows": rows})
        if parsed.path == "/api/people":
            params = parse_qs(parsed.query)
            query = params.get("q", [""])[0].strip().lower()
            page = max(1, int(params.get("page", ["1"])[0] or 1))
            size = 50
            people = self.drawing.people
            if query:
                people = [
                    person for person in people
                    if query in person["email"].lower() or query in person["name"].lower()
                ]
            start = (page - 1) * size
            return self._json({
                "page": page,
                "pages": max(1, (len(people) + size - 1) // size),
                "total": len(people),
                "rows": people[start:start + size],
            })
        self.send_error(404)

    def _file(self, name, content_type):
        body = (STATIC / name).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    print(f"Reading {DATABASE}...")
    Handler.drawing = load_drawing()
    print(
        f"Ready at http://{HOST}:{PORT}  "
        f"{Handler.drawing.total:,} lines, {len(Handler.drawing.people):,} people"
    )
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
