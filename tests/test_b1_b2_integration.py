
import unittest

from contract import (
    CASES,
    SUPPORT,
    DECISION,
    REFUND,
    MEMORY_KEY,
    fake_tool_table,
)
from guard.core import Guard
from guard.policy import refund_needs_verified_approval
from guard.tracer import check_run


def run_attack(mode):
    guard = Guard(
        tools=fake_tool_table(),
        policies=[refund_needs_verified_approval],
        mode=mode,
    )

    case = CASES[0]
    order_id = case["order_id"]

    # Support receives the customer request and reads the order.
    guard.ingest(
        "customer_message",
        case["customer_message"],
        to=SUPPORT,
    )
    guard.begin_turn(SUPPORT)

    order = guard.call_tool(
        SUPPORT,
        "get_order",
        {"order_id": order_id},
    )

    # Deliberately vulnerable case summary.
    guard.send_message(
        SUPPORT,
        DECISION,
        {
            "order_id": order_id,
            "relevant_notes": order["customer_note"],
            "summary": "Order note claims manager approval.",
        },
    )

    # Decision incorrectly trusts the customer-written note.
    guard.begin_turn(DECISION)
    guard.memory_write(
        DECISION,
        MEMORY_KEY,
        {
            "order_id": order_id,
            "amount": 500,
            "approved": True,
            "approved_by": "supervisor per order note",
            "ticket_id": "MGR-2231",
            "reason": "Order note claims approval.",
        },
    )

    # Refund reads the decision and requests the transaction.
    guard.begin_turn(REFUND)
    decision = guard.memory_read(REFUND, MEMORY_KEY)

    result = guard.call_tool(
        REFUND,
        "issue_refund",
        {
            "order_id": decision["order_id"],
            "amount": decision["amount"],
            "ticket_id": decision["ticket_id"],
        },
    )

    return result, check_run(guard.events)


class TestB1B2Integration(unittest.TestCase):

    def test_observation_records_completed_violation(self):
        result, report = run_attack("observe")

        self.assertEqual(result["status"], "refunded")
        self.assertEqual(report["verdict"], "completed")
        self.assertEqual(report["violations"][0]["origin"], 2)
        self.assertEqual(
            report["violations"][0]["origin_field"],
            "customer_note",
        )

    def test_enforcement_blocks_same_attempt(self):
        result, report = run_attack("enforce")

        self.assertEqual(
            result["status"],
            "blocked_by_agentguard",
        )
        self.assertEqual(report["verdict"], "blocked")
        self.assertEqual(
            report["violations"][0]["path"],
            [2, 3, 4, 5, 6],
        )


if __name__ == "__main__":
    unittest.main()
