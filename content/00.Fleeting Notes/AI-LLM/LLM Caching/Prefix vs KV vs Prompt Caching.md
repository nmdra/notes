#LLM #AI #AI/AgenticAI

> [!tldr]
> Three related mechanisms are often called **caching**, but they operate at different scopes:
> 
> - **[[KV cache|KV cache]]** — reuses attention state **within one generation**.
> - **[[Prefix Caching Deep Dive|Prefix caching]]** — reuses previously computed prefix state **across requests** in a serving engine.
> - **[[Prompt Caching in LLM|Prompt caching]]** — provider-managed prefix caching exposed through an API, usually with **cache-control, TTL, usage, and pricing semantics**.
>     
> 
> All three avoid recomputing tokens the model has already processed. Assuming the cached state is valid and reused exactly, they **do not change model generation semantics**.
> 
> The relationship is roughly:
> 
> > **KV cache is the underlying state → prefix caching reuses that state across requests → prompt caching exposes that reuse as a managed API feature.**

## Comparison

| |**KV cache**|**Prefix caching**|**Prompt caching**|
|---|---|---|---|
|**What's cached**|Attention K/V tensors for previous tokens|Cached model state / KV blocks for a shared prefix|Provider-managed state for a reusable prompt prefix|
|**Scope**|Within one generation|Across requests|Across API requests|
|**Main phase saved**|Decode|Prefill|Prefill|
|**Typical layer**|Model runtime|Serving engine|Hosted model provider|
|**Examples**|vLLM, llama.cpp, TensorRT-LLM|vLLM prefix caching, SGLang RadixAttention|OpenAI, Anthropic, DeepSeek|
|**Control**|Usually automatic|Engine/config dependent|Provider dependent|
|**Primary benefit**|Faster decode|Lower TTFT + higher throughput|Lower latency and/or input cost|
|**Cache miss**|No reusable prior state|Prefix is recomputed|Prefix is processed at normal/cache-write rates|
|**Changes model semantics?**|No|No|No|

## The key relationship

### 1. KV cache: reuse inside one request

During **prefill**, the model processes the prompt and computes attention keys and values for its tokens.

```text
Prompt
  │
  ▼
Prefill
  │
  ▼
KV cache
  │
  ├── generate token 1
  ├── append its K/V
  ├── generate token 2
  ├── append its K/V
  └── ...
```

Without a KV cache, every decode step would need to recompute attention state for tokens the model has already processed.

With it, each new token computes its new state and attends to the previously stored state.

So:
> **KV caching primarily accelerates decode.**
### 2. Prefix caching: reuse across requests

Suppose many requests begin with the same large prefix:

```text
[system prompt]
[tool definitions]
[few-shot examples]
[user-specific message]
```

Request A computes:

```text
shared prefix ──prefill──► cached model state
```

Later, Request B starts with the same prefix:

```text
shared prefix ───────────► reuse cached state
new tokens    ──prefill──► compute uncached suffix
```

Instead of rerunning the entire shared prefix, the serving engine restores or references its cached state and continues from there.

So:
> **Prefix caching primarily accelerates prefill.**

This can improve:

- **TTFT** — time to first token
- GPU throughput
- compute efficiency
- cost per request in self-hosted systems

Prefix reuse ends when the cacheable representation of the requests diverges.

For example:

```text
A: System + Tools + Few-shot + User A
B: System + Tools + Few-shot + User B
                         ▲
                reusable prefix ends here
```

A change near the **end** loses little reuse.

A change near the **beginning** can destroy most of the cacheable prefix.
### 3. Prompt caching: managed prefix caching

Hosted providers expose versions of this optimization as **prompt caching** or **context caching**.

Conceptually:
```text
[large stable prefix]
[small changing suffix]
```

becomes:
```text
stable prefix   ──► cache hit
changing suffix ──► normal prefill
                         │
                         ▼
                      decode
```

Depending on the provider, the API may expose:

- cached-input token counts
- separate cache-write and cache-read prices
- automatic prefix detection
- explicit cache breakpoints
- TTL controls
- cache-routing keys
- cache-hit/miss telemetry

So the useful mental model is:
> **Prompt caching is provider-managed prefix reuse with an API and billing contract around it.**

It is closely related to prefix caching, but you should not assume every provider implements storage, matching, eviction, or cache boundaries identically.
## Prefill vs. decode

This distinction makes all three mechanisms easier to remember.

```text
REQUEST

Prompt tokens
     │
     ▼
 ┌─────────┐
 │ PREFILL │  ← Prefix / prompt caching helps here
 └────┬────┘
      │
      ▼
   KV state
      │
      ▼
 ┌────────┐
 │ DECODE │  ← KV cache helps here
 └────────┘
      │
      ▼
Generated tokens
```
### Prefill

