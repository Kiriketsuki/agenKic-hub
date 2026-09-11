"""Validate the critique contracts without optional dependencies."""

import hashlib
import json
from decimal import Decimal
from pathlib import Path
from typing import Any


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def text(value: Any, name: str) -> None:
    require(
        isinstance(value, str) and bool(value.strip()),
        f"{name}: expected nonempty text",
    )


def strings(value: Any, name: str, allow_empty: bool = False) -> None:
    require(isinstance(value, list), f"{name}: expected a list")
    require(allow_empty or bool(value), f"{name}: must not be empty")
    for entry in value:
        text(entry, name)


def number(value: Any, name: str, low: int = 0, high: int | None = 10) -> Decimal:
    require(type(value) in (int, float), f"{name}: expected a number")
    result = Decimal(str(value))
    require(result.is_finite(), f"{name}: expected a finite number")
    require(
        result.as_tuple().exponent >= -6, f"{name}: support at most six decimal places"
    )
    require(result >= low, f"{name}: below {low}")
    require(high is None or result <= high, f"{name}: above {high}")
    return result


def keys(value: Any, required: set[str], optional: set[str], name: str) -> None:
    require(isinstance(value, dict), f"{name}: expected an object")
    require(
        not (required - value.keys()),
        f"{name}: missing keys {sorted(required - value.keys())}",
    )
    require(
        not (value.keys() - required - optional),
        f"{name}: unknown keys {sorted(value.keys() - required - optional)}",
    )


