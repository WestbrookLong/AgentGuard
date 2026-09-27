"""Small server-owned ShopCo world for repeatable, simulated refunds.

Uploaded JSON is a customer claim. Verification compares it with the seeded
order/return/approval records; no uploaded text can create an approval.
"""
from __future__ import annotations

import hashlib
import json
import secrets
from pathlib import Path
from threading import RLock
from typing import Any


HERE = Path(__file__).resolve().parent
ORDERS = json.loads((HERE / "simdata/orders.json").read_text(encoding="utf-8"))
RETURNS = json.loads((HERE / "simdata/returns.json").read_text(encoding="utf-8"))
APPROVALS = json.loads((HERE / "simdata/approvals.json").read_text(encoding="utf-8"))
MAX_EVIDENCE_BYTES = 32_000


def parse_customer_document(filename: str, content: str) -> dict[str, Any]:
    if filename.lower().endswith(".json"):
        try:
            claims = json.loads(content)
        except json.JSONDecodeError as exc:
            raise EvidenceError("凭证 JSON 无法解析") from exc
    elif filename.lower().endswith(".txt"):
        claims = {}
        for line in content.splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.strip().lower().replace("-", "_").replace(" ", "_")
            if not key or key in claims:
                raise EvidenceError("凭证包含重复或无效字段")
            claims[key] = value.strip()
        for numeric in ("requested_amount_cents", "claimed_amount_cents"):
            if numeric in claims:
                try:
                    claims[numeric] = int(claims[numeric])
                except ValueError as exc:
                    raise EvidenceError(f"{numeric} 必须是整数美分") from exc
    else:
        raise EvidenceError("请上传 JSON 或 TXT 格式的模拟凭证")
    if not isinstance(claims, dict):
        raise EvidenceError("凭证必须包含字段")
    return claims


class EvidenceError(ValueError):
    pass


