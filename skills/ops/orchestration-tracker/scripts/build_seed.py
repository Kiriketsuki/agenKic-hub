#!/usr/bin/env python3
"""Build the tracker db seed from a goal config.

Usage:
  build_seed.py CONFIG.json OUT_DIR [--inline] [--versions VERSIONS.json] [--only nodes,timeline]

Writes one JSON file per document to OUT_DIR/docs/<collection>-<doc_id>.json, then
one or more batch files OUT_DIR/writes-NN.json. Each batch file is a ready `writes`
list for one ArtifactData batch call: at most 50 entries and under the 1 MiB body cap.

--inline       put each document in `data` instead of `file_path`. Use it for the
               pending queue, so a queued file still works after the docs folder goes.
--versions     a JSON map {"<collection>/<doc_id>": version}. Every write to a doc in
               the map gets `if_version`. Build it from a fresh list of each
               collection. A doc absent from the map is treated as new.
--only         limit the output to these collections.

The script refuses an unknown status, kind or lane, a dependency on a missing card,
a dependency cycle, and a progress value outside 0 to 100. It warns about em-dashes,
semicolons and contractions in card text, because the page copy is STE.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

STATES = ["Not started", "In progress", "In review", "Waiting", "Blocked", "Code complete",
          "Done", "Postponed", "Superseded", "Out of scope"]
KINDS = {"piece", "step", "scenario", "stop"}
LIVE_GROUPS = {"prod", "main", "epic"}
DOC_ID = re.compile(r"^[A-Za-z0-9_\-.~:@+]{1,200}$")
MAX_WRITES = 50
MAX_BODY = 900_000  # bytes, under the 1 MiB batch body cap
TEXT_FIELDS = ("label", "next", "note", "step", "text")
SLOP = [(re.compile("—"), "em-dash"), (re.compile(";"), "semicolon"),
        (re.compile(r"\b\w+(n't|'re|'ve|'ll|'m|'d)\b", re.I), "contraction")]

errors, warnings = [], []


def lint(where, value):
    for s in value if isinstance(value, list) else [value]:
        if not isinstance(s, str):
            continue
        for rx, name in SLOP:
            if rx.search(s):
                warnings.append(f"{where}: {name} in {s[:60]!r}")


def build_nodes(cfg):
    lanes = cfg["lanes"]
    out, ids = [], set()
    for i, raw in enumerate(cfg.get("nodes", []), 1):
        n = {"reviewer": "orchestrator", "status": "Not started", "deps": [], "kind": "piece",
             "ref": "", "next": "", "note": "", "order": i * 10, **raw}
        nid = n.get("id", "")
        where = f"nodes/{nid or i}"
        for k in ("id", "label", "lane", "owner"):
            if not n.get(k):
                errors.append(f"{where}: missing {k}")
        if nid and not DOC_ID.match(nid):
            errors.append(f"{where}: id has characters a doc id refuses")
        if nid in ids:
            errors.append(f"{where}: duplicate id")
        ids.add(nid)
        if n["status"] not in STATES:
            errors.append(f"{where}: status {n['status']!r} is not in STATES. Never write 'Waiting on N'.")
        if n["kind"] not in KINDS:
            errors.append(f"{where}: kind {n['kind']!r} is not piece, step, scenario or stop")
        if n.get("lane") not in lanes:
            errors.append(f"{where}: lane {n.get('lane')!r} is not in lanes")
        if "progress" in n:
            p = n["progress"]
            if not isinstance(p, (int, float)) or not 0 <= p <= 100:
                errors.append(f"{where}: progress must be a number from 0 to 100")
            if not (n.get("worker") and n.get("step")):
                warnings.append(f"{where}: progress without worker and step")
        for k in TEXT_FIELDS:
            if k in n:
                lint(where + "." + k, n[k])
        out.append(n)
    for n in out:
        for d in n["deps"]:
            if d not in ids:
                errors.append(f"nodes/{n['id']}: dep {d!r} is not a card")
    check_cycles(out)
    return [("nodes", n["id"], n) for n in out]


def check_cycles(nodes):
    deps = {n["id"]: n["deps"] for n in nodes}
    state = {}

    def visit(x, path):
        if state.get(x) == 1:
            errors.append("dependency cycle: " + " -> ".join(path + [x]))
            return
        if state.get(x) == 2 or x not in deps:
            return
        state[x] = 1
        for d in deps[x]:
            visit(d, path + [x])
        state[x] = 2

    for nid in deps:
        visit(nid, [])


def build_checks(cfg):
    out = []
    for i, c in enumerate(cfg.get("checks", []), 1):
        cid = c.get("id", f"c{i}")
        doc = {"order": c.get("order", i), "text": c["text"], "sub": c.get("sub", [])}
        lint(f"checks/{cid}", [doc["text"]] + doc["sub"])
        out.append(("checks", cid, doc))
    return out


def build_live(cfg):
    out = []
    for i, r in enumerate(cfg.get("live", []), 1):
        lid = r.get("id", f"l{i}")
        if r.get("group") not in LIVE_GROUPS:
            errors.append(f"live/{lid}: group must be prod, main or epic")
        doc = {"group": r.get("group"), "order": r.get("order", i), "name": r.get("name", ""),
               "version": r.get("version", ""), "where": r.get("where", ""),
               "has": r.get("has", []), "missing": r.get("missing", [])}
        out.append(("live", lid, doc))
    return out


def build_timeline(cfg):
    out = []
    for t in cfg.get("timeline", []):
        d = date.fromisoformat(t["date"])
        hh, mm = t["hour"].split(":")
        tid = f"d{d:%Y%m%d}-{hh}00"
        doc = {"day": f"{d:%a} {d.day} {d:%b}", "dayOrder": int(f"{d:%Y%m%d}"), "hour": t["hour"],
               "order": int(hh) * 100 + int(mm), "text": t["text"], "points": t.get("points", [])}
        lint("timeline/" + tid, [doc["text"]] + doc["points"])
        out.append(("timeline", tid, doc))
    return out


def batches(entries):
    """Split write entries so each batch has at most 50 writes and stays under the body cap."""
    cur, size = [], 0
    for e, body in entries:
        if cur and (len(cur) == MAX_WRITES or size + body > MAX_BODY):
            yield cur
            cur, size = [], 0
        cur.append(e)
        size += body
    if cur:
        yield cur


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cfg = json.loads(Path(argv[0]).read_text())
    out = Path(argv[1]).resolve()
    inline = "--inline" in argv
    versions = json.loads(Path(argv[argv.index("--versions") + 1]).read_text()) if "--versions" in argv else {}
    only = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
    if not cfg.get("lanes"):
        errors.append("config has no lanes")
    docs = build_nodes(cfg) + build_checks(cfg) + build_live(cfg) + build_timeline(cfg)
    for w in warnings:
        print("WARN: " + w, file=sys.stderr)
    if errors:
        for e in errors:
            print("ERROR: " + e, file=sys.stderr)
        return 1
    if only:
        docs = [d for d in docs if d[0] in only]
    (out / "docs").mkdir(parents=True, exist_ok=True)
    entries = []
    for col, did, doc in docs:
        p = out / "docs" / f"{col}-{did}.json"
        body = json.dumps(doc, indent=1, ensure_ascii=False)
        p.write_text(body + "\n")
        e = {"op": "set", "collection": col, "doc_id": did}
        if inline:
            e["data"] = doc
        else:
            e["file_path"] = str(p)
        v = versions.get(f"{col}/{did}")
        if v is not None:
            e["if_version"] = int(v)
        entries.append((e, len(body.encode()) + 200))
    files = []
    for i, b in enumerate(batches(entries), 1):
        f = out / f"writes-{i:02d}.json"
        f.write_text(json.dumps(b, indent=1, ensure_ascii=False) + "\n")
        files.append((f, len(b)))
    counts = {}
    for col, _, _ in docs:
        counts[col] = counts.get(col, 0) + 1
    print("docs: " + ", ".join(f"{k} {v}" for k, v in counts.items()))
    for f, n in files:
        print(f"{f}: {n} writes")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
