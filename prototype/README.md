# AgentGuard Group Prototype

This is a local prototype of a flat agent collaboration room with an optional Python bridge to Alibaba Cloud Model Studio's Qwen API. It is separate from the existing `contract.py` and does not change the ShopCo team contract.

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

The key stays in the Python process memory and is not returned by `/api/config`, written to disk, or stored in browser `localStorage`. Restarting `local_api.py` clears the key. You may also set `DASHSCOPE_API_KEY` in the Python process environment before starting the server. Do not put a key in the Group member description, chat, or repository files.

The default Base URL is the legacy Beijing endpoint, `https://dashscope.aliyuncs.com/compatible-mode/v1`. Model Studio now recommends a workspace-specific endpoint; copy its full Base URL from your workspace if available. Singapore and other regional keys need their matching regional endpoint. The local bridge accepts only HTTPS Alibaba Cloud URLs ending in `/compatible-mode/v1`.

Official endpoint reference: https://help.aliyun.com/en/model-studio/compatibility-of-openai-with-dashscope

`npm run build` checks TypeScript and creates a production bundle. `npm run test:smoke` checks the scripted flow, provenance, memory scopes, threads, and versioning. `python -m unittest discover -s tests -v` checks the Python bridge with a fake model; it does not make a paid API call.

## What works

- Add, edit, remove, and rejoin Group members; add and remove draft wake rules. Removal is a soft removal so historical events and memory remain readable. Configuration changes increment the Group version; each event records its version. The deterministic demo fixture does not yet execute those draft wake rules.
- Read and post in the Room's main stream; open and reply in threads.
- Use the customer test pane in either fixed-script mode or live Qwen mode. In live mode, Support handles customer turns; once it submits a case, Decision reviews the local demo policy and Refund produces a report. A low-value approved refund can only be added to the **simulated** ledger. No actual refund is performed.
- File upload currently records **only the filename** in both modes. The model is explicitly told that the file contents have not been reviewed.
- Switch between Room memory and each agent's independent memory. Add a candidate memory with a required source event; the memory write is also logged as an event. The graph and timeline components are imported directly from `../Memory System/src/components`.
- Run a local structural check that verifies agent events cite existing source events. This is a placeholder for the teammate's offline AgentGuard test service, not a security verdict.
- Keep draft data in browser `localStorage`; use the lower-left reset button to restore the seeded demo.

## Integration boundaries

- `src/model.ts`: `AgentAdapter.describe/invoke`, `AgentTurn`, `ProposedAction`, event and memory shapes, natural language `GroupGenerator` draft interface, and the offline `GuardTestPort`.
- `src/runtime.ts`: local event log, member configuration, provenance validation, and deterministic demo fixtures.
- `src/MemoryView.tsx`: an adapter from scoped memory records to the existing `MemoryGraph` and `MemoryTimeline` visualization contracts.
- `local_api.py`: loopback-only Python service; stores the key in memory, invokes Qwen through the OpenAI-compatible Chat endpoint in JSON mode, and checks event references before returning agent actions.
- `policies/refund_policy.md`: versioned demo policy read by the Decision agent.

The next implementation step is a persistent Group runtime, content-aware evidence handling, and a scheduler that actually executes the configurable wake rules. The offline Guard can consume a run snapshot through `GuardTestPort`; it is not in the live action path.
