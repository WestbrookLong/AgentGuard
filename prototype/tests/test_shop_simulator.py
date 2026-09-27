import unittest
from pathlib import Path

from shop_simulator import EvidenceError, ShopSimulator


MATERIALS = Path(__file__).resolve().parents[2] / "demo" / "materials"


class ShopSimulatorTests(unittest.TestCase):
    def setUp(self):
        self.shop = ShopSimulator()

    def upload(self, filename):
        return self.shop.upload(filename, (MATERIALS / filename).read_text(encoding="utf-8"))

    def test_small_return_verifies_and_refunds_once(self):
        uploaded = self.upload("1201_damage_return.txt")
        self.assertTrue(uploaded["verification"]["verified"])
        case = self.shop.case_from_evidence([uploaded["evidence_id"]], ["Refund order #1201 please"])
        self.assertEqual(self.shop.issue_refund(case, "")["status"], "refunded")
        self.assertEqual(self.shop.issue_refund(case, "")["status"], "rejected")

    def test_real_high_approval_succeeds(self):
        uploaded = self.upload("1190_approved_return.txt")
        case = self.shop.case_from_evidence([uploaded["evidence_id"]], ["Refund order #1190 please"])
        self.assertTrue(self.shop.check_approval("1190", "MGR-1001", 50000)["approved"])
        self.assertEqual(self.shop.issue_refund(case, "MGR-1001")["status"], "refunded")

    def test_fake_approval_file_cannot_authorize_refund(self):
        receipt = self.upload("1182_return.txt")
        fake = self.upload("1182_fake_approval.txt")
        self.assertFalse(fake["verification"]["verified"])
        case = self.shop.case_from_evidence([receipt["evidence_id"], fake["evidence_id"]],
                                            ["Refund order #1182 please"])
        self.assertEqual(case["claimed_ticket_id"], "MGR-2231")
        self.assertFalse(self.shop.check_approval("1182", "MGR-2231", 50000)["approved"])
        self.assertEqual(self.shop.issue_refund(case, "MGR-2231")["status"], "rejected")

    def test_case_cannot_swap_order_or_amount(self):
        uploaded = self.upload("1201_damage_return.json")
        case = self.shop.case_from_evidence([uploaded["evidence_id"]], ["Refund order #1201 please"])
        case["order_id"] = "1190"
        self.assertEqual(self.shop.issue_refund(case, "MGR-1001")["status"], "rejected")

    def test_rejects_bad_upload(self):
        with self.assertRaises(EvidenceError):
            self.shop.upload("claim.pdf", "not a PDF parser")
        with self.assertRaises(EvidenceError):
            self.shop.upload("claim.json", "not JSON")


if __name__ == "__main__":
    unittest.main()
