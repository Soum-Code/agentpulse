# AgentPulse Empirical Benchmark Report

**Evaluation Date:** 2026-08-18 16:16:01 UTC  
**Hardware Environment:** Windows 11 (AMD64 / 16 CPU cores)  
**Python Runtime:** 3.13.7

---

## 1. Throughput Measurements (Uncombined Categories)

| Metric | Measured Value | Measurement Definition |
| :--- | :--- | :--- |
| **SDK Enqueue Capacity** | **5,396,828.8 spans / sec** | In-memory deque append capacity under synthetic benchmark loop. |
| **HTTP Ingestion Throughput** | *Async HTTP Batch Transport* | Non-blocking background worker batching spans over HTTP. |
| **Database Persistence** | *SQLite WAL Persistence* | Single-node atomic transaction flush with WAL journaling. |

---

## 2. Latency Percentiles Breakdown

| Component | P50 (ms) | P95 (ms) | P99 (ms) | Hardware / Model Specs | Execution Mode |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **SDK Wrapper Overhead** | **0.005** | **0.009** | **0.012** | LangGraph Node Wrapper / Deque Append | In-Process Synch |
| **MiniLM Embedding Inference** | **15.13** | **18.50** | **20.18** | `all-MiniLM-L6-v2` (Seq: ~128 tokens) | Local CPU PyTorch |
| **DeBERTa NLI Inference** | **88.51** | **140.48** | **186.52** | `nli-deberta-v3-small` (Seq: ~256 tokens) | Local CPU PyTorch |
| **Full Evaluator Cascade** | **122.33** | **172.17** | **192.68** | Two-stage Grounding + Tool + Disagreement | Background Task |

---

## 3. Threshold Analysis on Development Dataset

| Evaluator Threshold | Precision | Recall | F1-Score | False Positive Rate | False Negative Rate |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **0.70** | 1.0 | 0.5 | 0.667 | 0.0 | 0.5 |
| **0.75** | 1.0 | 0.5 | 0.667 | 0.0 | 0.5 |
| **0.80** | 1.0 | 0.5 | 0.667 | 0.0 | 0.5 |
| **0.85 (Selected)** | **1.0** | **0.5** | **0.667** | **0.0** | **0.5** |
| **0.90** | 1.0 | 0.5 | 0.667 | 0.0 | 0.5 |

*Selected Prototype Threshold:* `0.85` is the selected prototype threshold under the development benchmark.
