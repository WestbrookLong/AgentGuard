import json
import unittest
from io import BytesIO
from unittest.mock import patch

from local_api import APIError, QwenProvider, invoke_agent, validated_base_url


def event(event_id, actor, kind, body, channel="group"):
    return {"id": event_id, "actorId": actor, "kind": kind, "body": body, "channel": channel, "basisEventIds": []}


def state(events):
    return {
        "agents": [
            {"id": "support", "active": True, "description": "Collect evidence"},
            {"id": "decision", "active": True, "description": "Review policy"},
            {"id": "refund", "active": True, "description": "Execute and report"},
        ],
        "events": events,
        "memories": [],
    }


class FakeProvider:
    default_model = "test-model"

    def __init__(self, answer):
        self.answer = answer
        self.calls = []

    def message(self, **kwargs):
        self.calls.append(kwargs)
        return self.answer


class LocalAPITests(unittest.TestCase):
    def test_small_refund_has_structured_order_tool_trace(self):
        provider = FakeProvider({"execute_refund": True, "amount": 45,
                                 "report": "Simulated refund", "basis_event_ids": ["decision_1"]})
        result = invoke_agent({"agent_id": "refund", "trigger_event_id": "decision_1", "state": state([
            event("decision_1", "decision", "decision", json.dumps({"order_id": "1201", "approved": True, "amount": 45})),
        ])}, provider)
        tool = result["actions"][0]
        self.assertEqual(tool["kind"], "tool")
        self.assertEqual(tool["toolTrace"]["name"], "issue_refund")
        self.assertEqual(tool["toolTrace"]["args"]["order_id"], "1201")
        self.assertTrue(tool["toolTrace"]["result"]["simulated"])

    def test_key_does_not_appear_in_public_config(self):
        provider = QwenProvider()
        provider.configure("sk-test-secret", "test-model")
        public = {"provider": "qwen", "configured": provider.configured, "default_model": provider.default_model, "base_url": provider.base_url}
        self.assertNotIn("sk-test-secret", json.dumps(public))

    def test_base_url_restricts_requests_to_qwen_compatible_endpoint(self):
        self.assertEqual(validated_base_url("https://dashscope.aliyuncs.com/compatible-mode/v1/"),
                         "https://dashscope.aliyuncs.com/compatible-mode/v1")
        with self.assertRaises(APIError):
            validated_base_url("https://example.com/compatible-mode/v1")
        with self.assertRaises(APIError):
            validated_base_url("http://dashscope.aliyuncs.com/compatible-mode/v1")

    def test_qwen_chat_request_shape(self):
        provider = QwenProvider()
        provider.configure("sk-test-secret", "qwen-plus")
        fake_response = BytesIO(b'{"choices":[{"message":{"content":"{\\"ok\\":true}"}}]}')
        with patch("local_api.urlopen", return_value=fake_response) as send:
            self.assertEqual(provider.message(model=None, system="Return JSON", user="Ping", schema={"type": "object"}), {"ok": True})
        request = send.call_args.args[0]
        body = json.loads(request.data)
        self.assertEqual(request.full_url, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions")
        self.assertEqual(request.get_header("Authorization"), "Bearer sk-test-secret")
        self.assertEqual(body["model"], "qwen-plus")
        self.assertEqual(body["response_format"], {"type": "json_object"})

    def test_support_basis_is_limited_to_visible_events(self):
        provider = FakeProvider({
            "reply_to_customer": "I have received the file.",
            "submit_case": True,
            "case_summary": "Evidence file recorded; contents unverified.",
            "basis_event_ids": ["customer_1", "evidence_1"],
        })
        result = invoke_agent({"agent_id": "support", "trigger_event_id": "evidence_1", "state": state([
            event("customer_1", "customer", "message", "Refund please", "customer"),
            event("evidence_1", "customer", "evidence", "proof.pdf", "customer"),
        ])}, provider)
        self.assertEqual([action["kind"] for action in result["actions"]], ["message", "case"])
        self.assertEqual(result["actions"][1]["basisEventIds"], ["customer_1", "evidence_1"])

    def test_agent_cannot_invent_source_event(self):
        provider = FakeProvider({
            "reply_to_customer": "Received", "submit_case": False, "case_summary": "None",
            "basis_event_ids": ["customer_1", "invented"],
        })
        with self.assertRaises(APIError):
            invoke_agent({"agent_id": "support", "trigger_event_id": "customer_1", "state": state([
                event("customer_1", "customer", "message", "Refund please", "customer"),
            ])}, provider)

    def test_refund_cannot_simulate_over_threshold_without_approval(self):
        provider = FakeProvider({
            "execute_refund": True, "amount": 500, "report": "Refund completed", "basis_event_ids": ["decision_1"],
        })
        result = invoke_agent({"agent_id": "refund", "trigger_event_id": "decision_1", "state": state([
            event("decision_1", "decision", "decision", json.dumps({"approved": True, "amount": 500})),
        ])}, provider)
        self.assertEqual([action["kind"] for action in result["actions"]], ["report"])
        self.assertIn("没有退款", result["actions"][0]["body"])

    def test_decision_includes_policy_basis(self):
        provider = FakeProvider({
            "approved": False, "amount": 500, "reason": "Manager approval not verified",
            "needs_more_evidence": True, "basis_event_ids": ["case_1", "policy_1"],
        })
        result = invoke_agent({"agent_id": "decision", "trigger_event_id": "policy_1", "state": state([
            event("case_1", "support", "case", "Refund request for order 1182"),
            event("policy_1", "decision", "policy", "Approval needed for over $100"),
        ])}, provider)
        action = result["actions"][0]
        self.assertEqual(action["kind"], "decision")
        self.assertEqual(action["basisEventIds"], ["case_1", "policy_1"])
        self.assertFalse(json.loads(action["body"])["approved"])

    def test_agent_cannot_use_invisible_trigger(self):
        provider = FakeProvider({"message": "hello", "basis_event_ids": ["customer_1"]})
        with self.assertRaises(APIError):
            invoke_agent({"agent_id": "decision", "trigger_event_id": "customer_1", "state": state([
                event("customer_1", "customer", "message", "Private message", "customer"),
            ])}, provider)


if __name__ == "__main__":
    unittest.main()
