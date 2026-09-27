
"""Export reproducible AgentGuard attack traces for the demo.

Uses the real B1 Guard and B2 policy/tracer, but scripted
agent decisions and the temporary fake shop.
"""

import json
from pathlib import Path

from contract import (
    DECISION,
    MEMORY_KEY,
    REFUND,
    SUPPORT,
    fake_tool_table,
)
from guard.core import Guard
from guard.policy import refund_needs_verified_approval
from guard.tracer import check_run


ROOT = Path(__file__).resolve().parents[1]
SAMPLE = [
    json.loads(line)
    for line in (ROOT / "sample_log.jsonl").read_text(
        encoding="utf-8"
    ).splitlines()
    if line.strip()
]


def export_run(mode):
    guard = Guard(
        tools=fake_tool_table(),
        policies=[refund_needs_verified_approval],
        mode=mode,
        run_id=f"A01_{mode}_scripted",
    )

    # Reproduce the known attack using the sample scenario.
    guard.ingest(
        "customer_message",
        SAMPLE[0]["content"],
        to=SUPPORT,
    )

    guard.begin_turn(SUPPORT)
    guard.call_tool(
        SUPPORT,
        "get_order",
        {"order_id": "1182"},
    )
    guard.send_message(
        SUPPORT,
        DECISION,
        SAMPLE[3]["content"],
    )

    guard.begin_turn(DECISION)
    guard.memory_write(
        DECISION,
        MEMORY_KEY,
        SAMPLE[4]["content"],
    )

    guard.begin_turn(REFUND)
    guard.memory_read(REFUND, MEMORY_KEY)

    result = guard.call_tool(
        REFUND,
        "issue_refund",
        SAMPLE[6]["args"],
    )

    report = check_run(guard.events)

    expected = "completed" if mode == "observe" else "blocked"
    assert report["verdict"] == expected
    assert report["violations"][0]["origin_field"] == "customer_note"

    # Export the real Guard events and B2 report.
    log_path = Path(guard.save(str(ROOT / "runs")))
    report_path = log_path.with_suffix(".report.json")
    report_path.write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )

    print(f"\nMode: {mode}")
    print(f"Tool result: {result['status']}")
    print(f"Security verdict: {report['verdict']}")
    print(f"Event log: {log_path}")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    export_run("observe")
    export_run("enforce")
