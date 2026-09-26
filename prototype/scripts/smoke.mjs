import assert from "node:assert/strict";
import { build } from "esbuild";

const { outputFiles } = await build({ entryPoints: ["src/runtime.ts"], bundle: true, platform: "node", format: "esm", write: false });
const runtime = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`);
const data = new Map();
globalThis.localStorage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };

let state = runtime.resetState();
assert.equal(state.agents.length, 3);
state = runtime.simulateCustomerMessage(state, "I want a refund for order #1182");
assert.equal(state.events.filter((event) => event.channel === "customer").length, 2);
state = runtime.simulateEvidence(state, "return-proof.pdf");
assert.ok(state.events.some((event) => event.kind === "case"));
assert.ok(state.events.some((event) => event.kind === "decision"));
assert.ok(state.events.some((event) => event.kind === "report"));
assert.ok(!state.events.some((event) => event.kind === "tool" && event.body.includes("issue_refund")));
for (const scope of ["room", "support", "decision", "refund"]) assert.ok(state.memories.some((memory) => memory.scopeId === scope));
assert.equal((await runtime.structuralGuardPlaceholder.review(state)).status, "pass");
const [withThread, reply] = runtime.appendAction(state, { actorId: "human", kind: "message", channel: "group", body: "Please verify evidence", basisEventIds: ["evt_support"], threadId: "evt_support" });
assert.equal(reply.threadId, "evt_support");
assert.equal(reply.groupVersion, withThread.version);
const changed = runtime.addAgent(withThread, "Evidence", "Review submitted evidence", "inspect_file");
assert.equal(changed.version, withThread.version + 1);
console.log("Prototype smoke checks passed: multi-turn fixture, provenance, scoped memory, thread, versioning.");