def fingerprint(value: Any) -> str:
    data = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def unique_pairs(pairs: list[tuple[str, Any]]) -> dict:
    result = {}
    for key, value in pairs:
        require(key not in result, f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def exact_float(token: str) -> float:
    value = float(token)
    require(
        Decimal(str(value)) == Decimal(token),
        "JSON number exceeds supported numeric precision",
    )
    return value


def load(path: str | Path) -> dict:
    return json.loads(
        Path(path).read_text(encoding="utf-8"),
        object_pairs_hook=unique_pairs,
        parse_float=exact_float,
    )


def validate_config(config: dict) -> None:
    required = {
        "schema_version",
        "threshold",
        "comparison",
        "pass_mode",
        "max_rounds",
        "reviewer_count",
        "aggregation",
        "reviewer_lenses",
        "max_minutes",
        "stagnation_rounds",
        "min_improvement",
    }
    keys(config, required, set(), "config")
    require(
        type(config["schema_version"]) is int and config["schema_version"] == 1,
        "config: unsupported version",
    )
    threshold = number(config["threshold"], "threshold")
    number(config["min_improvement"], "min_improvement")
    for key, allowed in {
        "comparison": ("gte", "gt"),
        "pass_mode": ("all_dimensions", "overall"),
        "aggregation": ("minimum", "median"),
    }.items():
        require(config[key] in allowed, f"{key}: expected one of {allowed}")
    require(
        not (config["comparison"] == "gt" and threshold == 10),
        "A score above 10 is impossible",
    )
    for key in ("max_rounds", "reviewer_count", "stagnation_rounds"):
        if key == "stagnation_rounds" and config[key] is None:
            continue
        require(
            type(config[key]) is int and config[key] > 0,
            f"{key}: expected positive integer",
        )
    if config["max_minutes"] is not None:
        require(
            number(config["max_minutes"], "max_minutes", high=None) > 0,
            "max_minutes: must be positive",
        )
    strings(config["reviewer_lenses"], "reviewer_lenses", allow_empty=True)
    require(
        len(config["reviewer_lenses"]) in (0, config["reviewer_count"]),
        "Supply one lens per reviewer or none",
    )


def weight_sum(items: list, name: str) -> None:
    require(isinstance(items, list) and bool(items), f"{name}: expected nonempty list")
    total = sum(
        (number(item.get("weight"), name + ".weight", high=100) for item in items),
        Decimal(0),
    )
    require(total == 100, f"{name}: weights must sum to 100, got {total}")
    require(
        all(item["weight"] > 0 for item in items), f"{name}: weights must be positive"
    )


def identified(items: list, name: str) -> None:
    require(isinstance(items, list), f"{name}: expected list")
    ids = []
    for item in items:
        require(isinstance(item, dict), f"{name}: entries must be objects")
        text(item.get("id"), name + ".id")
        text(item.get("label"), name + ".label")
        ids.append(item["id"])
    require(len(ids) == len(set(ids)), f"{name}: duplicate IDs")


def validate_rubric(rubric: dict) -> None:
    keys(
        rubric,
        {"schema_version", "id", "version", "title", "scope", "dimensions", "gates"},
        set(),
        "rubric",
    )
    require(
        type(rubric["schema_version"]) is int and rubric["schema_version"] == 1,
        "rubric: unsupported version",
    )
    for name in ("id", "version", "title", "scope"):
        text(rubric[name], name)
    identified(rubric["dimensions"], "dimensions")
    weight_sum(rubric["dimensions"], "dimensions")
    all_criteria = []
    for dim in rubric["dimensions"]:
        keys(dim, {"id", "label", "weight", "criteria"}, set(), dim["id"])
        identified(dim["criteria"], dim["id"])
        weight_sum(dim["criteria"], dim["id"])
        for criterion in dim["criteria"]:
            keys(
                criterion,
                {
                    "id",
                    "label",
                    "weight",
                    "question",
                    "procedure",
                    "evidence_required",
                    "anchors",
                    "minimum_score",
                },
                set(),
                criterion["id"],
            )
            text(criterion["question"], "question")
            strings(criterion["procedure"], "procedure")
            strings(criterion["evidence_required"], "evidence_required")
            keys(criterion["anchors"], {"0", "4", "6", "8", "10"}, set(), "anchors")
            for anchor in criterion["anchors"].values():
                text(anchor, "anchor")
            if criterion["minimum_score"] is not None:
                number(criterion["minimum_score"], "minimum_score")
            all_criteria.append(criterion)
    identified(all_criteria, "all criteria")
    identified(rubric["gates"], "gates")
    for gate in rubric["gates"]:
        keys(gate, {"id", "label", "procedure", "evidence_required"}, set(), gate["id"])
        strings(gate["procedure"], "gate procedure")
        strings(gate["evidence_required"], "gate evidence")


def validate_review(review: dict, rubric: dict, snapshot_id: str) -> None:
    keys(
        review,
        {"reviewer_id", "snapshot_id", "rubric_hash", "scores", "gates"},
        {"findings"},
        "review",
    )
    text(review["reviewer_id"], "reviewer_id")
    require(
        review["snapshot_id"] == snapshot_id, "Review references a different snapshot"
    )
    require(
        review["rubric_hash"] == fingerprint(rubric),
        "Review references a different rubric",
    )
    criteria = {c["id"] for d in rubric["dimensions"] for c in d["criteria"]}
    keys(review["scores"], criteria, set(), "scores")
    keys(review["gates"], {g["id"] for g in rubric["gates"]}, set(), "review gates")
    for name, entry in review["scores"].items():
        keys(entry, {"score", "evidence", "reason", "next_fix"}, set(), name)
        score = entry["score"]
        require(
            score is None or (type(score) is int and 0 <= score <= 10),
            f"{name}: score must be integer 0..10 or null",
        )
        strings(entry["evidence"], name + ".evidence", allow_empty=score is None)
        text(entry["reason"], name + ".reason")
        text(entry["next_fix"], name + ".next_fix")
    for name, entry in review["gates"].items():
        keys(entry, {"result", "evidence", "reason"}, set(), name)
        require(
            entry["result"] in ("pass", "fail", "unknown"),
            f"{name}: invalid gate result",
        )
        strings(
            entry["evidence"],
            name + ".evidence",
            allow_empty=entry["result"] == "unknown",
        )
        text(entry["reason"], name + ".reason")
    require(isinstance(review.get("findings", []), list), "findings: expected list")
