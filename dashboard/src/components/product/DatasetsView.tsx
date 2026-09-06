import React, { useState } from 'react';
import { Database, Plus, Search, Tag, Calendar, ArrowRight, FileText } from 'lucide-react';
import { Dataset } from '../../types';

interface DatasetsViewProps {
  datasets: Dataset[];
  onNavigateToExperiments: () => void;
}

export const DatasetsView: React.FC<DatasetsViewProps> = ({
  datasets,
  onNavigateToExperiments
}) => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const selectedDataset = datasets.find(d => d.id === selectedDatasetId) ?? datasets[0];

  return (
    <div className="space-y-6 pb-28">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-mono font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
            <Database className="w-5 h-5 text-neutral-400" />
            <span>Golden Regression Benchmark Datasets</span>
          </h2>
          <p className="text-xs font-mono text-neutral-400 mt-1">
            Curated ground-truth test cases extracted from production traces for offline evaluations
          </p>
        </div>

        <button
          onClick={onNavigateToExperiments}
          className="px-4 py-2 bg-neutral-100 hover:bg-white text-neutral-950 text-xs font-mono font-semibold rounded-lg flex items-center space-x-2 transition-colors shrink-0"
        >
          <span>Run Evaluation on Dataset</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 space-y-3 font-mono text-xs">
          {datasets.map((dataset) => {
            const isSelected = selectedDataset.id === dataset.id;

            return (
              <div
                key={dataset.id}
                onClick={() => setSelectedDatasetId(dataset.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2 ${
                  isSelected
                    ? 'bg-neutral-850 border-neutral-500 shadow-md'
                    : 'surface-solid text-neutral-300 hover:bg-neutral-850 surface-hover'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-white font-bold">{dataset.name}</span>
                  <span className="text-neutral-400 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                    {dataset.itemCount} items
                  </span>
                </div>

                <p className="text-neutral-400 text-[11px] leading-relaxed">
                  {dataset.description}
                </p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(dataset.tags ?? []).map(t => (
                    <span key={t} className="text-[10px] text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {selectedDataset && (
          <div className="lg:col-span-7 surface-solid rounded-xl border border-neutral-800 overflow-hidden font-mono text-xs">
            <div className="glass-floating px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase text-neutral-400 tracking-wider block">
                  DATASET ITEMS & GROUND TRUTHS
                </span>
                <h3 className="text-sm font-semibold text-white mt-0.5">
                  {selectedDataset.name}
                </h3>
              </div>
              <span className="text-xs text-neutral-400">
                Updated {selectedDataset.updatedAt}
              </span>
            </div>

            <div className="p-6 space-y-4 bg-[#121316]">
              {selectedDataset.items.map((item, idx) => (
                <div key={item.id} className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 pb-1 border-b border-neutral-850">
                    <span>ITEM #{idx + 1} ({item.id})</span>
                    <span>Curated from Trace: {item.originTraceId}</span>
                  </div>

                  <div>
                    <span className="text-neutral-500 text-[10px] uppercase block">Input Prompt / Query:</span>
                    <p className="text-neutral-200 text-xs mt-0.5">{item.input}</p>
                  </div>

                  {item.expectedOutput && (
                    <div>
                      <span className="text-neutral-500 text-[10px] uppercase block">Expected Ground-Truth Behavior:</span>
                      <p className="text-emerald-300 text-xs mt-0.5 font-mono">{item.expectedOutput}</p>
                    </div>
                  )}

                  {item.notes && (
                    <div className="text-[11px] text-neutral-400 pt-1">
                      <span className="text-neutral-500">Curation Note: </span>
                      <span>{item.notes}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
