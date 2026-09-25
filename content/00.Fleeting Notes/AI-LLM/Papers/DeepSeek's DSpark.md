#AI #LLM #DeepSeek #Reading/ResearchPaper

> [!video]- DSpark: DeepSeek-V4's Insane Compute Optimization Explained
> ![DSpark: DeepSeek-V4's Insane Compute Optimization Explained - YouTube](https://www.youtube.com/watch?v=Sl0XXm35JMo)
> [[1. An Introduction to LLM#Autoregressive Generation]]

> [!see]- DSpark Paper
> ![[DSpark Confidence-Scheduled Speculative Decoding with Semi-Autoregressive Generation.pdf]]

> [!tldr] Core Idea
> **DSpark makes LLMs generate tokens faster, not smarter: a cheap draft model proposes a block of tokens, the large model verifies them in one forward pass, and DSpark only verifies the part worth verifying.**
> 
> - Autoregressive decoding costs one expensive forward pass per token; speculative decoding drafts with a small model and checks the whole block at once, keeping the target model's output distribution unchanged.
> - Longer draft blocks waste compute: draft quality decays toward the end, verification stops at the first rejection, and fixed-length verification burns target-model capacity.
> - DSpark's answers: semi-autoregressive drafting (parallel backbone plus a lightweight sequential head so later tokens depend on earlier ones), a confidence head predicting which tokens survive, and a hardware-aware scheduler that sets verification length from confidence and GPU load.
> - Against [[DFlash - Block Diffusion for Flash Speculative Decoding|DFlash]]: same parallel drafting, plus intra-block dependency and confidence-scheduled verification. Context: [[9. Inference Optimization]].

> [!info]
> This paper fundamentally not about making LLM smarter, It's about making LLMs generate tokens faster.
## Problem

LLMs generate text autoregressively: each new token requres a full forward pass conditioned on all receding tokens.
> One exepensive forward pass for every token.
> If we want 500 output tokens = 500 forward pass
> That's the bottleneck.

![[DeepSeek's DSpark-1784564102351.webp|841]]
### Speculative Decoding

This method suggest,  Instead of asking the expensive model every time, a smaller draft model says `I think the next tokens are..`, then the large model checks all of them in ==one forward pass.== this is huge speed up.

Suppose you have two models,
- Large Model (Target) -> Very accurate and Very Expensive.
- Small Model (Draft) -> Less Accurate and Very Cheap

> Can the small model do most of the work while the large model only checks it?

The draft model is trained using knowledge distillation. (The large target model generates hidden states and probability distributions, the draft model learn to mimic those distributions.)

The target model **does not regenerate one token at a time**.
It evaluates the **entire proposed block in one forward pass**. This parallel verification is what creates the speedup.

The paper explains this basic [[9. Inference Optimization|speculative decoding]] setup and notes that verification preserves the target model's output distribution exactly, so quality is unchanged.
### Problem of basic Speculative Decoding

**The draft model must be fast and accurate, Unfortunately these goals conflict.**

The problem with basic speculative decoding is **not the idea of speculation itself**. The problem is that as you try to speculate **more tokens at once**, you waste increasing amounts of computation because:

- draft quality deteriorates later in the block,
- verification stops at the first rejection,
- fixed-length verification checks many tokens that are unlikely to be accepted,
- and under heavy serving load, those unnecessary verifications reduce overall system throughput.
## How DSpark fixes the problems of basic speculative decoding ?

![[DeepSeek's DSpark-1784564143237.webp]]

| Problem in Basic Speculative Decoding                                                                                              | DSpark's Solution                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Parallel drafters generate inconsistent token sequences** because each token is predicted independently.                         | **Semi-autoregressive drafting:** Keep a fast parallel backbone, then use a lightweight sequential head to make later tokens depend on earlier ones. This improves sequence coherence and acceptance. |
| **Acceptance drops for later tokens**, so long draft blocks are often wasted.                                                      | The sequential head reduces suffix errors, allowing more tokens to survive verification and increasing the average accepted length ($\tau$).                                                          |
| **Verifying every drafted token wastes expensive target-model computation**, especially for low-confidence suffixes.               | **Confidence head:** Predicts the probability that each draft token will be accepted, allowing low-confidence suffixes to be skipped.                                                                 |
| **A fixed verification length is inefficient** because different tasks and system loads require different amounts of verification. | **Hardware-aware scheduler:** Dynamically adjusts how many draft tokens are verified based on confidence estimates and current GPU load.                                                              |
## DFlash vs DSpark

> [[DFlash - Block Diffusion for Flash Speculative Decoding|DFlash]] = fully parallel drafting
> DSpark = DFlash-style parallel drafting + a small sequential correction mechanism + smarter verification scheduling.

[[DFlash - Block Diffusion for Flash Speculative Decoding|DFlash]] generates an entire block of candidate tokens in essentially one parallel drafting pass, using a lightweight block-diffusion draft model conditioned on hidden features from the target LLM. That makes drafting very fast. The weakness is that tokens inside the proposed block do not strongly depend on the previously proposed tokens. As you move toward the end of a block, the candidates can become less coherent, so later tokens are rejected more often by the target model. The DSpark paper calls this **acceptance/suffix decay**.

DSpark keeps the parallel backbone but adds a lightweight **sequential module** so that a token can incorporate information about the preceding drafted token(s). In the paper this is described as **semi-autoregressive generation**. The goal is to preserve most of DFlash's parallel speed while restoring enough token-to-token dependency to make the later parts of the draft block more accurate.

There is another important difference: **DSpark predicts confidence and decides how much of the draft is worth verifying.** Rather than always sending a long block to the expensive target model, DSpark estimates the probability that each prefix will survive verification and dynamically chooses an appropriate verification length based partly on the serving system's throughput characteristics. This is especially important under high concurrency, because verifying low-confidence tokens wastes target-model compute and batch capacity. DFlash itself does not have this confidence-scheduled verification mechanism.

| |**DFlash**|**DSpark**|
|---|---|---|
|Draft generation|Parallel block|Parallel backbone + lightweight sequential correction|
|Tokens within draft block|Weak/no causal dependency between drafted positions|Adds intra-block dependency|
|Main weakness addressed|Fast drafting|DFlash's suffix/acceptance decay|
|Confidence prediction|Not the central mechanism|Yes|
|Verification length|Generally draft/block-oriented|Dynamically scheduled|
|Main goal|Make speculative **drafting extremely fast**|Improve **end-to-end serving efficiency** while retaining parallel drafting|

> DFlash asks, _"How can I generate the whole speculative block in parallel?"_ DSpark asks, _"How can I keep that parallelism, make the block more internally coherent, and verify only the part that's actually worth verifying?"_
