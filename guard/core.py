"""B1: the Guard. Every interaction between agents passes through it.

Each call writes one event (contract section 2), fills `derived_from` from the
actor's current turn, and labels the event trusted/untrusted. Policies from B2
run before every tool call.
"""
from __future__ import annotations

import copy
import json
import os
import uuid
from datetime import datetime
from typing import Any

from contract import (
    GUARD_ACTOR, SOURCE_TRUST, TRUSTED, UNTRUSTED,
    Event, Policy, ToolRegistry, Trust,
)

MODES = ("observe", "enforce")


def _lowest_trust(trusts: list[Trust]) -> Trust:
    return UNTRUSTED if UNTRUSTED in trusts else TRUSTED


class Guard:
    def __init__(self, tools: ToolRegistry, policies: list[Policy] | None = None,
                 mode: str = "observe", run_id: str | None = None):
        if mode not in MODES:
            raise ValueError(f"mode must be one of {MODES}, got {mode!r}")
        self.tools = tools
        self.policies = list(policies or [])
        self.mode = mode
        self.run_id = run_id or f"{datetime.now():%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6]}"
        self.events: list[Event] = []
        self._inbox: dict[str, list[dict]] = {}       # actor -> waiting inputs
        self._reads: dict[str, list[int]] = {}        # actor -> steps read this turn
        self._memory: dict[str, tuple[Any, int]] = {} # key -> (value, write step)

    # ------------------------------------------------------------------ helpers
    def _log(self, type: str, actor: str, derived_from: list[int],
             trust: Trust | None = None, **fields: Any) -> Event:
        """Append one event. Trust defaults to the lowest trust of its parents."""
        derived_from = sorted(set(derived_from))
        if trust is None:
            trust = _lowest_trust([self.events[s]["trust"] for s in derived_from])
        event: Event = {"run_id": self.run_id, "step": len(self.events),
                        "actor": actor, "type": type}
        for k, v in fields.items():
            event[k] = copy.deepcopy(v)
        event["derived_from"] = derived_from
        event["trust"] = trust
        self.events.append(event)
        return event

    def _read_list(self, actor: str) -> list[int]:
        return list(self._reads.get(actor, []))

    def _received(self, actor: str, step: int) -> None:
        self._reads.setdefault(actor, []).append(step)

    # --------------------------------------------------------------- Guard API
    def ingest(self, source: str, content: Any, to: str) -> int:
        e = self._log("ingest", source, [], trust=SOURCE_TRUST.get(source, UNTRUSTED),
                      to=to, content=content)
        self._inbox.setdefault(to, []).append(
            {"from": source, "content": copy.deepcopy(content), "step": e["step"]})
        return e["step"]

    def begin_turn(self, actor: str) -> list[dict]:
        inputs = self._inbox.pop(actor, [])
        self._reads[actor] = [i["step"] for i in inputs]
        return inputs

    def send_message(self, sender: str, receiver: str, content: Any) -> int:
        e = self._log("message", sender, self._read_list(sender), to=receiver, content=content)
        self._inbox.setdefault(receiver, []).append(
            {"from": sender, "content": copy.deepcopy(content), "step": e["step"]})
        return e["step"]

    def memory_write(self, actor: str, key: str, value: Any) -> int:
        e = self._log("memory_write", actor, self._read_list(actor), key=key, content=value)
        self._memory[key] = (copy.deepcopy(value), e["step"])
        return e["step"]

    def memory_read(self, actor: str, key: str) -> Any:
        value, write_step = self._memory.get(key, (None, None))
        parents = [] if write_step is None else [write_step]
        e = self._log("memory_read", actor, parents, key=key, content=value)
        self._received(actor, e["step"])
        return copy.deepcopy(value)

    def call_tool(self, actor: str, tool: str, args: dict) -> Any:
        call = self._log("tool_call", actor, self._read_list(actor),
                         tool=tool, args=args, content=args)

        violations = []
        for policy in self.policies:
            v = policy(self, call)
            if v:
                violations.append(v)
                self._log("policy_violation", GUARD_ACTOR, [call["step"]],
                          trust=TRUSTED, tool=tool, content=v)

        if violations and self.mode == "enforce":
            result = {"status": "blocked_by_agentguard",
                      "reasons": [v.get("reason", v.get("rule", "")) for v in violations]}
            res = self._log("tool_result", tool, [call["step"]], trust=TRUSTED,
                            tool=tool, content=result, blocked=True)
        else:
            if tool in self.tools:
                fn, trust = self.tools[tool]
                try:
                    result = fn(**args)
                except Exception as exc:  # tool bugs shouldn't kill the run
                    result = {"error": f"{type(exc).__name__}: {exc}"}
            else:
                trust, result = UNTRUSTED, {"error": f"unknown tool {tool!r}"}
            res = self._log("tool_result", tool, [call["step"]], trust=trust,
                            tool=tool, content=result, blocked=False)

        self._received(actor, res["step"])
        return copy.deepcopy(result)

    # ------------------------------------------------------------ for B2 / UI
    def ancestors(self, step: int) -> set[int]:
        seen: set[int] = set()
        stack = list(self.events[step]["derived_from"])
        while stack:
            s = stack.pop()
            if s not in seen:
                seen.add(s)
                stack.extend(self.events[s]["derived_from"])
        return seen

    def save(self, directory: str = "runs") -> str:
        os.makedirs(directory, exist_ok=True)
        path = os.path.join(directory, f"{self.run_id}.jsonl")
        with open(path, "w", encoding="utf-8") as f:
            for e in self.events:
                f.write(json.dumps(e, ensure_ascii=False, default=str) + "\n")
        return path
