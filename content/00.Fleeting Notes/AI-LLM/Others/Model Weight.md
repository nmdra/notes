#AI #LLM #MachineLearning

> [[1. Artificial Neural Networks (ANNs)#Perceptron Architecture]]

> [!tldr]
> Weights represent **what the model has learned during training**. They are numerical values that determine **how strongly one piece of information influences another**.
## Introduction

Model weights are the learned numerical parameters inside a neural network. They encode everything the model has learned during training: grammar, facts, reasoning patterns, coding ability, and more.

> Think of weights as the model's "memory" (though not memory in the human sense).

- **Weights** are a type of **parameter**.
- **Parameters** include **weights and biases** (and, in some architectures, a few other learned values).

A neural Network is made up of layers. Each connection between neurons has weight.
### What do the weights represent?

Weights capture patterns learned from data, such as:

- Language grammar
- Word relationships
- Programming syntax
- Mathematical patterns
- Facts seen during training
- Translation rules
- Reasoning behaviors

> For example, 
> after training, the model may have learned associations that make "Paris" more strongly connected to "France" than to "Brazil". This isn't stored as a database entry—it's reflected in many interacting weights.
## Example

Neuron : `Output = (Input x Weight) + Bias`
Inputs = 3, Weight = 2, Bias = 1

Then, Output = (3 x 2) + 1 = 7

The **weight** determines how strongly the input influences the output.
### In an LLM

Suppose the model sees the sentence: `"The cat sat on the ___"`
During training, the model learns that words like: `mat, chair, floor` are more likely than: `airplane, banana, galaxy`.

It doesn't store these rules explicitly. Instead, **billions of weights** adjust so that the neural network produces high probabilities for likely next words.
## How are Weights learned ?

Initially, weights are random: `0.23, -1.17, 0.91, ...`; [[Backpropagation]] gradually adjusts them during training.

The model makes predictions, compares them to the correct answers, computes an error (loss), and then updates the weights using optimization algorithms like gradient descent.
## Weights vs. Biases

A neuron typically computes: `Output = (Inputs × Weights) + Bias`

- **Weights** determine how important each input is.
- **Bias** shifts the output, allowing the neuron to fit patterns more flexibly.
## Weight vs Embeddings

Embeddings convert text into numbers that the neural network can understand. [[Prompt caching - 10x cheaper LLM tokens, but how.pdf#page=7]]

Weights are the numbers that tell the neural network **how to process** those embeddings.

|Embeddings|Weights|
|---|---|
|Represent tokens (words/subwords) as vectors|Parameters that define how the model transforms data|
|Input representation|Computation parameters|
|One specific type of parameter|Includes embeddings **and** all neural network parameters|

---
[[LLM quantization]]