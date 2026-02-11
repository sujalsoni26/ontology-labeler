import { useState } from 'react';
import { supabase } from './supabase';

export default function Login({ message }) {
  const [isSignup, setIsSignup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

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
        <div className="login-header">
          <div className="auth-icon-circle">
            {isSignup ? '📝' : '🔐'}
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
            <div className="password-input-wrapper">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                className="input-field"
                placeholder="Enter your password"
                required
                autoComplete={isSignup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button 
                type="button" 
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
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

          <div className="auth-actions">
            <button type="submit" className="btn-primary btn-full" disabled={loading}>
              {loading ? 'Processing...' : (isSignup ? 'Create Account' : 'Sign In')}
            </button>

            <div className="auth-toggle">
              {isSignup ? 'Already have an account?' : "Don't have an account?"}
              <button type="button" onClick={() => {
                setIsSignup(!isSignup);
                setError(null);
                setPassword(''); // Clear password for security/clarity
                setShowPassword(false); // Reset visibility
              }}>
                {isSignup ? 'Sign In' : 'Sign Up'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
