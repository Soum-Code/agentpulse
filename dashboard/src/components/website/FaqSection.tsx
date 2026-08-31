import React, { useState } from 'react';
import { ChevronDown, HelpCircle, Shield, Cpu, Lock, Zap } from 'lucide-react';

interface FaqItem {
  question: string;
  answer: string;
  category: string;
}

const FAQS: FaqItem[] = [
  {
    category: 'Architecture',
    question: 'How does AgentPulse evaluate continuous grounding on CPU without needing a GPU cluster?',
    answer: 'AgentPulse uses a 2-stage cascaded architecture. Stage 1 executes an optimized ONNX all-MiniLM-L6-v2 vector cosine gate that fast-accepts ~75% of grounded spans in ~27.8ms on commodity CPU cores. Only ambiguous spans trigger Stage 2 (DeBERTa-v3-small cross-encoder NLI, ~88ms). This achieves state-of-the-art hallucination detection without requiring expensive GPU reservations or slow 3rd-party LLM judge APIs.',
  },
  {
    category: 'Performance',
    question: 'What is the runtime overhead added to production agent workflows?',
    answer: 'The Python SDK ingest path adds <0.005ms overhead. Spans are placed in a lock-free asynchronous memory buffer and flushed in background batches to the FastAPI ingestion endpoint. The HTTP ingest process immediately writes to a durable WAL queue table and returns 200 OK without running inference, ensuring your agent response time is never delayed.',
  },
  {
    category: 'Security',
    question: 'Can AgentPulse run in an air-gapped environment?',
    // "Yes, 100%" to a HIPAA/SOC2 question reads as a compliance assurance. No
    // audit has been performed and no certification exists, so the answer now
    // states the architectural fact and leaves the compliance judgement to
    // whoever is actually accountable for it.
    answer: 'Yes. All evaluation models, database tables, and worker processes run locally on your own infrastructure — no tokens, prompts, or tool payloads are transmitted to third-party servers, and the evaluation path makes no outbound calls. AgentPulse also supports SHA-256 content hashing modes where only embeddings are stored. Note that AgentPulse holds no compliance certification of its own: whether a deployment meets HIPAA, SOC 2 or similar depends on your environment and controls, not on this software.',
  },
  {
    category: 'Multi-Agent',
    question: 'How does AgentPulse detect compounding errors across multi-agent DAGs?',
    answer: 'In multi-agent architectures (such as LangGraph or CrewAI), a small false assumption in an upstream planner can cause downstream execution agents to spiral into severe hallucinations. AgentPulse scopes evaluations to the trace DAG, tracking inter-agent contract handoffs and flagging the exact upstream span that triggered the divergence.',
  },
  {
    category: 'Drift & ASI',
    question: 'What is the Agent Stability Index (ASI) and how is it calculated?',
    answer: 'ASI is a composite stability metric scaled from 0 to 100. It tracks the cosine distance between an agent\'s recent output embeddings and its running exponential moving average centroid, combined with tool call signature variance and step failure rates. A sudden drop in ASI signals behavioral degradation or prompt drift.',
  },
  {
    category: 'Reliability',
    question: 'What happens if a worker process crashes during an evaluation?',
    answer: 'AgentPulse uses a durable queue with leased worker contracts. When a worker claims a job, it holds a time-limited lease in SQLite. If the worker process is killed abruptly (e.g. SIGKILL or node preemption), the lease expires automatically and another worker claims the job. Idempotent result persistence guarantees zero duplicated evaluations.',
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="w-full space-y-8">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-xs font-mono text-indigo-400">
          <HelpCircle className="w-4 h-4" />
          <span>Frequently Asked Questions</span>
        </div>
        <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Technical architecture & engineering FAQ.
        </h3>
        <p className="text-xs sm:text-sm text-neutral-400 max-w-xl">
          Everything you need to know about integrating, deploying, and scaling AgentPulse across your agent swarms.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FAQS.map((faq, idx) => {
          const isOpen = openIndex === idx;

          return (
            <div
              key={idx}
              className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                isOpen
                  ? 'bg-surface-2 border-indigo-500/30 shadow-lg'
                  : 'bg-surface border-line hover:border-line-strong'
              }`}
              onClick={() => setOpenIndex(isOpen ? null : idx)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-4xs font-mono px-2 py-0.5 rounded-md bg-surface-3 text-neutral-400 uppercase">
                    {faq.category}
                  </span>
                  <h4 className="text-sm font-bold text-white font-sans mt-1">
                    {faq.question}
                  </h4>
                </div>
                <div
                  className={`w-6 h-6 rounded-full bg-surface-3 flex items-center justify-center text-neutral-400 shrink-0 transition-transform ${
                    isOpen ? 'rotate-180 text-indigo-400' : ''
                  }`}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>

              {isOpen && (
                <div className="mt-3 pt-3 border-t border-line text-xs text-neutral-300 font-sans leading-relaxed animate-in fade-in duration-150">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
