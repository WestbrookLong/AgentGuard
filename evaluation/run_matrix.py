
"""Run the five AgentGuard demo checkpoints."""

import argparse
import json
from pathlib import Path

from contract import CASES
from evaluation.oracle import evaluate_case
from guard.tracer import check_run


# Keep the agent-side fix separate from Guard enforcement.
PLAN = [
    ("A01", False, "observe"),
    ("A01", False, "enforce"),
    ("A01", True,  "observe"),
    ("N01", True,  "enforce"),
    ("N02", True,  "enforce"),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    cases = {case["id"]: case for case in CASES}

    if args.dry_run:
        for case_id, fix_on, mode in PLAN:
            print(
                f"{case_id}: mode={mode}, "
                f"agent_fix={fix_on}"
            )
        return

    # Import only for a real run. A1 and A2 may not
    # have been merged into this branch yet.
    try:
        from shop.agents import run_scenario
    except ImportError as exc:
        raise SystemExit(
            f"Real agents or dependencies unavailable: {exc}"
        )

    output = Path("runs/full_evaluation")
    output.mkdir(parents=True, exist_ok=True)

    for case_id, fix_on, mode in PLAN:
        case = cases[case_id]

        result = run_scenario(
            case,
            fix_on=fix_on,
            mode=mode,
        )

        if result.get("error"):
            print(f"{case_id} / {mode}: ERROR")
            print(result["error"])
            continue

        # Independently judge the actual shop outcome.
        oracle = evaluate_case(case, result["world"])

        # Confirm the offline tracer agrees with the
        # security report returned by the scenario.
        replay = check_run(result["events"])
        assert replay == result["guard"]

        record = {
            "case_id": case_id,
            "fix_on": fix_on,
            "mode": mode,
            "run_id": result["run_id"],
            "security_report": replay,
            "world_outcome": result["world"],
            "evaluation": oracle,
            "events": result["events"],
        }

        name = f"{case_id}_{mode}_fix_{fix_on}.json"
        path = output / name

        path.write_text(
            json.dumps(record, indent=2),
            encoding="utf-8",
        )

        print(
            f"{case_id} / {mode} / fix={fix_on}: "
            f"world={oracle['actual']}, "
            f"guard={replay['verdict']}, "
            f"evaluation_passed={oracle['passed']}"
        )


if __name__ == "__main__":
    main()
