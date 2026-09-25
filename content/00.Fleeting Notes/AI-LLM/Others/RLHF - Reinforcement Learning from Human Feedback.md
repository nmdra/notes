#AI #LLM #MachineLearning 

> [Reinforcement Learning from Human Feedback](https://arxiv.org/html/2504.12501v11)
> [Illustrating Reinforcement Learning from Human Feedback (RLHF)](https://huggingface.co/blog/rlhf)

> [!abstract]-
> **Reinforcement Learning from Human Feedback (RLHF)** is a [[LLM Post Training|post-training technique]] used to align Large Language Models (LLMs) with complex, hard-to-specify human values (such as helpfulness, honesty, harmlessness, warmth, and formatting).
> 
> Instead of relying purely on cross-entropy next-token prediction loss, RLHF uses **human preferences** to train a **Reward Model**, which then guides an RL algorithm (typically **PPO**) to update the language model while penalizing excessive deviation from its baseline using **KL Divergence**.
## 1. Why RLHF? The Fundamental Problem

Pretrained Language Models (LLMs) are trained on massive internet text using a simple objective: ==predict the next token== (cross-entropy loss). 

While this creates models with immense knowledge, a raw base model doesn't inherently know how to be a helpful assistant. If you ask a base model:
> *"The president of the United States in 2006 was"*

It might continue with internet metadata or list of random trivia instead of a concise, helpful answer:
> *"...George W. Bush, the governor of Florida in 2006 was Jeb Bush, and John McCain was an Arizona senator... September 1 – U.S. President Bush signs an executive order..."*

Traditional automatic evaluation metrics like **BLEU** or **ROUGE** compare generated tokens to reference texts using rigid n-gram matching rules. They cannot measure subjective attributes like **creativity**, **truthfulness**, **empathy**, or **safety**. Writing a mathematical loss function directly for human values is intractable.

> [!important] The Core Idea of RLHF
> **Can we optimize complex AI behaviors using simple human preference signals as a guide?**  
> RLHF solves hard-to-specify alignment problems by using human feedback to train a reward function, and then optimizing the language model against that reward.
## 2. Core Concepts & Analogies for Beginners

To understand how RLHF works without getting lost in math, consider these foundational analogies:
### Analogy 1: The F1 Race Car (Elicitation Theory)

* **The Base Model = F1 Engine & Chassis**: Base models contain almost all the raw intelligence, knowledge, and capabilities learned during pretraining on billions of pages of text.
* **Post-Training / RLHF = Aerodynamics & Race Tuning**: F1 teams spend the season refining aerodynamics and suspension around a static engine to dramatically boost lap times. Similarly, RLHF doesn't teach the model new world knowledge from scratch—it **elicits** and reshapes the latent knowledge inside the base model into an engaging, structured, and helpful format.

```
       +---------------------------------------------+
       |           Base Model (Pretrained)           |
       |  Raw Knowledge, Unformatted Next-Token Pred. |
       +---------------------------------------------+
                              |
                              v  (Post-Training / RLHF)
       +---------------------------------------------+
       |            Instruct / Chat Model            |
       |    Helpful, Harmless, High-Empathy Style    |
       +---------------------------------------------+
```

### Analogy 2: Teaching vs. Grading (Contrastive Loss)

* **Supervised Learning (SFT)** is like showing a student exact textbook answers: *"Predict the exact next word."*
* **RLHF** is like grading essay submissions: The model generates multiple candidate answers, and a reviewer indicates which answer is *better*. This contrastive learning teaches the model **what makes a response superior** and **what bad patterns to avoid**.
### Analogy 3: Thermostat & CartPole (Classic RL vs. RLHF)

* In classic RL (like a thermostat adjusting temperature or CartPole balancing a pole), the environment provides a fixed numerical reward (e.g., $+1$ for balancing, $0$ for falling).
* In LLM RLHF, the "environment" does not provide a native score. We must **build a neural network (Reward Model)** to act as the judge.
## 3. The Canonical 3-Step RLHF Pipeline

Popularized by OpenAI's *InstructGPT* (2022), the canonical RLHF workflow consists of three main sequential stages:

![[rlhf-basic.webp|Canonical RLHF 3-Step Recipe]]
*Figure 1: The canonical 3-step RLHF recipe (InstructGPT / Anthropic / DeepMind).*
### Step 1: Pretraining & Instruction Fine-Tuning (SFT / IFT)

Before RLHF begins, we need a base model that can understand prompt-response structures.

1. **Pretraining**: Train a base transformer model on large web text via next-token prediction.
2. **Supervised Fine-Tuning (SFT)**: Fine-tune the base model on ~10k–100k curated question-answering examples to teach it the **assistant persona**.

![[pretraining.webp|SFT Pretraining]]
*Figure 2: Step 1 - Pretraining a base model and fine-tuning on instruction prompts.*

#### Chat Templates & Token Formatting
To format multi-turn conversations into flat token sequences that the model understands, frameworks use **Chat Templates** (e.g., ChatML format):

```text
<|im_start|>system
You are a helpful and harmless assistant.<|im_end|>
<|im_start|>user
How can I improve my sleep quality?<|im_end|>
<|im_start|>assistant
```

> [!tip] Role of SFT
> SFT teaches the model **the shape and structure** of how to answer (formatting), while RLHF will refine **the quality, style, and safety** of the answers.

### Step 2: Preference Data Collection & Reward Model (RM) Training

The goal of Step 2 is to create a **Reward Model (RM)**—a neural network that takes a prompt $x$ and completion $y$, and outputs a scalar score $r_\theta(x, y)$ representing human preferability.

![[reward-model.webp|Reward Model Training]]
*Figure 3: Step 2 - Gathering human comparisons and training a scalar Reward Model.*
#### Why Ranking instead of Direct Scalar Ratings?
If human annotators give absolute scores (e.g., $1$ to $10$) to text completions, scores become noisy and uncalibrated because different humans have different baseline expectations.

Instead, annotators evaluate model completions in **head-to-head pairwise matchups** (Option A vs. Option B):
1. Sample a prompt $x$ from a dataset.
2. Generate two (or more) model completions: $y_w$ (preferred / winning) and $y_l$ (dispreferred / losing).
3. Train the Reward Model using a **Bradley-Terry preference loss**:

$$L_{\text{RM}}(\theta) = -\mathbb{E}_{(x, y_w, y_l)} \left[ \log \sigma \left( r_\theta(x, y_w) - r_\theta(x, y_l) \right) \right]$$

where $\sigma$ is the sigmoid function. This maximizes the reward gap between the winning and losing completions.
### Step 3: Fine-Tuning with Reinforcement Learning (PPO)

With an instruction-tuned model (Policy $\pi$) and a trained Reward Model ($r_\theta$), we use Reinforcement Learning to optimize the model parameters.

![[rlhf.webp|RLHF PPO Training]]
*Figure 4: Step 3 - Fine-tuning the language model policy with PPO and a KL divergence penalty.*
#### Formulating LLM Generation as an RL Problem:
* **Policy ($\pi_\phi$)**: The language model being fine-tuned.
* **State / Observation ($x$)**: The input prompt sequence.
* **Action ($y$)**: The sequence of output tokens generated by the model.
* **Action Space**: The entire vocabulary of the tokenizer (~50,000+ tokens).
* **Reward ($r$)**: Combined scalar reward from the Reward Model minus a **KL divergence penalty**.
#### The KL Divergence Penalty ($r_{\text{KL}}$)
If we only optimize for maximum reward from the RM, the policy will exploit flaws in the Reward Model—generating repetitive, sycophantic, or gibberish text that gets a high score (a phenomenon called **Reward Hacking** or **Over-Optimization**).

To prevent this, a penalty term measures how far the active policy $\pi_\phi$ has drifted from the initial reference policy $\pi_{\text{SFT}}$ using **Kullback-Leibler (KL) Divergence**:

$$r = r_\theta(x, y) - \beta \mathcal{D}_{\text{KL}}\left(\pi_\phi(y \mid x) \;||\; \pi_{\text{SFT}}(y \mid x)\right)$$

Where:
* $r_\theta(x, y)$ is the scalar score from the Reward Model.
* $\beta$ is a hyperparameter controlling constraint strength.
* $\mathcal{D}_{\text{KL}}$ penalizes large token probability shifts from the baseline model.

> [!warning] Reward Hacking
> Without the KL penalty, the model learns to "trick" the reward model by spamming keywords or ballooning output lengths (**Length Bias**).
## 4. Key Differences: Standard RL vs. Language Model RLHF

| Aspect | Standard RL (e.g., Robotics / CartPole) | RLHF (Language Models) |
| :--- | :--- | :--- |
| **Initial Policy** | Learned from scratch (random initialization) | Fine-tuned from a pretrained LLM prior |
| **Reward Signal** | Environmental rule function $r(s, a)$ | Learned Reward Model $r_\theta(x, y)$ from human preference data |
| **State Transitions** | Multi-step environment physics $p(s_{t+1}\mid s, a)$ | Single-turn prompt $x$ sampled from dataset (no environment transition) |
| **Action** | Single discrete or continuous action $a_t$ | Complete text sequence $y = (y_1, y_2, \dots, y_T)$ |
| **Reward Granularity** | Step-by-step per action | Response-level (bandit-style, scalar per completion) |
| **Discounting** | $\gamma < 1$ (balances short vs long-term reward) | $\gamma = 1$ (no discounting over generated tokens) |
## 5. Evolution of Post-Training Recipes

Post-training has evolved significantly beyond the initial 3-step InstructGPT workflow.

![[rlhf_timeline.webp|RLHF Timeline]]
*Figure 5: Historical timeline of preference learning and RLHF development (2008–2026).*

### 1. Direct Alignment (DPO - Direct Preference Optimization)
Introduced in 2023, **DPO** mathematically re-formulates the RLHF objective to optimize the policy $\pi_\theta$ directly on pairwise preference data $(x, y_w, y_l)$ **without needing an explicit intermediate Reward Model or PPO loop**:

$$L_{\text{DPO}}(\theta) = -\mathbb{E}_{(x, y_w, y_l)} \left[ \log \sigma \left( \beta \log \frac{\pi_\theta(y_w \mid x)}{\pi_{\text{ref}}(y_w \mid x)} - \beta \log \frac{\pi_\theta(y_l \mid x)}{\pi_{\text{ref}}(y_l \mid x)} \right) \right]$$
### 2. Multi-Stage Open Recipes (e.g., Tülu 3)
Modern state-of-the-art open models like **Tülu 3** use multi-stage pipelines incorporating synthetic data, preference tuning, and targeted RL:

![[tulu3.webp|Tülu 3 Recipe]]
*Figure 6: The multi-stage post-training pipeline of Tülu 3 (SFT -> On-Policy DPO -> RLVR).*

1. **SFT on ~1M examples**: Massive synthetic & human instruction mixture.
2. **On-Policy Preference Tuning**: DPO/PPO on ~1M preference pairs to boost chat quality.
3. **RLVR (Reinforcement Learning with Verifiable Rewards)**: Targeted RL on math/code prompts with verifiable ground-truth rewards.
### 3. Reasoning & RLVR Era (e.g., DeepSeek R1 & OpenAI o1)
With models like **DeepSeek R1**, post-training incorporates **verifiable rewards** (unit tests, math checkers) and cold-start reasoning chains. Compute is shifted heavily into post-training RL, enabling models to generate long internal [[Chain of Thought (CoT)|Chains of Thought (CoT)]] before answering.

---

> [!video] Reinforcement Learning from Human Feedback explained with math derivations and the PyTorch code.
> ![Reinforcement Learning from Human Feedback explained with math derivations and the PyTorch code. - YouTube](https://youtu.be/qGyFrqc34yc)