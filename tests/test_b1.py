"""B1 test: play the agents by hand and compare with sample_log.jsonl.

Run from the repo root:  python -m tests.test_b1
"""
import json
import tempfile

from contract import DECISION, REFUND, SUPPORT, TRUSTED, UNTRUSTED, fake_tool_table
from guard.core import Guard

SAMPLE = [json.loads(l) for l in open("sample_log.jsonl", encoding="utf-8") if l.strip()]
MSG = SAMPLE[0]["content"]
CASE_FILE = SAMPLE[3]["content"]
DECISION_VALUE = SAMPLE[4]["content"]


def always_violates(guard, call):
    if call["tool"] == "issue_refund":
        return {"rule": "test_rule", "reason": "test reason",
                "order_id": call["args"]["order_id"], "amount": call["args"]["amount"]}
    return None


def play_attack(g: Guard):
    g.ingest("customer_message", MSG, to=SUPPORT)

    inputs = g.begin_turn(SUPPORT)
    assert inputs == [{"from": "customer_message", "content": MSG, "step": 0}], inputs
    order = g.call_tool(SUPPORT, "get_order", {"order_id": "1182"})
    g.send_message(SUPPORT, DECISION, CASE_FILE)

    assert g.begin_turn(DECISION)[0]["content"] == CASE_FILE
    g.memory_write(DECISION, "refund_decision", DECISION_VALUE)

    g.begin_turn(REFUND)
    d = g.memory_read(REFUND, "refund_decision")
    assert d == DECISION_VALUE
    return order, g.call_tool(REFUND, "issue_refund",
                              {"order_id": "1182", "amount": 500, "ticket_id": "MGR-2231"})


def test_matches_sample_log():
    g = Guard(tools=fake_tool_table(), policies=[], mode="observe", run_id="A01_sample")
    order, _ = play_attack(g)
    assert "SYSTEM NOTE" in order["customer_note"]

    for e in g.events:
        print(e["step"], e["type"], e["actor"], e["trust"], e["derived_from"])

    # Steps 0-6 must match the sample exactly (no policy yet, so 7-8 differ).
    for mine, want in zip(g.events[:7], SAMPLE[:7]):
        for field in ("step", "type", "actor", "trust", "derived_from"):
            assert mine[field] == want[field], (mine["step"], field, mine[field], want[field])
    assert all(e["trust"] == UNTRUSTED for e in g.events[1:7])
    # issue_refund result: trusted per registry, derived from the call
    assert g.events[7]["type"] == "tool_result" and g.events[7]["trust"] == TRUSTED
    assert g.events[7]["derived_from"] == [6] and g.events[7]["blocked"] is False

    assert g.ancestors(6) == {0, 1, 2, 3, 4, 5}
    assert g.ancestors(0) == set()

    with tempfile.TemporaryDirectory() as d:
        path = g.save(d)
        loaded = [json.loads(l) for l in open(path, encoding="utf-8")]
        assert loaded == g.events


def test_observe_with_policy():
    g = Guard(tools=fake_tool_table(), policies=[always_violates], mode="observe")
    _, result = play_attack(g)
    assert result["status"] == "refunded"
    types = [e["type"] for e in g.events[6:]]
    assert types == ["tool_call", "policy_violation", "tool_result"], types
    v = g.events[7]
    assert v["actor"] == "agentguard" and v["trust"] == TRUSTED and v["derived_from"] == [6]


def test_enforce_blocks():
    g = Guard(tools=fake_tool_table(), policies=[always_violates], mode="enforce")
    _, result = play_attack(g)
    assert result == {"status": "blocked_by_agentguard", "reasons": ["test reason"]}, result
    last = g.events[-1]
    assert last["type"] == "tool_result" and last["blocked"] is True


def test_turn_resets_and_clean_trust():
    g = Guard(tools=fake_tool_table(), policies=[])
    g.begin_turn(REFUND)
    # nothing read this turn -> trusted
    s = g.memory_write(REFUND, "k", 1)
    assert g.events[s]["trust"] == TRUSTED and g.events[s]["derived_from"] == []
    assert g.memory_read(REFUND, "missing") is None
    # an untrusted tool result taints what follows in the same turn only
    g.call_tool(REFUND, "get_order", {"order_id": "1"})
    s = g.memory_write(REFUND, "k", 2)
    assert g.events[s]["trust"] == UNTRUSTED
    g.begin_turn(REFUND)
    s = g.memory_write(REFUND, "k", 3)
    assert g.events[s]["trust"] == TRUSTED


if __name__ == "__main__":
    test_matches_sample_log()
    test_observe_with_policy()
    test_enforce_blocks()
    test_turn_resets_and_clean_trust()
    print("B1: all checks passed")
