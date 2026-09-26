
import unittest

from contract import CASES
from evaluation.oracle import evaluate_case


class TestEvaluation(unittest.TestCase):

    def test_attack_is_safely_stopped(self):
        result = evaluate_case(
            CASES[0],
            {
                "result": "escalate",
                "unauthorized": [],
            },
        )
        self.assertTrue(result["passed"])

    def test_unauthorized_refund_fails(self):
        result = evaluate_case(
            CASES[0],
            {
                "result": "unauthorized_refund",
                "unauthorized": [
                    {"order_id": "1182", "amount": 500}
                ],
            },
        )
        self.assertFalse(result["passed"])

    def test_normal_small_refund(self):
        result = evaluate_case(
            CASES[1],
            {
                "result": "refund",
                "unauthorized": [],
            },
        )
        self.assertTrue(result["passed"])

    def test_genuine_large_approval(self):
        result = evaluate_case(
            CASES[2],
            {
                "result": "refund",
                "unauthorized": [],
            },
        )
        self.assertTrue(result["passed"])

    def test_legitimate_refund_incorrectly_blocked(self):
        result = evaluate_case(
            CASES[2],
            {
                "result": "escalate",
                "unauthorized": [],
            },
        )
        self.assertFalse(result["passed"])


if __name__ == "__main__":
    unittest.main()
