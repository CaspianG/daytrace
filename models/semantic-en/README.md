# Daytrace English semantic encoder

The English half of Daytrace's optional semantic bundle uses the Apache-2.0-licensed [`sentence-transformers/paraphrase-MiniLM-L3-v2`](https://huggingface.co/sentence-transformers/paraphrase-MiniLM-L3-v2) encoder. The pinned int8 Transformers.js export comes from [`Xenova/paraphrase-MiniLM-L3-v2`](https://huggingface.co/Xenova/paraphrase-MiniLM-L3-v2/tree/f2d931077e6527467d9ffc873f647d835e589e82).

Daytrace uses this model only for English visible-title metadata. It is downloaded only after explicit user selection, runs locally with one CPU thread, and is unloaded after the batch finishes.
