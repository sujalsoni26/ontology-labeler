import { useState } from 'react';
import { supabase } from './supabase';

export default function Login({ message }) {
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const username = e.target.username.value.trim();
    const password = e.target.password.value;

    if (!username) {
      setError('Username required');
      setLoading(false);
      return;
    }

    // 👇 Fake email derived from username
    const email = `${username}@local.auth`;

    let result;

    if (isSignup) {
      result = await supabase.auth.signUp({
        email,
        password
      });
    } else {
      result = await supabase.auth.signInWithPassword({
        email,
        password
      });
    }

    if (result.error) {
      setError(result.error.message);
    }
    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h2>Ontology Labeler</h2>
          <p>{isSignup ? 'Create an account to start labeling' : 'Sign in to your account'}</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {message && (
            <div className="error-message">{message}</div>
          )}
          {error && (
            <div className="error-message">{error}</div>
          )}

          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              className="input-field"
              placeholder="Enter your username"
              required
              autoComplete="username"
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input-field"
              placeholder="Enter your password"
              required
              autoComplete={isSignup ? "new-password" : "current-password"}
            />
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
