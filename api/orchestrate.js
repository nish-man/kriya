// Kriya Growth Cockpit — orchestration backend
// Supervisor pattern: sub-agents (haiku) run in parallel, synthesis (sonnet) composes the ranked output.
// The ANTHROPIC_API_KEY is read server-side only and never exposed to the client.

const MODEL_SUB = "claude-haiku-4-5-20251001";
const MODEL_SYNTH = "claude-sonnet-4-6";

async function callClaude(model, system, user, maxTokens) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set in Vercel environment variables");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens || 1024,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`API ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
}

function extractJSON(text) {
  // strip code fences and grab the first {...} or [...]
  let t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const firstBrace = Math.min(...["{", "["].map(c => { const i = t.indexOf(c); return i === -1 ? Infinity : i; }));
  if (firstBrace === Infinity) throw new Error("No JSON found in model output");
  t = t.slice(firstBrace);
  // find matching close by scanning
  const open = t[0], close = open === "{" ? "}" : "]";
  let depth = 0, end = -1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === open) depth++;
    else if (t[i] === close) { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error("Unbalanced JSON in model output");
  return JSON.parse(t.slice(0, end + 1));
}

// ---------------- LEVER 1: Cross-Sell Signal Miner ----------------
const L1_ACCOUNTS = [
  { id: "AC-4821", name: "Northgate Precision Ltd", sector: "Manufacturing", turnover: "£4.2m", tenure: "3y", note: "Regular 60-90 day receivable gaps, invoice-heavy inflows" },
  { id: "AC-5190", name: "Halloway Logistics", sector: "Transport", turnover: "£8.6m", tenure: "5y", note: "Seasonal dips Q1/Q3, large single-debtor concentration" },
  { id: "AC-3374", name: "Verve Interiors", sector: "Wholesale", turnover: "£1.9m", tenure: "2y", note: "Stock-heavy, steady growth, thin cash buffer" },
  { id: "AC-6642", name: "Tidewater Foods", sector: "Food & Bev", turnover: "£12.1m", tenure: "6y", note: "Long supermarket payment terms, strong repayment history" },
  { id: "AC-2205", name: "Loom & Last", sector: "Retail", turnover: "£0.8m", tenure: "1y", note: "Card-heavy revenue, limited B2B invoicing" },
  { id: "AC-7788", name: "Brightwork Recruitment", sector: "Recruitment", turnover: "£3.4m", tenure: "4y", note: "Weekly payroll vs monthly client pay, classic funding gap" },
];

const L1_SUBAGENTS = {
  cashgap: { name: "Cash-Gap Scorer", role: "You detect working-capital gaps. Score how strongly each account shows invoice-heavy inflows and recurring cash-cycle dips that signal a business regularly waiting on payment." },
  fit: { name: "Fit Scorer", role: "You assess product fit. Score how well each account matches the ideal invoice-finance customer: B2B, invoice-raising, sector and size suited to £100k-£5m facilities." },
  timing: { name: "Timing Scorer", role: "You assess timing. Score how likely each account is to need funding soon, based on seasonal patterns, growth signals, and cash-buffer thinness." },
  risk: { name: "Risk Pre-Check", role: "You screen for obvious credit red flags. Score each account for suitability, flagging any that a relationship manager should NOT approach. High score means clean, low means risky." },
};

// ---------------- LEVER 3: Broker Reactivator ----------------
const L3_BROKERS = [
  { id: "BR-118", name: "Meridian Commercial Finance", deals: 40, drawdown: 6, note: "High volume, low conversion, lots of admin" },
  { id: "BR-204", name: "Oakfield Business Loans", deals: 12, drawdown: 9, note: "Low volume, excellent conversion and repayment" },
  { id: "BR-339", name: "Castlebridge Advisory", deals: 22, drawdown: 14, note: "Strong quality, went quiet 4 months ago" },
  { id: "BR-476", name: "Pennine Finance Partners", deals: 31, drawdown: 8, note: "Mid quality, specializes in manufacturing" },
  { id: "BR-512", name: "Delphi Capital Brokers", deals: 5, drawdown: 4, note: "Very low volume but every deal high value and clean" },
  { id: "BR-627", name: "Stone & Marsh Commercial", deals: 28, drawdown: 3, note: "High volume, poor repayment quality on introduced deals" },
];

const L3_SUBAGENTS = {
  quality: { name: "Quality Scorer", role: "You score broker deal QUALITY, not volume. Reward high drawdown rate, clean repayment, and larger facility sizes. Penalize high-volume low-conversion brokers." },
  dormancy: { name: "Dormancy Scorer", role: "You find high-quality brokers who have gone quiet and are worth a personal re-approach. High score means valuable-but-dormant, worth reactivating." },
  fit: { name: "Fit Scorer", role: "You match broker specialism against Kriya's £100k-£5m invoice finance product. Score how well each broker's book fits what Kriya can now fund." },
  sequence: { name: "Sequence Writer", role: "You assess how ready each broker is for a tailored outreach sequence and note the single best angle for re-approaching them." },
};