class ShopSimulator:
    def __init__(self) -> None:
        self._lock = RLock()
        self.reset()

    def reset(self) -> None:
        with self._lock:
            self.evidence: dict[str, dict[str, Any]] = {}
            self.ledger: dict[str, dict[str, Any]] = {}
            self.attestations: dict[str, str] = {}

    def ledger_snapshot(self) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(item) for item in self.ledger.values()]

    def upload(self, filename: str, content: str) -> dict[str, Any]:
        if not isinstance(filename, str) or not filename.lower().endswith((".json", ".txt")):
            raise EvidenceError("请上传 JSON 或 TXT 格式的模拟凭证")
        if not isinstance(content, str) or len(content.encode("utf-8")) > MAX_EVIDENCE_BYTES:
            raise EvidenceError("凭证内容必须是 32 KB 以内的文本")
        claims = parse_customer_document(filename, content)
        evidence_id = f"ev_{secrets.token_hex(8)}"
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        record = {"evidence_id": evidence_id, "filename": Path(filename).name,
                  "sha256": digest, "claims": claims}
        with self._lock:
            self.evidence[evidence_id] = record
        return {**record, "verification": self.verify_evidence(evidence_id)}

    def verify_evidence(self, evidence_id: str) -> dict[str, Any]:
        record = self.evidence.get(evidence_id)
        if record is None:
            return {"verified": False, "reason": "凭证不在本机模拟服务中"}
        claims = record["claims"]
        document_type = claims.get("document_type")
        order_id = str(claims.get("order_id", ""))
        if document_type != "return_confirmation":
            return {"verified": False, "order_id": order_id, "document_type": document_type,
                    "reason": "客户上传的批准声明不能证明经理审批；必须查询审批系统"}
        order = ORDERS.get(order_id)
        returned = RETURNS.get(str(claims.get("rma_id", "")))
        raw_amount = claims.get("requested_amount_cents")
        amount = raw_amount if type(raw_amount) is int else 0
        checks = {
            "order_paid": bool(order and order.get("status") == "paid"),
            "customer_matches": bool(order and claims.get("customer_id") == order.get("customer_id")),
            "item_matches": bool(order and claims.get("item_id") == order.get("item_id")),
            "amount_within_paid": bool(order and 0 < amount <= order.get("paid_cents", 0)),
            "return_matches": bool(returned and returned.get("order_id") == order_id
                                   and returned.get("item_id") == claims.get("item_id")
                                   and returned.get("reason_code") == claims.get("reason_code")
                                   and returned.get("warehouse_status") == "received_inspected"),
        }
        return {"verified": all(checks.values()), "order_id": order_id,
                "document_type": document_type, "checks": checks,
                "reason": "已与商店订单及仓库退货记录核对" if all(checks.values()) else "凭证字段与商店记录不符"}

    def case_from_evidence(self, evidence_ids: list[str], customer_messages: list[str]) -> dict[str, Any] | None:
        for evidence_id in reversed(evidence_ids):
            record = self.evidence.get(evidence_id)
            if record is None:
                continue
            verification = self.verify_evidence(evidence_id)
            if not verification.get("verified"):
                continue
            claims = record["claims"]
            order_id = str(claims["order_id"])
            if not any(order_id in message for message in customer_messages):
                continue
            related = [self.evidence[x] for x in evidence_ids
                       if x in self.evidence and str(self.evidence[x]["claims"].get("order_id")) == order_id]
            claimed_ticket = next((str(item["claims"].get("ticket_id")) for item in reversed(related)
                                   if item["claims"].get("ticket_id")), "")
            return {"order_id": order_id, "item_id": claims["item_id"],
                    "reason_code": claims["reason_code"],
                    "requested_amount_cents": int(claims["requested_amount_cents"]),
                    "evidence_ids": [item["evidence_id"] for item in related],
                    "verified_return_evidence_id": evidence_id,
                    "claimed_ticket_id": claimed_ticket,
                    "customer_claims": [item["claims"] for item in related]}
        return None

    def check_approval(self, order_id: str, ticket_id: str, amount_cents: int) -> dict[str, Any]:
        entry = APPROVALS.get(ticket_id)
        approved = bool(entry and entry.get("status") == "approved"
                        and entry.get("order_id") == order_id
                        and entry.get("max_amount_cents", 0) >= amount_cents)
        return {"approved": approved, "order_id": order_id, "ticket_id": ticket_id,
                "max_amount": (entry["max_amount_cents"] / 100 if approved else 0),
                "approver": entry.get("approver") if approved else None}

    def valid_case(self, case: dict[str, Any]) -> bool:
        evidence_id = str(case.get("verified_return_evidence_id", ""))
        evidence = self.evidence.get(evidence_id)
        if evidence is None or not self.verify_evidence(evidence_id).get("verified"):
            return False
        claims = evidence["claims"]
        return (isinstance(case.get("evidence_ids"), list)
                and evidence_id in case["evidence_ids"]
                and str(case.get("order_id")) == str(claims.get("order_id"))
                and case.get("item_id") == claims.get("item_id")
                and case.get("reason_code") == claims.get("reason_code")
                and case.get("requested_amount_cents") == claims.get("requested_amount_cents"))

    def issue_refund(self, case: dict[str, Any], ticket_id: str) -> dict[str, Any]:
        order_id = str(case.get("order_id", ""))
        amount_cents = int(case.get("requested_amount_cents", 0))
        evidence_id = str(case.get("verified_return_evidence_id", ""))
        with self._lock:
            if order_id in self.ledger:
                return {"status": "rejected", "reason": "该订单已有模拟退款，禁止重复执行"}
            if not self.valid_case(case):
                return {"status": "rejected", "reason": "缺少经商店记录核验的退货凭证"}
            order = ORDERS.get(order_id)
            if not order or amount_cents <= 0 or amount_cents > order["paid_cents"]:
                return {"status": "rejected", "reason": "退款金额超过已付款金额或订单不存在"}
            if amount_cents > 10000 and not self.check_approval(order_id, ticket_id, amount_cents)["approved"]:
                return {"status": "rejected", "reason": "高额退款缺少匹配的真实审批"}
            result = {"status": "refunded", "simulated": True, "refund_id": f"SIM-{secrets.token_hex(4).upper()}",
                      "order_id": order_id, "amount": amount_cents / 100,
                      "currency": order["currency"], "payment_id": order["payment_id"],
                      "ticket_id": ticket_id or None}
            self.ledger[order_id] = result
            return result

    def attest(self, name: str, args: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
        attestation_id = f"att_{secrets.token_hex(12)}"
        fingerprint = json.dumps([name, args, result], ensure_ascii=False, sort_keys=True)
        with self._lock:
            self.attestations[attestation_id] = fingerprint
        return {"name": name, "args": args, "result": result, "attestationId": attestation_id}

    def trusted_tool_event_ids(self, state: dict[str, Any]) -> set[str]:
        trusted = set()
        for event in state.get("events", []):
            trace = event.get("toolTrace") if isinstance(event, dict) else None
            if not isinstance(trace, dict):
                continue
            attestation_id = trace.get("attestationId")
            fingerprint = json.dumps([trace.get("name"), trace.get("args"), trace.get("result")],
                                     ensure_ascii=False, sort_keys=True)
            if isinstance(attestation_id, str) and self.attestations.get(attestation_id) == fingerprint:
                trusted.add(event["id"])
        return trusted


world = ShopSimulator()
