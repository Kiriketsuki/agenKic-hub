"""Exercise acceptance boundaries and review provenance checks."""

import copy
import json
import subprocess
import sys
from decimal import Decimal
from pathlib import Path

import pytest

from evaluate import evaluate, snapshot, verify_snapshot
from validation import fingerprint, load, validate_config, validate_rubric


@pytest.fixture
def inputs() -> tuple[dict, dict, dict]:
    root = Path(__file__).resolve().parents[1]
    config = load(root / "references/defaults.json")
    rubric = load(root / "references/autoconnect-rubric.json")
    review = {
        "reviewer_id": "agent-a",
        "snapshot_id": "snapshot-a",
        "rubric_hash": fingerprint(rubric),
        "scores": {
            c["id"]: {
                "score": 8,
                "evidence": ["fixture evidence"],
                "reason": "Fixture meets anchor 8",
                "next_fix": "Fixture next step",
            }
            for d in rubric["dimensions"]
            for c in d["criteria"]
        },
        "gates": {
            g["id"]: {
                "result": "pass",
                "evidence": ["fixture gate evidence"],
                "reason": "Fixture check passed",
            }
            for g in rubric["gates"]
        },
    }
    return config, rubric, review


def test_threshold_comparison(inputs: tuple) -> None:
    config, rubric, review = inputs
    assert evaluate(config, rubric, [review], "snapshot-a")["status"] == "pass"
    config["comparison"] = "gt"
    assert evaluate(config, rubric, [review], "snapshot-a")["status"] == "revise"
    review["scores"] = {
        key: {**value, "score": 9} for key, value in review["scores"].items()
    }
    assert evaluate(config, rubric, [review], "snapshot-a")["status"] == "pass"


def test_weighted_dimensions_and_no_round_up(inputs: tuple) -> None:
    config, rubric, review = inputs
    review["scores"]["components"]["score"] = 7
    result = evaluate(config, rubric, [review], "snapshot-a")
    assert result["dimension_scores"]["implementation"] == Decimal("7.85")
    assert result["status"] == "revise"
    config["threshold"] = 7.850001
    assert evaluate(config, rubric, [review], "snapshot-a")["status"] == "revise"


def test_overall_does_not_override_criterion_floor(inputs: tuple) -> None:
    config, rubric, review = inputs
    config["pass_mode"] = "overall"
    config["threshold"] = 7
    rubric["dimensions"][0]["criteria"][0]["minimum_score"] = 9
    review["rubric_hash"] = fingerprint(rubric)
    result = evaluate(config, rubric, [review], "snapshot-a")
    assert result["overall"] == 8
    assert result["failed_criterion_floors"] == ["reuse"]
    assert result["status"] == "revise"


@pytest.mark.parametrize(
    "gate_result,status", [("fail", "revise"), ("unknown", "incomplete_evidence")]
)
def test_gate_overrides_high_score(
    inputs: tuple, gate_result: str, status: str
) -> None:
    config, rubric, review = inputs
    review["gates"]["source-preserved"]["result"] = gate_result
    assert evaluate(config, rubric, [review], "snapshot-a")["status"] == status


def test_unknown_does_not_redistribute_weight(inputs: tuple) -> None:
    config, rubric, review = inputs
    review["scores"]["reuse"].update(score=None, evidence=[])
    result = evaluate(config, rubric, [review], "snapshot-a")
    assert result["status"] == "incomplete_evidence"
    assert result["dimension_scores"]["implementation"] is None
    assert result["dimension_scores"]["visibility"] == 8
    assert result["overall"] is None


def test_minimum_and_median(inputs: tuple) -> None:
    config, rubric, first = inputs
    second = copy.deepcopy(first)
    second["reviewer_id"] = "agent-b"
    second["scores"]["reuse"]["score"] = 6
    config["reviewer_count"] = 2
    assert (
        evaluate(config, rubric, [first, second], "snapshot-a")["criterion_scores"][
            "reuse"
        ]
        == 6
    )
    config["aggregation"] = "median"
    result = evaluate(config, rubric, [first, second], "snapshot-a")
    assert result["criterion_scores"]["reuse"] == 7
    assert result["reviewer_spreads"]["reuse"] == [8, 6]
    second["scores"]["reuse"]["score"] = None
    assert (
        evaluate(config, rubric, [first, second], "snapshot-a")["status"]
        == "incomplete_evidence"
    )


