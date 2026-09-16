import React, { useState } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  Shield,
  CheckCircle,
  AlertCircle,
  Sparkles,
  LogOut,
  ArrowRight,
  KeyRound
} from 'lucide-react';
import {
  signInWithGoogle,
  signInWithEmail,
  registerWithEmail,
  signInAsGuest,
  logOut
} from '../../lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: FirebaseUser | null;
  onAuthSuccess?: (user: FirebaseUser) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onAuthSuccess
}) => {
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const user = await signInWithGoogle();
      if (onAuthSuccess) onAuthSuccess(user);
      onClose();
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      // If popup was blocked or cookies disabled, offer guest or email
      setErrorMessage(
        err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user'
          ? 'Sign-in window was closed or blocked. You can also sign in with email or continue as Guest.'
          : err.message || 'Failed to authenticate with Google.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGuestSignIn = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const user = await signInAsGuest();
      if (onAuthSuccess) onAuthSuccess(user);
      onClose();
    } catch (err: any) {
      console.error('Guest sign-in error:', err);
      setErrorMessage(err.message || 'Could not start guest session.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please provide both email and password.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      let user: FirebaseUser;
      if (authMode === 'register') {
        user = await registerWithEmail(email, password, displayName);
      } else {
        user = await signInWithEmail(email, password);
      }
      if (onAuthSuccess) onAuthSuccess(user);
      onClose();
    } catch (err: any) {
      console.error('Email auth error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setErrorMessage('Invalid email or password credentials.');
      } else if (err.code === 'auth/email-already-in-use') {
        setErrorMessage('This email is already registered. Please sign in instead.');
      } else if (err.code === 'auth/weak-password') {
        setErrorMessage('Password must be at least 6 characters.');
      } else {
        setErrorMessage(err.message || 'Authentication failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await logOut();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to sign out.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md rounded-3xl bg-[#0e1015] border border-white/10 p-6 sm:p-8 shadow-2xl text-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          title="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {currentUser ? (
          /* Profile & Sign Out View */
          <div className="space-y-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300 font-bold text-lg font-mono">
                {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : 'U'}
              </div>
              <div>
                <h3 className="text-lg font-bold font-mono text-white">
                  {currentUser.displayName || (currentUser.isAnonymous ? 'Guest Explorer' : 'Developer')}
                </h3>
                <p className="text-xs font-mono text-neutral-400 truncate max-w-[240px]">
                  {currentUser.email || (currentUser.isAnonymous ? 'Anonymous Private Session' : currentUser.uid)}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2 text-xs font-mono text-neutral-300">
              <div className="flex justify-between">
                <span className="text-neutral-500">Session Mode:</span>
                <span className="text-emerald-400 font-semibold">
                  {currentUser.isAnonymous ? 'Temporary Guest Sandbox' : 'Authenticated Engineer'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Telemetry Storage:</span>
                <span className="text-white">Firestore Cloud Isolation</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Security Rule:</span>
                <span className="text-amber-300">User Scoped (RBAC)</span>
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-mono text-xs font-bold transition-all"
              >
                Close
              </button>
              <button
                onClick={handleSignOut}
                disabled={loading}
                className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 font-mono text-xs font-bold transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        ) : (
          /* Sign In / Register View */
          <div className="space-y-6">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40 uppercase">
                  Firebase Authentication
                </span>
              </div>
              <h3 className="text-2xl font-black font-mono text-white mt-2 tracking-tight">
                {authMode === 'signin' ? 'Sign In to AgentPulse' : 'Create Developer Account'}
              </h3>
              <p className="text-xs text-neutral-400 font-sans mt-1">
                Maintain multi-agent traces, custom golden datasets, and isolated telemetry projects across browser sessions.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-mono flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Quick Auth Buttons: Google & Guest */}
            <div className="space-y-2.5">
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center space-x-3 py-3 rounded-xl bg-white hover:bg-neutral-100 text-neutral-900 font-mono text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              <button
                onClick={handleGuestSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/10 text-neutral-300 font-mono text-xs border border-white/10 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Instant Guest Sandbox (No Password Required)</span>
              </button>
            </div>

            <div className="flex items-center my-4">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="px-3 text-[10px] font-mono uppercase text-neutral-500">Or use email</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            {/* Email / Password Form */}
            <form onSubmit={handleEmailAuth} className="space-y-3 font-mono text-xs">
              {authMode === 'register' && (
                <div>
                  <label className="text-[11px] text-neutral-400 block mb-1">Developer Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Maya Lin"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white placeholder-neutral-600 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] text-neutral-400 block mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="engineer@company.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white placeholder-neutral-600 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-neutral-400 block mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white placeholder-neutral-600 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-mono text-xs font-bold transition-all disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : authMode === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div className="pt-2 text-center text-xs font-mono text-neutral-400">
              {authMode === 'signin' ? (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setErrorMessage(null);
                  }}
                  className="hover:text-amber-300 transition-colors"
                >
                  Need an account? <span className="underline font-bold text-white">Register here</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setErrorMessage(null);
                  }}
                  className="hover:text-amber-300 transition-colors"
                >
                  Already have an account? <span className="underline font-bold text-white">Sign in</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
