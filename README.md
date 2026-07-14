# Kriya Growth Cockpit — Build Bundle

Everything built for the Anil Stocker / Kriya Growth Lead conversation.

## What's inside

### `/app` — the deployable web app (Kriya Growth Cockpit)
A unified multi-agent web app. Four tabs: Overview, Lever 1 (Cross-Sell Signal Miner),
Lever 3 (Broker Reactivator), and Guardrails & Evals. Each lever runs a live
supervisor-pattern orchestration: parallel scoring sub-agents (Haiku) plus a synthesis
step (Sonnet) that returns a ranked, reason-coded action list for a human.

- `index.html` — the full front end (4 tabs, live orchestration UI, brand styling)
- `api/orchestrate.js` — serverless backend. Reads `ANTHROPIC_API_KEY` server-side only.
- `vercel.json` — sets the function max duration to 60s
- `package.json` — declares the Anthropic SDK dependency

**To deploy on Vercel:**
1. Push this `/app` folder to a repo, or drag it into a new Vercel project
2. Project name suggestion: `kriya-growth-cockpit`
3. After the first deploy, add an environment variable in Vercel:
   Settings → Environment Variables → `ANTHROPIC_API_KEY` = your key
4. Redeploy so the key takes effect. The live orchestration only works once the key is set.

### `/flow-diagrams` — architecture + flow mindmaps (open in any browser)
- `Lever1_CrossSell_Flow.html` — Cross-Sell Signal Miner: orchestrator, 4 scoring
  sub-agents (Cash-Gap, Fit, Timing, Risk Pre-Check), guardrail band, decision flow,
  feedback loop.
- `Lever3_Broker_Flow.html` — Broker Reactivator: 4 sub-agents (Quality, Dormancy, Fit,
  Sequence Writer), quality-beats-volume comparison, decision flow.

### `/companion-docs` — Word write-ups for each lever
- `Lever1_CrossSell_SignalMiner.docx` — the opportunity, how it works, sub-agents, data
  sources, guardrails, evals, why it's the strongest lever.
- `Lever3_Broker_Reactivator.docx` — the £50bn broker market, quality-vs-volume maths,
  data sources, guardrails, evals, and how it complements Lever 1.

### `DATA_NOTES.md`
The real 2025–2026 market data (invoice finance, late payments, broker channel) that
grounds both levers, plus the agent-design principles used.

## Design basis
Orchestrator-worker (supervisor) pattern, per Anthropic's "Building Effective Agents":
specialist sub-agents run in parallel with separate context; a synthesis step composes
the final ranked output; human-in-the-loop on every outbound action; explicit guardrails;
per-agent eval suites. Brand is deliberately Kriya-distinct: deep plum, grape, teal,
Fraunces + Inter + JetBrains Mono.
