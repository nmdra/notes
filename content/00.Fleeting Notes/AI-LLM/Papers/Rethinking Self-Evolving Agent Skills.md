#AI #LLM #Reading/ResearchPaper #Agents #SelfEvolution

> [!info]- Paper
> **Title:** Rethinking Self-Evolving Agent Skills: Feedback Dynamics over Multiple Rounds
> **Authors:** Yuxuan Liu, Zhaochen Su, Yuhao Zhang, et al. (HKUST, HIT, HIT-Shenzhen, SJTU)
> **Venue:** arXiv:2608.02636v1 [cs.SE], Jul 2026
> **Code:** https://github.com/HKUST-KnowComp/rethinkskill
> **In one line:** Skill self-evolution is not steady improvement — it is sparse, validation-filtered search, and which feedback you show the optimizer matters more than how many rounds you run.

> [!tldr]
> Self-evolving agent skills improve agents by turning execution feedback into persistent skill updates (no model weight changes). But nobody had isolated **what feedback** drives the improvement. This paper runs a controlled study: 42 feedback runs, 14 model–benchmark settings, 3 models (GPT-5.5, Gemini 3.1 Pro, DeepSeek V4-Pro), 5 benchmarks. They vary **only** the feedback view:
> 
> - **Normal** = successes + failures
> - **Fail-only** = failures only
> - **Success-only** = successes only
> 
> Everything else (executor, optimizer config, revision procedure, validation rule, round budget) is held fixed.
## Introduction

Self-evolving agents are [[3. Agentic AI and Autonomous Systems|AI agents]] that get better at tasks by learning from their own past attempts — without retraining the underlying model. They store what they learn in "skills" (like instruction files) that guide future runs.
Before this paper, everyone knew these systems improved agents, but no one had cleanly answered: what feedback makes the skill better? Do you learn from your successes, your failures, or both?
The authors ran a careful experiment — same models, same benchmarks, same everything — only changing whether the skill-updater saw successes, failures, or both. Result: failures matter most. Skills that used failure feedback got selected in 11 of 14 settings; success-only feedback never won. And evolution is not steady — it's rare, sparse search, where most attempts fail but a few late discoveries win big.

> don't train your agent on wins alone; show it the losses.
### What is the Skill ?

In this paper, a skill is a persistent instruction artifact that guides how the agent behaves on future tasks — typically a text file (the paper calls it skill.md) the agent reads before executing.
Key points:
- It's outside the model. No weights change. The same frozen LLM just gets better instructions to follow.
- It persists. Unlike extra inference for one question, a revised skill carries over to all future executions.
- It's versioned. Each round, a "revision operator" (the same LLM) proposes a new version — up to 4 minimal edits — and [[6. Reflexes and Guardrails|validation]] decides whether to accept, reject, or roll back to the previous version.
- It encodes operational guidance. E.g. the SpreadsheetBench skill literally contains rules like "never write formula strings, compute values in Python" and "reopen the saved workbook with data_only=True" (see Listing 3 in the paper).
So "self-evolving skills" = the agent improves its own instruction manual, round by round, based on execution feedback — keeping what works, fixing what fails.
## Key Findings

### 1. Evolution is sparse, not steady

- Only **55 of 388** candidates established a byte-distinct validation best (~14%).
- Most new bests appear in rounds 1–4 (38/55), but **6 of 11 final selections** come from late rounds 6–9 — late discovery is rare but decisive.
- Trajectories vary wildly: late discovery, early saturation, complete stagnation.
### 2. Failed trajectories are essential

- All **11 selected** evolved skills came from failure-containing feedback (Normal = 9, Fail-only = 2).
- **Success-only was never selected** in the primary study.
- Success-only yield: 11/121 new bests (9.1%) vs 44/267 (16.5%) for failure-containing feedback.
- *Caveat:* Success-only *can* work when successes expose a stable shared specification (Claude Opus +3.79, Qwen3.5-Plus +2.93 on SearchQA). It fails when sparse successes let the optimizer mistake incidental patterns for rules (DeepSeek-LiveMath validation dropped 40.0 → 11.4).
### 3. Normal vs Fail-only - no fixed winner
| View | Selected | Val ↑ | Test ↑ | Robust. ↑ | Transfer ↑ |
|------|----------|-------|--------|-----------|------------|
| Normal | 9 | 10 | 9 | 8 | 9 |
| Fail-only | 2 | 11 | 9 | 9 | 9 |
| Success-only | 0 | 6 | 5 | 5 | 6 |

