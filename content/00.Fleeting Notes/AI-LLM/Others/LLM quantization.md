#AI #LLM #MachineLearning

> [Quantization from the ground up \| ngrok blog](https://ngrok.com/blog/quantization)
> [A Visual Guide to Quantization - Maarten Grootendorst](https://www.maartengrootendorst.com/blog/quantization/)

> [!tldr]
> **Quantization** means storing an LLM's weights with **fewer bits** (e.g., 4-bit or 8-bit instead of 16-bit or 32-bit). Quantization make the model Smaller. Faster, and use less RAM/VRAM.
> But there are trade-off: You lose a small amount of accuracy in exchange for much lower resource usage.
## Introduction

**LLM quantization** is the process of reducing the precision of a model's numerical [[Model Weight|weights]] (and sometimes activations) (It is a form of **lossy compression**) to make the model **smaller, faster, and more memory-efficient during [[9. Inference Optimization|inference]]**, while trying to maintain nearly the same accuracy.

LLM contains billions of parametes.
For example: 
- 7 billion parametes x 32 bits (FP32) => 28GB
- This is too large for manu laptops, phones and edge devices.

|Precision|Bits per weight|Approx. size of a 7B model|
|---|--:|--:|
|FP32|32|28 GB|
|FP16|16|14 GB|
|INT8|8|7 GB|
|INT4|4|3.5 GB|
### Why fewer bits mean lower precision

- **FP32 (32 bits):** Billions of possible values → very precise.
- **INT8 (8 bits):** 256 possible values → less precise.
- **INT4 (4 bits):** 16 possible values → even less precise.

It's like measuring length with different rulers:

- FP32 = ruler with **millimeter** markings.
- INT8 = ruler with **centimeter** markings.
- INT4 = ruler with only a few large marks.
### Intuition

Floating-point weights: `0.143, -1.287, 2.934, 0.067`
instead of storing them with high precision, quantization approximates them:
`0.1, -1.3, 2.9, 0.1`.
These values are close enough that the model still performs well.
## How quantization works

Suppose a layer has weights between: `-2.0 to +2.0`

To represent them using 8 bits: There are `2^8 = 256` possible integer values.

A scale is computed: `scale = (max - min) / 255`

Each floating-point value is mapped to an integer:

```
float weight
      ↓
divide by scale
      ↓
round
      ↓
INT8 value
```

During inference, the value is approximately reconstructed: `float ≈ int × scale`

This approximation introduces only a small error.

> [[1. Artificial Neural Networks (ANNs)#Weight of Decisions]]
## Quantization Levels

FP16 -> 16 bits; High Accuracy, Larger memory, Common on GPUs.
INT8 -> 8 bits; Very small accuracy loss, Roughly 2x smaller that FP16

|Precision|Best use case|
|---|---|
|FP32|Training, highest numerical accuracy|
|FP16/BF16|GPU inference and training|
|INT8|Production inference with minimal quality loss|
|INT4|Running LLMs on limited hardware|
|INT2|Research and extreme compression|

---
![[Quantization from the ground up.pdf]]