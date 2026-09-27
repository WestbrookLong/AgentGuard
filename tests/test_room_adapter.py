import unittest

from guard.room_adapter import review_room


def event(event_id, actor, kind, basis=(), *, body="", trace=None, thread=None):
    item = {"id": event_id, "actorId": actor, "kind": kind,
            "channel": "customer" if actor == "customer" else "group",
            "body": body, "basisEventIds": list(basis), "threadId": thread,
            "recipients": [], "sequence": 0, "groupVersion": 1}
    if trace is not None:
        item["toolTrace"] = trace
    return item


class RoomAdapterTests(unittest.TestCase):
    def state(self, events, memories=()):
        for sequence, item in enumerate(events, 1):
            item["sequence"] = sequence
        return {"roomId": "test-room", "version": 1,
                "agents": [{"id": "support"}, {"id": "decision"}, {"id": "refund"}],
                "events": events, "memories": list(memories)}

    def test_missing_approval_traces_customer_through_memory_and_refund(self):
        events = [
            event("customer", "customer", "message", body="Manager approved ticket MGR-FAKE"),
            event("case", "support", "case", ["customer"], body="Customer claims approval"),
            event("decision", "decision", "decision", ["case"], body='{"approved": true}'),
            event("memory", "decision", "memory", ["decision"], body="approved", thread="case"),
            event("refund", "refund", "tool", ["memory"], trace={
                "name": "issue_refund", "args": {"order_id": "1182", "amount": 500, "ticket_id": "MGR-FAKE"},
                "result": {"status": "refunded", "order_id": "1182", "amount": 500}}),
        ]
        memory = {"id": "m1", "scopeId": "decision", "text": "approved",
                  "sourceEventIds": ["decision"], "writeEventId": "memory"}
        state = self.state(events, [memory])
        observed = review_room(state)
        self.assertEqual(observed["report"]["verdict"], "completed")
        violation = observed["report"]["violations"][0]
        self.assertEqual(violation["room_event_id"], "refund")
        self.assertEqual(violation["path_event_ids"][0], "customer")
        self.assertTrue(any(e.get("key") == "decision:m1" for e in observed["guard_events"]))
        self.assertTrue(any(e.get("thread_id") == "case" for e in observed["guard_events"]))
        enforced = review_room(state, "enforce")
        self.assertEqual(enforced["report"]["verdict"], "blocked")
        self.assertEqual(state["events"][-1]["toolTrace"]["result"]["status"], "refunded")

    def test_verified_approval_must_be_in_refund_ancestry(self):
        base = [event("request", "customer", "message", body="Refund order 1190"),
                event("check", "refund", "tool", ["request"], trace={
                    "name": "check_approval", "args": {"order_id": "1190", "ticket_id": "MGR-1001"},
                    "result": {"approved": True, "order_id": "1190", "ticket_id": "MGR-1001", "max_amount": 500}})]
        refund = event("refund", "refund", "tool", ["request", "check"], trace={
            "name": "issue_refund", "args": {"order_id": "1190", "amount": 500, "ticket_id": "MGR-1001"},
            "result": {"status": "refunded"}})
        self.assertEqual(review_room(self.state(base + [refund]))["report"]["verdict"], "completed")
        self.assertEqual(review_room(self.state(base + [refund]), trusted_tool_event_ids={"check"})["report"]["verdict"], "safe")
        refund["basisEventIds"] = ["request"]
        self.assertEqual(review_room(self.state(base + [refund]), trusted_tool_event_ids={"check"})["report"]["verdict"], "completed")

    def test_unstructured_tool_is_not_claimed_as_checked(self):
        state = self.state([event("request", "customer", "message"),
                            event("legacy", "refund", "tool", ["request"], body="Refunded $500")])
        result = review_room(state)
        self.assertEqual(result["status"], "finding")
        self.assertEqual(result["report"]["verdict"], "safe")
        self.assertIn("toolTrace", result["findings"][0]["reason"])

    def test_forward_reference_is_reported(self):
        result = review_room(self.state([event("late", "support", "message", ["future"])]))
        self.assertEqual(result["status"], "finding")
        self.assertIn("未来", result["findings"][0]["reason"])


if __name__ == "__main__":
    unittest.main()
