# AgentGuard Group Prototype

This is a local prototype of a flat agent collaboration room with an optional Python bridge to Alibaba Cloud Model Studio's Qwen API. It shares the repository with the standalone Guard contract and connects to Guard through an offline Room snapshot adapter. The authoritative integration interface is in the [root README](../README.md#current-room--guard-integration-contract).

## Run

Start the local API in one terminal:

```powershell
cd prototype
python local_api.py
```

Start the frontend in another:

```powershell
cd prototype
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`, choose **Qwen API 配置**, enter your Model Studio key, set the Base URL for the same region, and save. Then switch the customer test window to **Qwen 实时调用**. Each agent may override the default model ID in its member configuration. The default is `qwen-plus`.

To run a complete refund, follow the messages and upload the prepared TXT files in [`demo/materials`](../demo/materials/README.md). The files are deliberately outside the frontend; you choose and upload them yourself. The server compares their fields with its own order, warehouse return, and approval records. The lower-left reset button clears both the browser Room and the in-memory simulator, so each scenario can be run again.

The key stays in the Python process memory and is not returned by `/api/config`, written to disk, or stored in browser `localStorage`. Restarting `local_api.py` clears the key. You may also set `DASHSCOPE_API_KEY` in the Python process environment before starting the server. Do not put a key in the Group member description, chat, or repository files.

The default Base URL is the legacy Beijing endpoint, `https://dashscope.aliyuncs.com/compatible-mode/v1`. Model Studio now recommends a workspace-specific endpoint; copy its full Base URL from your workspace if available. Singapore and other regional keys need their matching regional endpoint. The local bridge accepts only HTTPS Alibaba Cloud URLs ending in `/compatible-mode/v1`.

Official endpoint reference: https://help.aliyun.com/en/model-studio/compatibility-of-openai-with-dashscope

`npm run build` checks TypeScript and creates a production bundle. `npm run test:smoke` checks the scripted flow, provenance, memory scopes, threads, and versioning. `python -m unittest discover -s tests -v` checks the Python bridge with a fake model; it does not make a paid API call.

## What works

- Add, edit, remove, and rejoin Group members; add and remove draft wake rules. Removal is a soft removal so historical events and memory remain readable. Configuration changes increment the Group version; each event records its version. The deterministic demo fixture does not yet execute those draft wake rules.
- Read and post in the Room's main stream; open a thread, choose an active member, and receive its reply. Fixed-script mode labels its reply as simulated; Qwen mode invokes the selected member.
- Use the customer test pane in fixed-script mode for UI smoke checks or Qwen mode for the evidence-aware refund flow. Support handles customer turns and server-side evidence checks; Decision reviews the policy and approval registry; Refund writes only to the simulated ledger and produces a report. The Room sidebar displays the server ledger independently of the Agent report. No actual refund is performed.
- Upload TXT or JSON customer evidence through `/api/evidence/upload` in Qwen mode. The server reads the content, limits it to 32 KB, hashes it, and compares its fields to the shop records. Uploaded approval notices remain customer claims.
- Switch between Room memory and each agent's independent memory. Add a candidate memory with a required source event; the memory write is also logged as an event. The graph and timeline components are imported directly from `../Memory System/src/components`.
- Run the offline Guard from the Room page. It checks event citations and structured tool results, applies the refund policy, and returns source paths in Room event IDs. Historical unstructured tool messages receive an incomplete coverage finding.
- Keep Room draft data in browser `localStorage`. The shop simulator keeps evidence, attestations, and ledger entries in Python process memory; restarting the service requires re-uploading evidence. The reset button clears both sides.

## Integration boundaries

- `src/model.ts`: `AgentAdapter.describe/invoke`, `AgentTurn`, `ProposedAction`, event and memory shapes, natural language `GroupGenerator` draft interface, and the offline `GuardTestPort`.
- `src/runtime.ts`: local event log, member configuration, provenance validation, and deterministic demo fixtures.
- `src/MemoryView.tsx`: an adapter from scoped memory records to the existing `MemoryGraph` and `MemoryTimeline` visualization contracts.
- `local_api.py`: loopback-only Python service; stores the key in memory, invokes Qwen through the OpenAI-compatible Chat endpoint in JSON mode, and checks event references before returning agent actions. It exposes upload and reset endpoints.
- `shop_simulator.py` and `simdata/`: server-owned orders, returns, approvals, evidence verification, attested tool results, and an in-memory simulated refund ledger.
- `policies/refund_policy.md`: versioned demo policy read by the Decision agent.

The next implementation step is a persistent Group runtime and a scheduler that executes configurable wake rules. The local shop records are deterministic fixtures rather than a real commerce or identity provider. The offline Guard consumes a Room snapshot through `GuardTestPort`; it is not in the live action path.
