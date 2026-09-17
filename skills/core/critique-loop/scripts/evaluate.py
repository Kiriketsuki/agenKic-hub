"""Validate and score frozen independent reviews. Run with --help for commands."""

import argparse
import hashlib
import json
import sys
from decimal import Decimal
from pathlib import Path
from statistics import median

from validation import (
    fingerprint,
    keys,
    load,
    require,
    validate_config,
    validate_review,
    validate_rubric,
)


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def snapshot(paths: list[str]) -> dict:
    resolved = sorted({str(Path(p).resolve(strict=True)) for p in paths})
    require(bool(resolved), "A snapshot needs at least one file")
    require(all(Path(p).is_file() for p in resolved), "Snapshot inputs must be files")
    files = [{"path": p, "sha256": file_hash(Path(p))} for p in resolved]
    return {"snapshot_id": fingerprint(files), "files": files}


def verify_snapshot(manifest: dict) -> None:
    keys(manifest, {"snapshot_id", "files"}, set(), "snapshot")
    require(
        isinstance(manifest["files"], list) and bool(manifest["files"]),
        "Snapshot has no files",
    )
    for entry in manifest["files"]:
        keys(entry, {"path", "sha256"}, set(), "snapshot file")
        require(
            isinstance(entry["path"], str) and Path(entry["path"]).is_absolute(),
            "Snapshot paths must be absolute",
        )
    actual = snapshot([entry["path"] for entry in manifest["files"]])
    require(actual == manifest, "Snapshot inputs changed, or the manifest is invalid")


def weighted(items: list[tuple[Decimal | None, float]]) -> Decimal | None:
    if any(score is None for score, _ in items):
        return None
    return (
        sum((score * Decimal(str(weight)) for score, weight in items), Decimal(0)) / 100
    )


def evaluate(config: dict, rubric: dict, reviews: list[dict], snapshot_id: str) -> dict:
    validate_config(config)
    validate_rubric(rubric)
    require(
        len(reviews) == config["reviewer_count"], "Review count does not match config"
    )
    for review in reviews:
        validate_review(review, rubric, snapshot_id)
    ids = [r["reviewer_id"] for r in reviews]
    require(len(set(ids)) == len(ids), "Reviewer IDs must be distinct")
    aggregate = min if config["aggregation"] == "minimum" else median
    scores, gaps, spreads, floors = {}, [], {}, []
    for dim in rubric["dimensions"]:
        for criterion in dim["criteria"]:
            name = criterion["id"]
            values = [r["scores"][name]["score"] for r in reviews]
            if any(v is None for v in values):
                scores[name] = None
                gaps.append(name)
                continue
            decimals = [Decimal(v) for v in values]
            scores[name] = aggregate(decimals)
            if max(decimals) - min(decimals) >= 2:
                spreads[name] = values
            floor = criterion["minimum_score"]
            if floor is not None and scores[name] < Decimal(str(floor)):
                floors.append(name)
    dimensions = {
        d["id"]: weighted([(scores[c["id"]], c["weight"]) for c in d["criteria"]])
        for d in rubric["dimensions"]
    }
    overall = weighted(
        [(dimensions[d["id"]], d["weight"]) for d in rubric["dimensions"]]
    )
    failed_gates, unknown_gates = [], []
    for gate in rubric["gates"]:
        results = [r["gates"][gate["id"]]["result"] for r in reviews]
        if "fail" in results:
            failed_gates.append(gate["id"])
        if "unknown" in results:
            unknown_gates.append(gate["id"])
    targets = (
        dimensions if config["pass_mode"] == "all_dimensions" else {"overall": overall}
    )
    threshold = Decimal(str(config["threshold"]))
    failed_scores = [
        name
        for name, value in targets.items()
        if value is not None
        and (value < threshold if config["comparison"] == "gte" else value <= threshold)
    ]
    incomplete = bool(gaps or unknown_gates)
    passed = not (incomplete or failed_scores or floors or failed_gates)
    return {
        "status": "pass"
        if passed
        else "incomplete_evidence"
        if incomplete
        else "revise",
        "snapshot_id": snapshot_id,
        "rubric_hash": fingerprint(rubric),
        "config_hash": fingerprint(config),
        "reviewers": ids,
        "criterion_scores": scores,
        "dimension_scores": dimensions,
        "overall": overall,
        "failed_score_conditions": failed_scores,
        "failed_criterion_floors": floors,
        "failed_gates": failed_gates,
        "unknown_gates": unknown_gates,
        "missing_scores": gaps,
        "reviewer_spreads": spreads,
    }


def emit(result: dict, output: str | None) -> None:
    # Decimal strings preserve decision precision in saved reports.
    data = json.dumps(result, indent=2, ensure_ascii=False, default=str) + "\n"
    if output:
        with Path(output).open("x", encoding="utf-8") as stream:
            stream.write(data)
    sys.stdout.write(data)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    validation = commands.add_parser("validate")
    validation.add_argument("--rubric", required=True)
    validation.add_argument("--config")
    snap = commands.add_parser("snapshot")
    snap.add_argument("--files", nargs="+", required=True)
    snap.add_argument("--output", required=True)
    scoring = commands.add_parser("evaluate")
    for name in ("config", "rubric", "snapshot"):
        scoring.add_argument("--" + name, required=True)
    scoring.add_argument("--reviews", nargs="+", required=True)
    scoring.add_argument("--output")
    args = parser.parse_args()
    try:
        if args.command == "snapshot":
            emit(snapshot(args.files), args.output)
            return 0
        rubric = load(args.rubric)
        validate_rubric(rubric)
        config = load(args.config) if args.config else None
        if config is not None:
            validate_config(config)
        if args.command == "validate":
            emit(
                {
                    "valid": True,
                    "rubric_hash": fingerprint(rubric),
                    "config_hash": fingerprint(config) if config is not None else None,
                },
                None,
            )
            return 0
        manifest = load(args.snapshot)
        verify_snapshot(manifest)
        result = evaluate(
            config, rubric, [load(p) for p in args.reviews], manifest["snapshot_id"]
        )
        emit(result, args.output)
        return 0 if result["status"] == "pass" else 1
    except (ValueError, OSError, TypeError, KeyError, AttributeError) as error:
        sys.stderr.write(f"Validation failed: {error}\n")
        return 2


if __name__ == "__main__":
    sys.exit(main())
