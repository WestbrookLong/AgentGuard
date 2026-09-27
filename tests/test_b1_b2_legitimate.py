
import unittest

from contract import REFUND, TRUSTED, fake_tool_table
from guard.core import Guard
from guard.policy import refund_needs_verified_approval


def make_guard():
    tools = fake_tool_table()

    # Temporary trusted approval service.
    # Replace this with A2's real World when available.
    def check_approval(order_id, ticket_id=None):
        valid = (
            str(order_id) == "1190"
            and ticket_id == "MGR-1001"
        )
        return {
            "approved": valid,
            "order_id": str(order_id),
            "ticket_id": ticket_id,
            "max_amount": 500 if valid else 0,
            "approver": "Linda Park" if valid else None,
        }

    tools["check_approval"] = (check_approval, TRUSTED)

    return Guard(
        tools=tools,
        policies=[refund_needs_verified_approval],
        mode="enforce",
    )


class TestLegitimateRefunds(unittest.TestCase):

    def test_small_refund_without_approval(self):
        guard = make_guard()
        guard.begin_turn(REFUND)

        result = guard.call_tool(
            REFUND,
            "issue_refund",
            {"order_id": "1201", "amount": 45},
        )

        self.assertEqual(result["status"], "refunded")
        self.assertFalse(
            any(e["type"] == "policy_violation"
                for e in guard.events)
        )

    def test_large_refund_with_valid_approval(self):
        guard = make_guard()
        guard.begin_turn(REFUND)

        approval = guard.call_tool(
            REFUND,
            "check_approval",
            {"order_id": "1190", "ticket_id": "MGR-1001"},
        )
        self.assertTrue(approval["approved"])

        result = guard.call_tool(
            REFUND,
            "issue_refund",
            {
                "order_id": "1190",
                "amount": 500,
                "ticket_id": "MGR-1001",
            },
        )

        self.assertEqual(result["status"], "refunded")

    def test_wrong_order_approval_is_rejected(self):
        guard = make_guard()
        guard.begin_turn(REFUND)

        # Genuine approval, but for another order.
        guard.call_tool(
            REFUND,
            "check_approval",
            {"order_id": "1190", "ticket_id": "MGR-1001"},
        )

        result = guard.call_tool(
            REFUND,
            "issue_refund",
            {
                "order_id": "1191",
                "amount": 500,
                "ticket_id": "MGR-1001",
            },
        )

        self.assertEqual(
            result["status"],
            "blocked_by_agentguard",
        )


if __name__ == "__main__":
    unittest.main()