- Normal broadens a repair using successes as contrast; Fail-only targets the defect directly.
- Case studies (OfficeQA, SpreadsheetBench) show both views fix the *same* failure but retain different operational specificity.
### 4. Generalization is benchmark-dependent

- 9/11 selected skills improve test, 9 robustness, 9 transfer — but only **7 improve both robustness and transfer**.
- SpreadsheetBench is the standout: +35.6 (GPT-5.5), +37.7 (Gemini), +28.8 (DeepSeek) on test, positive everywhere.
- LiveMath is a trap: GPT-5.5's selected skill *lost* 6.6 points on test (validation→test reversal).
### 5. Test-time scaling can't always replace evolution

GPT-5.5 controls (budget K attempts per task, oracle selection):

| Benchmark | Evolved skill | Parallel Sampling | Sequential Refinement |
|-----------|--------------|-------------------|----------------------|
| SearchQA | +2.29 | +1.86 (0.43 behind) | +0.14 |
| SpreadsheetBench | +35.23 | +4.27 (**30.96 behind**) | −5.34 |

- SearchQA's gain is mostly *answer-form guidance* → easily recovered by sampling diverse responses.
- SpreadsheetBench needs a *multi-step workflow* (inspect → script → materialize → save → verify) → extra samples of the parent skill rarely reproduce it.
- Sequential Refinement (condition on previous response) is **not** corrective feedback — it tracks the parent.
## Method - The Controlled Framework

```
Current skill s_r → execute round tasks → trajectories τ
  → build feedback view f (Normal / Fail-only / Success-only)
  → revision operator O proposes candidate ŝ (≤4 minimal edits)
  → validation gate: candidate becomes next-round skill if score doesn't decrease
  → best checkpoint updates ONLY on strict improvement + byte-distinct artifact
```

- 10 rounds max; early stop after 5 consecutive regressions/no-ops or empty feedback pool.
- Selection is **validation-only** (test results never leak into selection).
- Artifact identity tracked via SHA-256; byte-identical reruns treated as execution variability, not progress.
![[Rethinking Self-Evolving Agent Skills-1786891852405.webp]]
## Why This Matters (for builders of agent harnesses)

1. **Don't measure evolution with before/after scores.** Report the search trajectory: candidates, accept/reject, rollbacks, stopping decisions, and [[5. Frameworks, Extensions and Debugging|debugging evidence]].
2. **Don't throw away failures.** They are the highest-yield evidence for revision.
3. **More rounds ≠ better.** A 4-round budget captures most new-best events but misses most *final* selections. Saturation means you're paying search cost for nothing.
4. **Validation and test can disagree** (LiveMath GPT-5.5: validation ↑, test ↓). Selection on validation alone can pick a loser.
5. **Parallel sampling is a strong cheap baseline** when the skill gain is surface-level (answer form); persistent skills win when the task needs a multi-step procedure.

## Limitations (from paper)

- No dedicated skill benchmarks (SkillsBench, SkillLearnBench) — 14 settings across 5 benchmarks is still narrow coverage.
- DeepSeek-DocVQA unsupported (no native image input).
- Verifier sensitivity: two verifiers disagreed on 4.8% of verdicts; gains mostly held, but SearchQA gain flipped (−3.0 → 0.0).

## Related Works (systems by feedback view)

- **Success-gated:** SkillsVote
- **Failure-driven:** SkillRevise, SkillForge, EvoSkill, MemSkill, SkillAdaptor
- **Mixed (Normal):** SkillOpt, Trace2Skill, GeoSkill, SkillGen, OptSkills

---
*Note from: "Rethinking Self-Evolving Agent Skills: Feedback Dynamics over Multiple Rounds" (arXiv:2608.02636)*

![[Rethinking Self-Evolving Agent Skills Feedback Dynamics over Multiple Rounds-with-annotations.pdf]]