"""One Room-shaped, three-agent refund run with a fake model and real shop tools."""
import json
import unittest
from pathlib import Path

from guard.room_adapter import review_room
from local_api import invoke_agent
from shop_simulator import world


MATERIALS = Path(__file__).resolve().parents[2] / "demo" / "materials"


class FakeProvider:
    default_model = "test-model"

    def __init__(self, answer):
        self.answer = answer

    def message(self, **_):
        return self.answer


class RefundFlowTests(unittest.TestCase):
    def setUp(self):
        world.reset()

    def run_case(self, order_id, filenames):
        events = []

        def add(actor, kind, body, basis=(), channel="group", **extra):
            item = {"id": f"evt_{len(events)}", "sequence": len(events) + 1,
                    "groupVersion": 1, "actorId": actor, "kind": kind, "channel": channel,
                    "body": body, "basisEventIds": list(basis), "threadId": None,
                    "recipients": [], **extra}
            events.append(item)
            return item

        def state():
            return {"roomId": "shopco-refund", "version": 1,
                    "agents": [{"id": name, "active": True, "description": name}
                               for name in ("support", "decision", "refund")],
                    "events": events, "memories": []}

        customer = add("customer", "message", f"Refund order #{order_id} please", channel="customer")
        latest = customer
        for filename in filenames:
            uploaded = world.upload(filename, (MATERIALS / filename).read_text(encoding="utf-8"))
            latest = add("customer", "evidence", json.dumps(uploaded["claims"]),
                         channel="customer", evidenceId=uploaded["evidence_id"])

        support_answer = {"reply_to_customer": "I will review your return", "submit_case": True,
                          "case_summary": "Return checked against shop data",
                          "basis_event_ids": [customer["id"], latest["id"]]}
        support = invoke_agent({"agent_id": "support", "trigger_event_id": latest["id"],
                                "state": state()}, FakeProvider(support_answer))
        emitted = []
        for action in support["actions"]:
            basis = action["basisEventIds"] + ([emitted[-1]["id"]] if action["kind"] == "case" else [])
            emitted.append(add(action["actorId"], action["kind"], action["body"], basis,
                               action["channel"], **({"toolTrace": action["toolTrace"]}
                                                      if "toolTrace" in action else {})))
        case = next(item for item in emitted if item["kind"] == "case")
        policy = add("decision", "policy", "SHOP-REFUND-v2", [case["id"]])

        decision_answer = {"order_id": order_id, "approved": True, "amount": 500,
                           "reason": "The return is eligible", "needs_more_evidence": False,
                           "basis_event_ids": [case["id"], policy["id"]]}
        decision_result = invoke_agent({"agent_id": "decision", "trigger_event_id": policy["id"],
                                        "state": state()}, FakeProvider(decision_answer))
        emitted = []
        for action in decision_result["actions"]:
            basis = action["basisEventIds"] + ([emitted[-1]["id"]]
                                              if action["kind"] == "decision" and emitted else [])
            emitted.append(add(action["actorId"], action["kind"], action["body"], basis,
                               action["channel"], **({"toolTrace": action["toolTrace"]}
                                                      if "toolTrace" in action else {})))
        decision = next(item for item in emitted if item["kind"] == "decision")
        refund_answer = {"execute_refund": True, "amount": 500,
                         "report": "Refund requested", "basis_event_ids": [decision["id"]]}
        refund_result = invoke_agent({"agent_id": "refund", "trigger_event_id": decision["id"],
                                      "state": state()}, FakeProvider(refund_answer))
        for action in refund_result["actions"]:
            add(action["actorId"], action["kind"], action["body"], action["basisEventIds"],
                action["channel"], **({"toolTrace": action["toolTrace"]}
                                       if "toolTrace" in action else {}))
        return state(), decision, refund_result

    def test_legitimate_high_refund_passes_guard_and_ledger(self):
        state, decision, refund = self.run_case("1190", ["1190_approved_return.txt"])
        self.assertTrue(json.loads(decision["body"])["approved"])
        self.assertEqual(refund["actions"][0]["toolTrace"]["result"]["status"], "refunded")
        self.assertIn("1190", world.ledger)
        self.assertEqual(review_room(state, trusted_tool_event_ids=world.trusted_tool_event_ids(state))["report"]["verdict"], "safe")

    def test_fake_approval_is_rejected(self):
        state, decision, refund = self.run_case("1182", ["1182_return.txt", "1182_fake_approval.txt"])
        self.assertFalse(json.loads(decision["body"])["approved"])
        self.assertEqual([item["kind"] for item in refund["actions"]], ["report"])
        self.assertNotIn("1182", world.ledger)
        self.assertEqual(review_room(state, trusted_tool_event_ids=world.trusted_tool_event_ids(state))["report"]["verdict"], "safe")


if __name__ == "__main__":
    unittest.main()
