import copy
import json
import unittest
from pathlib import Path
from guard.policy import refund_needs_verified_approval
ROOT = Path(__file__).resolve().parents[1]

class StubGuard:
    def __init__(self, events):
        self.events = events

    def ancestors(self, step):
        found = set()
        pending = list(self.events[step].get("derived_from", []))
        while pending:
            parent = pending.pop()
            if parent in found:
                continue
            found.add(parent)
            pending.extend(self.events[parent].get("derived_from", []))
        return found


def valid_run():
    approval = {
        "step": 0, "type": "tool_result", "tool": "check_approval",
        "trust": "trusted", "blocked": False,
        "content": {"approved": True, "order_id": "1190",
                    "ticket_id": "MGR-1001", "max_amount": 500},
        "derived_from": [],
    }
    action = {
        "step": 1, "type": "tool_call", "tool": "issue_refund",
        "args": {"order_id": "1190", "ticket_id": "MGR-1001", "amount": 500},
        "derived_from": [0],
    }
    return StubGuard([approval, action]), action


class TestPolicy(unittest.TestCase):
    def test_valid_large_refund(self):
        guard, action = valid_run()
        self.assertIsNone(refund_needs_verified_approval(guard, action))

    def test_missing_approval(self):
        guard, action = valid_run()
        action["derived_from"] = []
        self.assertEqual(refund_needs_verified_approval(guard, action)["rule"],
                         "refund_over_100_needs_verified_approval")

    def test_approval_for_other_order(self):
        guard, action = valid_run()
        guard.events[0]["content"]["order_id"] = "1182"
        self.assertIsNotNone(refund_needs_verified_approval(guard, action))

    def test_wrong_ticket(self):
        guard, action = valid_run()
        action["args"]["ticket_id"] = "MGR-FAKE"
        self.assertIsNotNone(refund_needs_verified_approval(guard, action))

    def test_insufficient_approved_amount(self):
        guard, action = valid_run()
        guard.events[0]["content"]["max_amount"] = 200
        self.assertIsNotNone(refund_needs_verified_approval(guard, action))

    def test_untrusted_approval_is_not_accepted(self):
        guard, action = valid_run()
        guard.events[0]["trust"] = "untrusted"
        self.assertIsNotNone(refund_needs_verified_approval(guard, action))

    def test_exact_threshold_does_not_need_approval(self):
        guard, action = valid_run()
        action["args"]["amount"] = 100
        action["derived_from"] = []
        self.assertIsNone(refund_needs_verified_approval(guard, action))

    def test_other_tool_is_unaffected(self):
        guard, action = valid_run()
        action["tool"] = "get_order"
        self.assertIsNone(refund_needs_verified_approval(guard, action))

    def test_sample_attack(self):
        with (ROOT / "sample_log.jsonl").open(encoding="utf-8") as f:
            events = [json.loads(line) for line in f if line.strip()]
        guard = StubGuard(events)
        violation = refund_needs_verified_approval(guard, events[6])
        self.assertEqual(violation["amount"], 500)
        self.assertEqual(violation["order_id"], "1182")
        self.assertEqual(violation["reason"], events[7]["content"]["reason"])


if __name__ == "__main__":
    unittest.main()
