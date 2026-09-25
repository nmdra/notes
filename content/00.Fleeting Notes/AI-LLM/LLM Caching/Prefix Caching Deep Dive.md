#LLM #AI #AI/AgenticAI #DeepSeek

> [!tldr]
> **Prefix caching = reusing [[KV cache]] tensors across requests.** When a new request shares leading tokens with a completed one, the engine skips prefill for that portion and points its block table at the existing KV blocks. Two implementation families dominate: vLLM's **block-level hashing** and SGLang's **token-level radix tree** (RadixAttention). [[DeepSeek-V4.1-Flash - Architecture|DeepSeek]] does it on **disk** for its API, made economically viable by **MLA** (Multi-head Latent Attention), which compresses KV cache by ~93%.
## 1. How prefix matching works

### The core idea

During **prefill**, the engine runs the full prompt through all layers, computing K/V tensors for every token, stored in paged KV blocks. During **decode**, new tokens append their KV. Prefix caching simply **keeps those blocks alive after the request ends**, so a later request with the same prefix points its block table at existing blocks and **skips prefill entirely** for the matched portion. Per vLLM: "almost a free lunch and won't change model outputs."

### vLLM: hash-based block caching

Each KV block is hashed by its tokens **plus everything before it** (position-sensitive):

```
Block hash = hash(parent_hash, block_tokens, extra_hashes…)
```

