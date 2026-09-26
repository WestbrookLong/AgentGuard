# AgentGuard Group Prototype

This is a local, frontend-only prototype of a flat agent collaboration room. It is separate from the existing `contract.py` and does not change the ShopCo team contract.

## Run

```powershell
cd prototype
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://127.0.0.1:5173/`). `npm run build` checks TypeScript and creates a production bundle. `npm run test:smoke` checks the scripted flow, provenance, memory scopes, threads, and versioning.

## What works

- Add, edit, remove, and rejoin Group members; add and remove draft wake rules. Removal is a soft removal so historical events and memory remain readable. Configuration changes increment the Group version; each event records its version. The deterministic demo fixture does not yet execute those draft wake rules.
- Read and post in the Room's main stream; open and reply in threads.
- Use the customer test pane for a deterministic, multi-turn ShopCo demo. Sending a customer message triggers a scripted Support reply. Uploading a file records **only its name** and drives the scripted Support → Decision → Refund review. No file content is read, no model is called, and no refund is performed.
- Switch between Room memory and each agent's independent memory. Add a candidate memory with a required source event; the memory write is also logged as an event. The graph and timeline components are imported directly from `../Memory System/src/components`.
- Run a local structural check that verifies agent events cite existing source events. This is a placeholder for the teammate's offline AgentGuard test service, not a security verdict.
- Keep draft data in browser `localStorage`; use the lower-left reset button to restore the seeded demo.

## Integration boundaries

- `src/model.ts`: `AgentAdapter.describe/invoke`, `AgentTurn`, `ProposedAction`, event and memory shapes, natural language `GroupGenerator` draft interface, and the offline `GuardTestPort`.
- `src/runtime.ts`: local event log, member configuration, provenance validation, and deterministic demo fixtures.
- `src/MemoryView.tsx`: an adapter from scoped memory records to the existing `MemoryGraph` and `MemoryTimeline` visualization contracts.

The next implementation step is a persistent Group runtime and real agent adapters. It should replace the fixture functions in `src/runtime.ts`, preserve event IDs and explicit basis references, and feed real scoped memory data into `MemoryView`. The offline Guard can consume a run snapshot through `GuardTestPort`; it is not in the live action path.
