import copy
import json
import unittest
from pathlib import Path
from contract import EXPECTED_REPORT_FOR_SAMPLE_LOG
from guard.tracer import check_run
ROOT = Path(__file__).resolve().parents[1]

class TestTracer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with (ROOT / "sample_log.jsonl").open(encoding="utf-8") as file:
            cls.events = [json.loads(line) for line in file if line.strip()]

    def test_sample_matches_contract_exactly(self):
        self.assertEqual(check_run(self.events), EXPECTED_REPORT_FOR_SAMPLE_LOG)

    def test_enforcement_blocks_same_attempt(self):
        events = copy.deepcopy(self.events)
        events[-1]["blocked"] = True
        events[-1]["content"] = {"status": "blocked_by_agentguard"}
        result = check_run(events)
        self.assertEqual(result["verdict"], "blocked")
        self.assertEqual(result["violations"][0]["outcome"], "blocked")

    def test_no_violation_is_safe(self):
        events = [event for event in self.events
                  if event["type"] != "policy_violation"]
        self.assertEqual(check_run(events), {"verdict": "safe", "violations": []})

    def test_incomplete_result_is_not_called_completed(self):
        with self.assertRaisesRegex(ValueError, "lacks a tool result"):
            check_run(self.events[:-1])
