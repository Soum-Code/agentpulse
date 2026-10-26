import React, { useState } from 'react';
import { useEscapeKey } from '../../utils/useEscapeKey';
import {
  X,
  Plus,
  Folder,
  Check,
  Key,
  Copy,
  CheckCheck,
  Trash2,
  Terminal,
  Shield,
  Layers,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { TelemetryProject } from '../../types';
import type { Feed } from '../../lib/stateModel';
import { createTelemetryProject, deleteTelemetryProject } from '../../lib/firebase';
import { ingestionKeyView } from '../../lib/ingestionKey';
import { User as FirebaseUser } from 'firebase/auth';

interface ProjectSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: FirebaseUser | null;
  projects: TelemetryProject[];
  /** How the Firestore project list is doing: pending until the first snapshot, error if it was refused. */
  projectsFeed?: Feed;
  activeProject: TelemetryProject | null;
  onSelectProject: (project: TelemetryProject) => void;
  onOpenAuth: () => void;
}

export const ProjectSelectorModal: React.FC<ProjectSelectorModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  projects,
  projectsFeed,
  activeProject,
  onSelectProject,
  onOpenAuth
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [environment, setEnvironment] = useState<'production' | 'staging' | 'development'>('production');
  const [loading, setLoading] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  // The last create/delete failure, shown in the modal (a failed delete means the key could not be revoked).
  const [error, setError] = useState<string | null>(null);

  // Escape closes the dialog (it had no keyboard way out)
  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    if (!projectName.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const newProj = await createTelemetryProject(currentUser.uid, {
        name: projectName.trim(),
        description: projectDescription.trim(),
        environment
      });
      onSelectProject(newProj);
      setIsCreating(false);
      setProjectName('');
      setProjectDescription('');
    } catch (err) {
      console.error('Failed to create project in Firestore:', err);
      setError(err instanceof Error ? err.message : 'Could not create the project.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this telemetry project?')) return;
    try {
      await deleteTelemetryProject(projectId);
    } catch (err) {
      console.error('Failed to delete project:', err);
      setError(err instanceof Error ? `Project not deleted: ${err.message}` : 'Project not deleted.');
    }
  };

  const copyApiKey = (key: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Show "Copied!" only once the browser has really taken the text. The key is shown once and not
    // stored, so a button that says Copied after a refused write would lose the only copy.
    navigator.clipboard.writeText(key).then(
      () => {
        setError(null);
        setCopiedKeyId(id);
        setTimeout(() => setCopiedKeyId(null), 2000);
      },
      () => setError('The browser refused to copy the key. Select it and copy it by hand, then close this window.'),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div role="dialog" aria-modal="true" aria-label="Telemetry projects" className="relative w-full max-w-2xl rounded-3xl bg-[#0e1015] border border-white/10 p-6 sm:p-8 shadow-2xl text-white max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-white/10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-mono text-white">Agent Telemetry Projects</h3>
              <p className="text-xs font-mono text-neutral-400">
                {currentUser
                  ? `Firestore database storage for ${currentUser.displayName || currentUser.email || 'developer'}`
                  : 'Sign in to create persistent agent telemetry projects'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="py-6 flex-1 overflow-y-auto space-y-6 scrollbar-none">
          {error && (
            <div role="alert" className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs font-mono text-rose-200">
              {error}
            </div>
          )}
          {!currentUser ? (
            /* Unauthenticated Prompt */
            <div className="p-6 rounded-2xl bg-amber-400/10 border border-amber-400/30 text-center space-y-4">
              <Shield className="w-8 h-8 text-amber-300 mx-auto" />
              <div>
                <h4 className="text-base font-mono font-bold text-white">Authentication Required</h4>
                <p className="text-xs text-neutral-300 font-sans mt-1 max-w-md mx-auto">
                  Sign in with Google, email, or start an instant guest sandbox to create dedicated Firestore projects and maintain telemetry across devices.
                </p>
              </div>
              <button
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-mono text-xs font-bold transition-all shadow-md"
              >
                Sign In or Register
              </button>
            </div>
          ) : isCreating ? (
            /* Create Project Form */
            <form onSubmit={handleCreateProject} className="space-y-4 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300 uppercase">New Telemetry Project</span>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-neutral-400 hover:text-white text-xs"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="text-[11px] text-neutral-400 block mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Customer Support Swarm, Code Reviewer AI"
                  className="w-full p-2.5 rounded-xl bg-black/60 border border-white/10 text-white placeholder-neutral-600 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-[11px] text-neutral-400 block mb-1">Environment</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['production', 'staging', 'development'] as const).map((env) => (
                    <button
                      key={env}
                      type="button"
                      onClick={() => setEnvironment(env)}
                      className={`py-2 rounded-xl text-center capitalize transition-all border ${
                        environment === env
                          ? 'bg-amber-400/20 text-amber-300 border-amber-400 font-bold'
                          : 'bg-white/[0.03] text-neutral-400 border-white/10 hover:bg-white/[0.06]'
                      }`}
                    >
                      {env}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] text-neutral-400 block mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="Agent group, model architectures, and evaluation criteria..."
                  className="w-full p-2.5 rounded-xl bg-black/60 border border-white/10 text-white placeholder-neutral-600 focus:outline-none focus:border-amber-400 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-xl bg-white/10 text-white hover:bg-white/15 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || !projectName.trim()}
                  className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold transition-all disabled:opacity-50"
                >
                  {loading ? 'Creating in Firestore...' : 'Create Project'}
                </button>
              </div>
            </form>
          ) : (
            /* Project List */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-neutral-400 uppercase">
                  Your Projects ({projects.length})
                </span>
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/30 font-mono text-xs font-semibold transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Project</span>
                </button>
              </div>

              {projects.length === 0 ? (
                <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center space-y-3">
                  <Folder className="w-8 h-8 text-neutral-500 mx-auto" />
                  <p className="text-xs font-mono text-neutral-400">
                    {projectsFeed?.status === 'error'
                      ? `The project list could not be read from Firestore: ${projectsFeed.message ?? 'no details'}`
                      : projectsFeed?.status === 'pending'
                      ? 'Loading your projects...'
                      : 'No custom projects yet. Create one to generate your scoped ingestion API key.'}
                  </p>
                  <button
                    onClick={() => setIsCreating(true)}
                    className="px-4 py-2 rounded-xl bg-amber-400 text-neutral-950 font-mono text-xs font-bold"
                  >
                    Create First Project
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {projects.map((proj) => {
                    const isActive = activeProject?.id === proj.id;
                    return (
                      <div
                        key={proj.id}
                        onClick={() => onSelectProject(proj)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer relative group ${
                          isActive
                            ? 'bg-amber-400/10 border-amber-400/60 shadow-lg'
                            : 'bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.05] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono font-bold text-xs ${
                                isActive
                                  ? 'bg-amber-400 text-neutral-950 shadow-sm'
                                  : 'bg-white/10 text-white'
                              }`}
                            >
                              {proj.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <h4 className="text-sm font-mono font-bold text-white group-hover:text-amber-300 transition-colors">
                                  {proj.name}
                                </h4>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                                    proj.environment === 'production'
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                      : proj.environment === 'staging'
                                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                      : 'bg-neutral-700 text-neutral-300'
                                  }`}
                                >
                                  {proj.environment}
                                </span>
                                {isActive && (
                                  <span className="flex items-center text-[10px] font-mono text-amber-300 font-bold">
                                    <Check className="w-3 h-3 mr-1" /> Active
                                  </span>
                                )}
                              </div>
                              {proj.description && (
                                <p className="text-xs text-neutral-400 font-sans mt-0.5">
                                  {proj.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={(e) => handleDelete(proj.id, e)}
                            className="text-neutral-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete project"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Scoped API Key Bar. The full key exists only in the session that created the
                            project (the API shows it once, nothing stores it); otherwise only the
                            non-secret prefix is shown and there is nothing to copy. */}
                        {(() => {
                          const keyView = ingestionKeyView(proj);
                          return (
                            <div className="mt-3 pt-3 border-t border-white/[0.08] flex items-center justify-between font-mono text-xs">
                              <div className="flex items-center space-x-2 text-neutral-400 truncate max-w-[70%]">
                                <Key className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                                <span
                                  className="text-[11px] truncate text-neutral-300"
                                  title={keyView.reason ?? undefined}
                                >
                                  {keyView.key ?? keyView.masked ?? '—'}
                                </span>
                              </div>
                              {keyView.key ? (
                                <button
                                  onClick={(e) => copyApiKey(keyView.key as string, proj.id, e)}
                                  className="flex items-center space-x-1 text-[10px] font-mono text-neutral-400 hover:text-white px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                                >
                                  {copiedKeyId === proj.id ? (
                                    <>
                                      <CheckCheck className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-400">Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Copy Key</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span className="text-[10px] text-neutral-500">shown once</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-neutral-400">
          <span>Project list: Firestore, one list per signed-in user</span>
          {/* Shown only after a snapshot really arrived (it used to be a fixed green label) */}
          {!currentUser ? (
            <span className="text-neutral-500">Sign in to sync</span>
          ) : projectsFeed?.status === 'ready' ? (
            <span className="text-emerald-400">Cloud Sync Active</span>
          ) : projectsFeed?.status === 'error' ? (
            <span className="text-rose-400">Cloud sync failed</span>
          ) : (
            <span className="text-amber-300">Connecting...</span>
          )}
        </div>
      </div>
    </div>
  );
};
