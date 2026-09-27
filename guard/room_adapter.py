"""Replay a Room snapshot through the existing Guard policy and tracer.

This adapter never executes tools or changes the Room. Room event IDs remain the
source of truth; Guard steps are local indices used only for an offline report.
"""
from __future__ import annotations

from typing import Any

from contract import TOOL_TRUST, TRUSTED, UNTRUSTED
from guard.core import Guard
from guard.policy import refund_needs_verified_approval
from guard.tracer import check_run


def review_room(state: dict[str, Any], mode: str = "observe",
                trusted_tool_event_ids: set[str] | None = None) -> dict[str, Any]:
    # Only the server-side test harness may supply this set. The HTTP endpoint
    # deliberately does not read it from the browser request.
    trusted_tool_event_ids = trusted_tool_event_ids or set()
    if mode not in ("observe", "enforce"):
        raise ValueError("mode must be observe or enforce")
    if not isinstance(state, dict) or not isinstance(state.get("events"), list):
        raise ValueError("state.events must be an array")
    events = state["events"]
    memories = state.get("memories", [])
    if not isinstance(memories, list):
        raise ValueError("state.memories must be an array")

    guard = Guard(tools={}, policies=[refund_needs_verified_approval], mode=mode,
                  run_id=f"room-{state.get('roomId', 'unknown')}")
    steps: dict[str, int] = {}
    findings: list[dict[str, str]] = []
    memory_by_write = {m.get("writeEventId"): m for m in memories
                       if isinstance(m, dict) and isinstance(m.get("writeEventId"), str)}
    known_agents = {a.get("id") for a in state.get("agents", []) if isinstance(a, dict)}

    for index, room_event in enumerate(events):
        if not isinstance(room_event, dict):
            raise ValueError(f"event at index {index} must be an object")
        event_id = room_event.get("id")
        if not isinstance(event_id, str) or not event_id or event_id in steps:
            raise ValueError(f"event at index {index} has a missing or duplicate id")
        basis = room_event.get("basisEventIds", [])
        if not isinstance(basis, list) or any(not isinstance(x, str) for x in basis):
            raise ValueError(f"event {event_id} has invalid basisEventIds")
        missing = [x for x in basis if x not in steps]
        if missing:
            findings.append({"eventId": event_id, "reason": f"依据事件不存在或位于未来：{', '.join(missing)}"})
        actor = str(room_event.get("actorId", ""))
        if actor in known_agents and not basis:
            findings.append({"eventId": event_id, "reason": "Agent 动作缺少具体依据"})
        thread_id = room_event.get("threadId")
        if thread_id is not None and thread_id not in steps:
            findings.append({"eventId": event_id, "reason": "Thread 根事件不存在或位于未来"})
        parents = [steps[x] for x in basis if x in steps]
        kind = room_event.get("kind")
        common = {"room_event_id": event_id, "room_kind": kind,
                  "room_sequence": room_event.get("sequence"),
                  "group_version": room_event.get("groupVersion"),
                  "thread_id": thread_id, "channel": room_event.get("channel")}
        content = room_event.get("body", "")

        if actor == "customer":
            logged = guard.record_replay_event("ingest", actor, parents, trust=UNTRUSTED,
                                to=room_event.get("recipients", []), content=content, **common)
        elif kind == "memory":
            memory = memory_by_write.get(event_id)
            if memory is None:
                findings.append({"eventId": event_id, "reason": "记忆写入事件缺少对应 MemoryRecord"})
                logged = guard.record_replay_event("memory_write", actor, parents,
                                    key="unknown", content=content, **common)
            else:
                scope = memory.get("scopeId")
                sources = memory.get("sourceEventIds", [])
                if not isinstance(sources, list) or set(sources) != set(basis):
                    findings.append({"eventId": event_id, "reason": "记忆来源与写入事件依据不一致"})
                logged = guard.record_replay_event("memory_write", actor, parents,
                                    key=f"{scope}:{memory.get('id')}",
                                    content=memory.get("text"), scope_id=scope, **common)
        elif kind == "tool" and isinstance(room_event.get("toolTrace"), dict):
            trace = room_event["toolTrace"]
            name, args, result = trace.get("name"), trace.get("args"), trace.get("result")
            if not isinstance(name, str) or not isinstance(args, dict) or not isinstance(result, dict):
                findings.append({"eventId": event_id, "reason": "工具记录缺少 name、args 或 result"})
                logged = guard.record_replay_event("message", actor, parents, content=content, **common)
            else:
                call = guard.record_replay_event("tool_call", actor, parents, tool=name, args=args,
                                  content=args, **common)
                violation = refund_needs_verified_approval(guard, call)
                if violation:
                    guard.record_replay_event("policy_violation", "agentguard", [call["step"]],
                               trust=TRUSTED, tool=name, content=violation)
                blocked = bool(violation and mode == "enforce")
                replay_result = ({"status": "blocked_by_agentguard"} if blocked else result)
                result_trust = (TOOL_TRUST.get(name, UNTRUSTED)
                                if event_id in trusted_tool_event_ids else UNTRUSTED)
                if name == "check_approval" and result_trust != TRUSTED:
                    findings.append({"eventId": event_id, "reason": "审批结果缺少服务端可信核验；客户或浏览器记录不能充当审批"})
                logged = guard.record_replay_event("tool_result", name, [call["step"]],
                                    trust=result_trust, tool=name,
                                    content=replay_result, blocked=blocked, **common)
                if name == "issue_refund" and result.get("status") not in ("refunded", "blocked_by_agentguard"):
                    findings.append({"eventId": event_id, "reason": "退款工具结果不是已退款或已拦截，无法确认执行结果"})
        else:
            if kind == "tool":
                findings.append({"eventId": event_id, "reason": "工具事件缺少结构化 toolTrace，无法评估退款策略"})
            logged = guard.record_replay_event("message", actor, parents,
                                trust=TRUSTED if actor in ("human", "system") and not parents else None,
                                to=room_event.get("recipients", []), content=content, **common)
        steps[event_id] = logged["step"]

    # The old tracer deliberately requires a concrete result for each violation.
    try:
        report = check_run(guard.events)
    except ValueError as exc:
        findings.append({"eventId": "", "reason": str(exc)})
        report = {"verdict": "incomplete", "violations": []}
    for violation in report["violations"]:
        event_id = guard.events[violation["action_step"]].get("room_event_id", "")
        findings.append({"eventId": event_id, "reason": violation["reason"]})
        violation["room_event_id"] = event_id
        violation["path_event_ids"] = [guard.events[step].get("room_event_id")
                                       for step in violation["path"] if guard.events[step].get("room_event_id")]
    return {"status": "finding" if findings else "pass", "findings": findings,
            "report": report, "mode": mode, "guard_events": guard.events}