function subAgentPrompt(items, agentRole, keyLabel) {
  return `${agentRole}

Here are the ${keyLabel} to score:
${JSON.stringify(items, null, 2)}

Return ONLY a JSON array, one object per ${keyLabel.slice(0, -1)}, each like:
{"id": "<id>", "score": <0-100 integer>, "headline": "<max 12 word reason>"}
No prose, no code fences, JSON array only.`;
}

async function runSubAgent(items, agent, keyLabel) {
  const out = await callClaude(MODEL_SUB, "You are a precise scoring agent. Output only valid JSON.",
    subAgentPrompt(items, agent.role, keyLabel), 900);
  return { agent: agent.name, scores: extractJSON(out) };
}

async function synthesizeL1(subResults) {
  const sys = "You are the Cross-Sell Orchestrator for Kriya, a B2B lender owned by Allica Bank. You combine sub-agent scores into a ranked, reason-coded action list for human relationship managers. You never contact customers. You keep credit signals separate from lending decisions.";
  const user = `Four sub-agents scored Allica business accounts for Kriya Invoice Finance cross-sell. Accounts:
${JSON.stringify(L1_ACCOUNTS, null, 2)}

Sub-agent scores:
${JSON.stringify(subResults, null, 2)}

Produce a ranked cross-sell action list. Return ONLY this JSON:
{
  "headline": "<one sentence on the top opportunity and the guardrail>",
  "ranked": [
    {"id":"<id>","name":"<name>","priority":<1-based rank>,"composite":<0-100>,"product":"Invoice Finance","reason":"<max 18 word why-now for the RM>","flag":"<'' or a short caution>"}
  ],
  "excluded": [{"name":"<name>","why":"<max 12 words, e.g. poor fit or risk flag>"}]
}
Rank by genuine working-capital need and fit. Put any risky or poor-fit account in excluded, not ranked. JSON only.`;
  const out = await callClaude(MODEL_SYNTH, sys, user, 1600);
  return extractJSON(out);
}

async function synthesizeL3(subResults) {
  const sys = "You are the Broker Reactivator Orchestrator for Kriya, owned by Allica Bank. You rank brokers by deal QUALITY not volume, and draft reactivation priorities for a human to action. You never auto-send outreach. You never permanently gate a broker out.";
  const user = `Four sub-agents scored Kriya's brokers for channel reactivation. Brokers:
${JSON.stringify(L3_BROKERS, null, 2)}

Sub-agent scores:
${JSON.stringify(subResults, null, 2)}

Produce a prioritized broker playbook. Return ONLY this JSON:
{
  "headline": "<one sentence contrasting quality vs volume, naming the top broker>",
  "ranked": [
    {"id":"<id>","name":"<name>","priority":<rank>,"quality":<0-100>,"tier":"<'Priority'|'Nurture'|'Monitor'>","reason":"<max 18 word why>","sequence":"<the single best re-approach angle, max 15 words>"}
  ],
  "watch": [{"name":"<name>","why":"<max 14 words, e.g. high volume but poor repayment quality>"}]
}
Rank by quality and drawdown, not raw deal count. JSON only.`;
  const out = await callClaude(MODEL_SYNTH, sys, user, 1600);
  return extractJSON(out);
}

module.exports = async (req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST only" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { stage, lever, agent } = body || {};

  try {
    if (stage === "subagent") {
      if (lever === "crosssell") {
        const a = L1_SUBAGENTS[agent];
        if (!a) return res.status(400).json({ ok: false, error: "unknown agent" });
        const r = await runSubAgent(L1_ACCOUNTS, a, "accounts");
        return res.status(200).json({ ok: true, ...r });
      }
      if (lever === "broker") {
        const a = L3_SUBAGENTS[agent];
        if (!a) return res.status(400).json({ ok: false, error: "unknown agent" });
        const r = await runSubAgent(L3_BROKERS, a, "brokers");
        return res.status(200).json({ ok: true, ...r });
      }
      return res.status(400).json({ ok: false, error: "unknown lever" });
    }

    if (stage === "synthesize") {
      const subResults = body.subResults || [];
      if (lever === "crosssell") return res.status(200).json({ ok: true, report: await synthesizeL1(subResults) });
      if (lever === "broker") return res.status(200).json({ ok: true, report: await synthesizeL3(subResults) });
      return res.status(400).json({ ok: false, error: "unknown lever" });
    }

    return res.status(400).json({ ok: false, error: "unknown stage" });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e.message || e) });
  }
};