@pytest.mark.parametrize(
    "mutation",
    [
        "wrong_snapshot",
        "wrong_rubric",
        "missing_score",
        "extra_score",
        "empty_evidence",
        "boolean_score",
        "float_score",
    ],
)
def test_invalid_review_rejected(inputs: tuple, mutation: str) -> None:
    config, rubric, review = inputs
    if mutation == "wrong_snapshot":
        review["snapshot_id"] = "other"
    elif mutation == "wrong_rubric":
        review["rubric_hash"] = "other"
    elif mutation == "missing_score":
        del review["scores"]["reuse"]
    elif mutation == "extra_score":
        review["scores"]["other"] = review["scores"]["reuse"]
    elif mutation == "empty_evidence":
        review["scores"]["reuse"]["evidence"] = []
    else:
        review["scores"]["reuse"]["score"] = (
            True if mutation == "boolean_score" else 8.5
        )
    with pytest.raises(ValueError):
        evaluate(config, rubric, [review], "snapshot-a")


def test_reviewer_identity_and_count(inputs: tuple) -> None:
    config, rubric, review = inputs
    config["reviewer_count"] = 2
    with pytest.raises(ValueError, match="count"):
        evaluate(config, rubric, [review], "snapshot-a")
    with pytest.raises(ValueError, match="distinct"):
        evaluate(config, rubric, [review, review], "snapshot-a")


@pytest.mark.parametrize(
    "key,value",
    [
        ("max_rounds", 0),
        ("max_rounds", True),
        ("threshold", float("nan")),
        ("max_minutes", -1),
        ("reviewer_lenses", ["a", "b"]),
        ("comparision", "gt"),
    ],
)
def test_invalid_config_rejected(inputs: tuple, key: str, value: object) -> None:
    config, _, _ = inputs
    config[key] = value
    with pytest.raises(ValueError):
        validate_config(config)


def test_invalid_rubric_weights_and_duplicate_ids(inputs: tuple) -> None:
    _, rubric, _ = inputs
    changed = copy.deepcopy(rubric)
    changed["dimensions"][0]["criteria"][0]["weight"] = 29
    with pytest.raises(ValueError, match="sum"):
        validate_rubric(changed)
    rubric["dimensions"][1]["criteria"][0]["id"] = "reuse"
    with pytest.raises(ValueError, match="duplicate"):
        validate_rubric(rubric)


def test_duplicate_json_keys(tmp_path: Path) -> None:
    path = tmp_path / "duplicate.json"
    path.write_text('{"threshold":8,"threshold":9}', encoding="utf-8")
    with pytest.raises(ValueError, match="Duplicate"):
        load(path)


def test_precision_cannot_weaken_threshold(inputs: tuple, tmp_path: Path) -> None:
    config, _, _ = inputs
    path = tmp_path / "precise.json"
    path.write_text('{"threshold":8.0000000000000001}', encoding="utf-8")
    with pytest.raises(ValueError, match="precision"):
        load(path)
    config["threshold"] = 8.0000001
    with pytest.raises(ValueError, match="six decimal"):
        validate_config(config)


def test_snapshot_change_detected(tmp_path: Path) -> None:
    artifact = tmp_path / "artifact.txt"
    artifact.write_text("first", encoding="utf-8")
    manifest = snapshot([str(artifact)])
    verify_snapshot(manifest)
    artifact.write_text("second", encoding="utf-8")
    with pytest.raises(ValueError, match="changed"):
        verify_snapshot(manifest)


def test_cli_exit_codes_and_preserved_reports(inputs: tuple, tmp_path: Path) -> None:
    config, rubric, review = inputs
    artifact = tmp_path / "artifact.txt"
    artifact.write_text("fixture", encoding="utf-8")
    manifest = snapshot([str(artifact)])
    review["snapshot_id"] = manifest["snapshot_id"]
    for name, data in [
        ("config", config),
        ("rubric", rubric),
        ("snapshot", manifest),
        ("review", review),
    ]:
        (tmp_path / f"{name}.json").write_text(json.dumps(data), encoding="utf-8")
    command = [sys.executable, str(Path(__file__).with_name("evaluate.py")), "evaluate"]
    for name in ("config", "rubric", "snapshot"):
        command += ["--" + name, str(tmp_path / f"{name}.json")]
    command += [
        "--reviews",
        str(tmp_path / "review.json"),
        "--output",
        str(tmp_path / "result.json"),
    ]
    assert subprocess.run(command, capture_output=True).returncode == 0
    assert subprocess.run(command, capture_output=True).returncode == 2
    config["comparison"] = "gt"
    (tmp_path / "config.json").write_text(json.dumps(config), encoding="utf-8")
    assert subprocess.run(command[:-2], capture_output=True).returncode == 1
