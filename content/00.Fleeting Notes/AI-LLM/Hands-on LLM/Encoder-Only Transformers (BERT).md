#AI #LLM 

> [!abstract] Core Idea
> **BERT keeps the Transformer encoder and drops the decoder, so every token attends to every other token in both directions. It learns meaning, not generation.**
> 
> - No causal mask: token 3 sees tokens 1 to n, left and right.
> - Trained with Masked Language Modelling: predict `[MASK]` from both contexts.
> - The `[CLS]` embedding summarises the sentence for classification.
> - Generation needs the opposite choice, the causal mask: [[Decoder-Only Transformers (GPT)]].
## Introduction
> [!see]- BERT Deep Dive
> ![[BERT-from-First-Principles.pdf]]

The original Transformer uses an **encoder-decoder** architecture, which is ideal for sequence-to-sequence tasks such as **machine translation**.

However, many NLP tasks only require **understanding** text rather than generating it, such as:

- Text classification
- Sentiment analysis
- Semantic search
- Clustering

For these tasks, the **decoder is unnecessary**.

**BERT removes the decoder and keeps only the encoder**, making it more efficient for language understanding.
## Architecture

- BERT Base contains **12 encoder layers**.
- Each encoder consists of:
    - **Self-attention**
    - **Feed-forward neural network (FFN)**

![[1. An Introduction to LLM-1785045883093.webp]]

`[CLS]` Token : BERT adds a special token called `[CLS]` (classification Token) at the beginning of every input.

Example: `[CLS] I love machine learning.`

After the sentence passes through all encoder layers:
- The **`[CLS]` embedding** represents the **entire sentence**.
- It is commonly used for classification tasks.
## Masked Language Modelling (MLM)

BERT is trained using MLM.

**How it works**: Some words are randomly replaced with **`[MASK]`**, and the model predicts the missing word.
![[1. An Introduction to LLM-1785046725183.webp]]

Because the model can look at **both the left and right context**, it learns rich contextual representations.
## Bidirectional Understanding

Unlike autoregressive models (e.g., GPT), BERT reads the sentence **in both directions**.

> [!example]
> The cat sat on the mat.
> 
> To predict **sat**, BERT considers:
> - Left context: **The cat**
> - Right context: **on the mat**

This bidirectional approach helps BERT understand the meaning of words more accurately.
## Pretraining and Fine-Tuning

1. **Pretraining** - The model is trained on a very large text corpus (e.g., Wikipedia) using masked language modelling.
2. **Fine-Tuning** - The pretrained model is then adapted to a specific task using a much smaller labelled dataset.
![[1. An Introduction to LLM-1785047607024.webp]]

Pretrained BERT → Fine-tuned for:
- Spam detection
- Sentiment analysis
- News classification
## Embedding

One of BERT's biggest strengths is generating **contextual embeddings**.

These embeddings capture the meaning of words based on the sentence they appear in.
Unlike older methods such as [[1. An Introduction to LLM#Word2Vec|Word2Vec]], BERT generates **different embeddings** for "bank" in each sentence because it considers the surrounding context.

---

> [!video] BERT explained: Training, Inference,  BERT vs GPT/LLamA, Fine tuning
> ![BERT explained: Training, Inference,  BERT vs GPT/LLamA, Fine tuning, \[CLS\] token - YouTube](https://youtu.be/90mGPxR2GgY)