The model processes the input context and constructs the model state needed for generation.

Long prompts make prefill expensive.
**Prefix/prompt caching reduces repeated prefill work.**
### Decode

The model then generates tokens autoregressively:

```text
token 1 → token 2 → token 3 → ...
```

Each generated token needs access to previous context.
**KV caching prevents the model from rebuilding the previous K/V state at every step.**
## Practical prompt layout

To maximize prefix-cache reuse, put the most stable content first:

```text
1. System/developer instructions
2. Tool definitions
3. Stable policies/context
4. Few-shot examples
5. Conversation history
6. Current user message
7. Volatile/request-specific metadata
```

Prefer:

```text
[stable 20k-token prefix]
...
Current time: 10:32
User request: ...
```

over:

```text
Current time: 10:32
[stable 20k-token prefix]
...
```

A volatile value near the beginning causes the request to diverge early and can greatly reduce cache reuse.
## Important caveats

### A cache miss is primarily a performance/cost problem

If prefix caching misses, the model normally processes the prefix again.

```text
cache hit  → reuse previous computation
cache miss → perform prefill again
```

The cache optimization itself is not supposed to alter how the model generates the answer.

### "One changed byte invalidates everything" is too simplistic

A better rule is:

> **Once the cacheable representation diverges, later state generally cannot reuse that previous prefix.**

Providers operate on rendered/tokenized model input and may also incorporate relevant request settings, tools, images, reasoning configuration, or provider-defined cache boundaries.

So changing whitespace, tool schemas, message structure, metadata, model settings, or content can affect reuse even when two prompts appear conceptually equivalent.

### KV-cache lifetime is implementation-dependent

A normal generation uses K/V state locally while decoding, but "KV cache = request-local forever" is not a fundamental property.

Cross-request prefix caching works precisely because inference systems can preserve or otherwise reuse model state beyond the immediate decode loop.

## Provider comparison

| |**OpenAI GPT-5.6+**|**Anthropic**|**DeepSeek**|
|---|---|---|---|
|**Enabled**|Automatically|Developer opts in with `cache_control`|Automatically|
|**Automatic prefix management**|Yes|Yes, after enabling automatic caching|Yes|
|**Explicit breakpoints**|Yes|Yes|Not the primary API model|
|**Read price**|0.1× input|Usually 0.1× input|Model-specific hit price|
|**Write price**|1.25× input|1.25× / 2× for 5m / 1h|Not exposed as a separate cache-write SKU|
|**TTL**|30m minimum for GPT-5.6+|5m default or 1h|Best-effort; typically hours–days before unused cache clears|
|**Minimum length**|1,024 visible tokens on GPT-5.6+|Model-dependent|Provider-managed persisted prefix units|
|**Usage telemetry**|cached + cache-write tokens|cache-read + cache-creation tokens|cache-hit + cache-miss tokens|
|**Core abstraction**|Managed KV-prefix cache|Explicit/automatic cache breakpoints|Automatic disk context cache|

The main takeaway is that **"prompt caching" is not one standardized API feature**.

All three providers are trying to avoid repeated prefill, but the product contracts are different:

```text
OpenAI:
automatic/explicit prefix cache
+ cache-write/read pricing
+ 30m sliding minimum lifetime

Anthropic:
developer enables caching
+ automatic or explicit breakpoints
+ selectable 5m / 1h TTL
+ write/read pricing

DeepSeek:
automatic disk context cache
+ provider-managed persisted prefix units
+ cache-hit / cache-miss pricing
```

So avoid writing generic infrastructure code that assumes one provider's cache semantics apply to another.

## Don't confuse this with response caching

**Response caching** is a different optimization.

```text
Prompt caching:
prompt
   ↓
reuse model state
   ↓
model still generates a new answer


Response caching:
prompt/query
   ↓
cache lookup
   ↓
return an existing answer
```

Semantic response caches may even reuse an answer for a merely **similar** request.

That introduces a different class of correctness risk:

- stale answers
- incorrect semantic matches
- user/context leakage
- bypassing fresh model inference

KV, prefix, and prompt caching reuse **computation**.
Response caching reuses the **answer itself**.

## One-line definitions

> **KV cache:** Don't recompute previous-token attention state while generating the next token.

> **Prefix caching:** Don't recompute the same prompt prefix when another request has already processed it.

> **Prompt caching:** Provider-managed prefix caching exposed through API controls, TTLs, telemetry, and pricing.

> **Response caching:** Don't run the model if an acceptable answer is already cached.