- `extra_hashes`: LoRA IDs, multimodal input hashes, and **cache salts** (multi-tenant isolation — prevents timing-based prompt-theft attacks).
- **Only full blocks are cached** — a partial block never enters the cache.
- Data structures: pre-allocated block pool (block_id, block_hash, ref_cnt, linked-list pointers), free-block queue, hash→block map, request→block map.
- On new request: `get_computed_blocks()` hashes prompt tokens → lookup → "touch" (ref_cnt++, remove from free queue so it can't be evicted) → allocate remaining.
- Eviction: **LRU** via free-queue head; blocks freed in reverse order (last block hashes most tokens, least likely reused → evict first).
- Hash algos: `sha256` (default), `sha256_cbor` (reproducible), `xxhash` (fast but flagged security risk in multi-tenant).

### SGLang: RadixAttention (token-level radix tree)

KV lives in a **radix tree** (trie) mapping token sequences → KV tensors:

- `match_prefix()` walks from root, following child edges keyed by the first `page_size` tokens; returns longest cached prefix + terminal node.
- Match ending **inside** a stored segment **splits** the node at the exact boundary — no data duplication.
- **Reference counting**: node evictable only when not in use by running batch; cache and running requests share the same memory pool.
- **LRU eviction** of leaf nodes first, recursively (common ancestors survive until they become leaves).
- **Cache-aware scheduling**: waiting requests sorted by **longest matched prefix first** (LPM) instead of FCFS — prevents cache thrashing. The paper proves LPM achieves optimal cache hit rate offline.
- **Namespace isolation** via `extra_key` (LoRA IDs, sampling salts) — entries never share prefix nodes.
- Request sharing a short prefix: only one is scheduled, others hit the cache later.

### TensorRT-LLM & llama.cpp

- **TensorRT-LLM**: block-based + radix search tree; **prioritized LRU** (priority 0–100) improved hit rate ~20%; default 128 tokens/block; `cache_salt` for security; host offloading of evicted blocks.
- **llama.cpp**: slot-based, no shared tree — slot similarity matching (`-sps 0.5` = ≥50% prompt match), `--cache-reuse N` chunks, disk save/restore of slots, shared `--system-prompt-file`.

### Engine comparison

| Engine | Structure | Granularity | Eviction |
|---|---|---|---|
| vLLM | Hash map | Full blocks (parent hash chain) | LRU free queue |
| SGLang | Radix tree | Page-aligned tokens | LRU leaves + LPM scheduling |
| TensorRT-LLM | Radix search tree | Blocks (default 128 tok) | Prioritized LRU |
| llama.cpp | Slot cache | Chunks ≥ N tokens | Slot reuse |
| DeepSeek API | Disk-persisted prefix units | 64-token units | Hours–days TTL |

## 2. DeepSeek's mechanism

### API context caching (on disk)

- **Automatic, default-on for everyone** — no code, no cache keys, no TTL knobs.
- **Disk-based** (not GPU memory) — the cache stores prefixes on hard disk; the API is billed on hit vs miss.
- **Prefix units** persisted three ways:
  1. **Request boundaries** — two units per request (end of user input, end of model output);
  2. **Common-prefix detection** — shared prefixes detected across requests get persisted as their own unit;
  3. **Fixed token intervals** — long inputs/outputs carved into units.
- **64-token storage unit** — content under 64 tokens is never cached.
- **Prefix-only matching from token 0** — partial matches mid-prompt never hit; identical first-line requirement.
- Sliding-window-attention models: each cached prefix is an independent complete unit.
- Response usage: `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` (hit + miss = prompt_tokens).
- Output is **still generated fresh** — only prefix computation is cached; temperature still applies.
- Best-effort: cache construction takes seconds; unused entries cleared in hours–days; `user_id` provides per-user KV isolation.
- Live tests: 98.23% hit on exact extension; 99.79% on stable long prefix; **0% when the first line changes**.

### Pricing: the 10× gap

| | Cache hit (read) | Cache miss (write) |
|---|---|---|
| 2024 (deepseek-chat) | $0.014/M | $0.14/M |
| V4 era (third-party) | ~$0.0028/M (~98% off) | $0.14/M |

> [!warning]
> V4 pricing figures are third-party reports — verify against the official pricing page before relying on them.

### MLA: the architectural enabler

DeepSeek's disk caching only works because of **Multi-head Latent Attention** (DeepSeek-V2 paper):

```
c_t^KV = W^DKV h_t        # down-project hidden state to latent (d_c dims)
k_t^C  = W^UK c_t^KV     # up-project to keys
v_t^C  = W^UV c_t^KV     # up-project to values
```

- **Only the small latent `c_t^KV` is cached per token** (512 dims in V2/V3, vs. dense K/V for every head).
- **Matrix absorption**: `W^UK` folds into `W^Q`, `W^UV` into `W^O` — keys/values never materialize for cached tokens.
- **Decoupled RoPE**: position encoding needs a small extra per-head key `k_t^R` (64 dims) since it can't be absorbed.
- Result vs DeepSeek 67B: **93.3% KV cache reduction**, 5.76× max generation throughput.
- MLA reads ~576 floats/token vs ~16K for MHA (~28× less bandwidth).
- DeepSeek's own framing: "This is made possible by the MLA architecture… enabling efficient storage on low-cost disks."

### DeepSeek-V4 & ShadowRadix (serving side)

- V4 uses **hybrid attention**: SWA (sliding window 128) + C4 (4:1 compressed, top-512 sparse) + C128 (128:1 compressed) layers. KV cache at 1M context ≈ 9.62 GiB/seq in bf16 (~8.7× smaller than V3.2-style).
- **ShadowRadix** (LMSYS day-0 blog): a radix tree indexing virtual full-token slots; per-pool "shadow" mappings project into physical SWA/C4/C128 pools; two-counter locks per node (`full_lock_ref` + `swa_lock_ref`) handle sliding-window invalidation; matching requires 128 consecutive live tokens before extending into the window.
- Real vLLM bug (PR #43447): SWA block allocation flushed cached blocks, collapsing hit rate; fix restored **>95% hit rate** on 14 concurrent 1M-context requests.

## 3. Practical takeaways

- **Measured wins**: SGLang up to 5× throughput; LMCache up to 15×; DeepSeek API ~98–99% hit rates on stable prefixes; TensorRT-LLM priority eviction +20% hit rate.
- **Cache and active KV compete for the same HBM** — a prefix resident at 4 concurrent requests gets evicted at 200. Measure at your real concurrency.
- **[[Prompt Caching In Agents|Prompt structure]] is everything**: stable content first (system prompt → tools → docs → user message), byte-identical from token 0. Interpolated variables early in the prompt poison the prefix (production case: 30–55% → ~85% hit after restructuring).
- **Don't prepend tenant identity** — use `user_id` for isolation, not prompt position zero.
- **Multi-level caching** (LMCache): GPU → CPU pinned → disk/NVMe → remote (Redis/S3), 256-token chunks, survives process restarts.
- **MoE caveat**: prefix reuse assumes deterministic routing; DeepSeek's load-balanced/hash routing keeps cached prefixes valid.

## Sources

- [vLLM Automatic Prefix Caching](https://docs.vllm.ai/en/stable/design/prefix_caching/)
- [SGLang: Efficient Execution of Structured Language Model Programs (arXiv 2312.07104)](https://arxiv.org/pdf/2312.07104)
- [DeepSeek API Context Caching guide](https://api-docs.deepseek.com/guides/kv_cache/)
- [DeepSeek: Context Caching on Disk announcement](https://api-docs.deepseek.com/news/news0802/)
- [DeepSeek-V2 paper (MLA, arXiv 2405.04434)](https://arxiv.org/abs/2405.04434v5)
- [LMSYS DeepSeek-V4 day-0 blog (ShadowRadix)](https://www.lmsys.org/blog/2026-04-25-deepseek-v4/)
- [vLLM DeepSeek-V4 blog](https://vllm.ai/blog/2026-04-24-deepseek-v4)
- [vLLM PR #43447 (SWA prefix-cache retention, >95% hit rate)](https://github.com/vllm-project/vllm/pull/43447)
- [TensorRT-LLM KV cache reuse](https://nvidia.github.io/TensorRT-LLM/features/kvcache.html)
- [LMCache paper (arXiv 2510.09665)](https://arxiv.org/html/2510.09665v2)
- [Third-party DeepSeek caching guide](https://deepseekai.guide/api/deepseek-api-context-caching/)
- [Live DeepSeek cache-hit tests](https://chat-deep.ai/docs/deepseek-context-caching/)

## Related

- [[KV cache]] — the underlying per-request mechanism
- [[Prefix vs KV vs Prompt Caching]] — the three-layer comparison
- [[Prompt Caching in LLM]] — provider pricing and best practices
- [[Prompt Caching In Agents]] — caching in agentic workloads