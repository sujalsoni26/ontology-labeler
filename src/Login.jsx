import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { UserPlus, Lock, BookOpen, Info, Sun, Moon } from 'lucide-react';
import PasswordInput from './PasswordInput';
const guidelinesPdfUrl = new URL('../updates/Dataset labelling guidelines.pdf', import.meta.url).href;
import guidelinesHtmlAsset from '../updates/Dataset labelling guidelines.html?raw';

export default function Login({ message, theme, toggleTheme }) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedGuidelines, setAcceptedGuidelines] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [guidelinesHtml, setGuidelinesHtml] = useState(null);
  const [guidelinesLoading, setGuidelinesLoading] = useState(false);
  const [guidelinesTheme, setGuidelinesTheme] = useState('dark');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

    setGuidelinesHtml(guidelinesHtmlAsset || null);
    const isDark = document.body.classList.contains('dark-mode');
    setGuidelinesTheme(isDark ? 'dark' : 'light');
    setGuidelinesLoading(false);
  }, [showGuidelines]);

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email first');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}${window.location.pathname}?type=recovery`,
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccess('Password reset link sent! Check your email.');
      setResetSent(true);
    }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError('Email required');
      setLoading(false);
      return;
    }

    let result;

    if (isSignup) {
      result = await supabase.auth.signUp({
        email: trimmedEmail,
        password
      });
      
      if (!result.error) {
        // If confirmation is enabled, result.data.user exists but session is null
        // If confirmation is disabled, result.data.session exists
        // If user already exists, Supabase might return a fake success 
        // depending on "Enable email provider" -> "Confirm email" settings.
        
        if (result.data?.user && result.data.user.identities?.length === 0) {
          setError('An account with this email already exists.');
          setLoading(false);
          return;
        }

        setSuccess('Check your email for the confirmation link!');
      }
    } else {
      result = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password
      });
    }

    if (result.error) {
      setError(result.error.message);
    }
    setLoading(false);
  };

  return (
    <div className={`login-container ${isSignup ? 'signup-mode' : 'signin-mode'}`}>
      <div className={`login-card ${isSignup ? 'signup-card' : ''}`}>
        <div className="login-top-controls">
          <button
            type="button"
            className="btn-ghost theme-toggle"
            onClick={toggleTheme}
            title="Toggle theme"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {theme === 'dark' ? (
              <>
                <Sun size={18} />
                <span>Light mode</span>
              </>
            ) : (
              <>
                <Moon size={18} />
                <span>Dark mode</span>
              </>
            )}
          </button>
        </div>
        <div className="login-header">
          <div className="auth-icon-circle">
            {isSignup ? <UserPlus size={32} /> : <Lock size={32} />}
          </div>
          <h2>{isSignup ? 'Create Account' : 'Welcome Back'}</h2>
          <p>{isSignup ? 'Join us to start labeling data' : 'Sign in to continue your work'}</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {message && (
            <div className="error-message">{message}</div>
          )}
          {error && (
            <div className="error-message">{error}</div>
          )}
          {success && (
            <div className="status-message" style={{ marginBottom: '15px', textAlign: 'center' }}>{success}</div>
          )}

          

          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              className="input-field"
              placeholder="Enter your email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          
          

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete={isSignup ? "new-password" : "current-password"}
            />
            {!isSignup && (
              <div className="forgot-password-link">
                <button 
                  type="button" 
                  className="text-btn" 
                  onClick={handleForgotPassword}
                  disabled={loading}
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>

          {isSignup && (
            <div className="guidelines-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowGuidelines(true)}
                title="Read the Dataset Labelling Guidelines"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <BookOpen size={18} />
                <span>View Guidelines</span>
              </button>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={acceptedGuidelines}
                  onChange={(e) => setAcceptedGuidelines(e.target.checked)}
                />
                I accept the Dataset Labelling Guidelines
              </label>
            </div>
          )}

          <div className="auth-actions">
            <button type="submit" className="btn-primary btn-full" disabled={loading || (isSignup && !acceptedGuidelines)}>
              {loading ? 'Processing...' : (isSignup ? 'Accept & Create Account' : 'Sign In')}
            </button>

            <div className="auth-toggle">
              <span>{isSignup ? 'Already have an account?' : "Don't have an account?"}</span>
              <button 
                type="button" 
                className="auth-toggle-btn"
                onClick={() => {
                  setIsSignup(!isSignup);
                  setError(null);
                  setSuccess(null);
                  setPassword(''); // Clear password for security/clarity
                  setAcceptedGuidelines(false);
                }}
              >
                {isSignup ? 'Sign In' : 'Sign Up'}
              </button>
            </div>
          </div>
        </form>
      </div>
      {showGuidelines && (
        <div className="modal-overlay" onClick={() => setShowGuidelines(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Dataset Labelling Guidelines</h3>
              <div className="modal-header-controls">
                <button
                  className="btn-ghost"
                  onClick={() => setGuidelinesTheme(guidelinesTheme === 'dark' ? 'light' : 'dark')}
                  title="Toggle reading background"
                >
                  {guidelinesTheme === 'dark' ? 'Light background' : 'Dark background'}
                </button>
                <button className="modal-close" onClick={() => setShowGuidelines(false)}>×</button>
              </div>
            </div>
            <div className="modal-body">
              {guidelinesLoading ? (
                <div className="guidelines-html">Loading…</div>
              ) : guidelinesHtml ? (
                <iframe
                  className="guidelines-frame"
                  srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>${
                    guidelinesTheme === 'dark'
                      ? 'body{background:#0f172a !important;color:#e5e7eb !important;} h1,h2,h3,h4,h5,h6{color:#f1f5f9 !important;} a{color:#93c5fd !important;} table,td,th{border-color:#334155 !important;}'
                      : 'body{background:#f8fafc !important;color:#1f2937 !important;} h1,h2,h3,h4,h5,h6{color:#111827 !important;} a{color:#2563eb !important;} table,td,th{border-color:#d1d5db !important;}'
                  }</style></head><body>${guidelinesHtml}</body></html>`}
                />
              ) : (
                <object
                  data={guidelinesPdfUrl}
                  type="application/pdf"
                  className="guidelines-viewer"
                >
                  <a href={guidelinesPdfUrl} target="_blank" rel="noreferrer">Open guidelines</a>
                </object>
              )}
            </div>
            <div className="modal-footer">
              <a href={guidelinesPdfUrl} target="_blank" rel="noreferrer" className="text-btn">Open in new tab</a>
              <button className="btn-primary" onClick={() => setShowGuidelines(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
