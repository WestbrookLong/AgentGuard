"""B2: the contract's refund-approval policy for B1's Guard.call_tool."""
from contract import REFUND_THRESHOLD, TRUSTED

RULE = "refund_over_100_needs_verified_approval"


def refund_needs_verified_approval(guard, call_event):
    """Require an ancestral trusted approval check for every refund over $100.

    This implements the current team contract. A separate execution-time
    approval lookup should be agreed with A2/B1 before changing the API.
    """
    if call_event.get("tool") != "issue_refund":
        return None
    args = call_event.get("args") or {}
    order_id = str(args.get("order_id", ""))
    amount = float(args.get("amount", 0))
    if amount <= REFUND_THRESHOLD:
        return None

    ticket = args.get("ticket_id")
    for step in guard.ancestors(call_event["step"]):
        event = guard.events[step]
        if (event.get("type") != "tool_result"
                or event.get("tool") != "check_approval"
                or event.get("trust") != TRUSTED
                or event.get("blocked")):
            continue
        result = event.get("content") or {}
        if not isinstance(result, dict):
            continue
        if (result.get("approved") is True
                and str(result.get("order_id")) == order_id
                and result.get("ticket_id") == ticket
                and ticket is not None
                and float(result.get("max_amount") or 0) >= amount):
            return None

    return {
        "rule": RULE,
        "reason": (
            f"Refund of ${amount:g} for order {order_id} exceeds "
            f"${REFUND_THRESHOLD} but no trusted approval-system check backs it."
        ),
        "order_id": order_id,
        "amount": amount,
    }
