import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import Login from './Login';
import Properties from './Properties';
import ResetPassword from './ResetPassword';

const BYPASS_AUTH = false;
export default function App() {

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState(null);
  const [isVerificationCallback, setIsVerificationCallback] = useState(false);
  const [isRecoveryFlow, setIsRecoveryFlow] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const inactivityTimer = useRef(null);
  const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

  useEffect(() => {
    document.body.classList.remove('light-mode', 'dark-mode');
    document.body.classList.add(`${theme}-mode`);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    // Check if we are in a verification callback
    const hash = window.location.hash;
    const urlParams = new URLSearchParams(window.location.search);
    
    if (hash && (hash.includes('access_token=') || hash.includes('type=signup'))) {
      setIsVerificationCallback(true);
    }
    
    if (urlParams.get('type') === 'recovery' || hash.includes('type=recovery')) {
      setIsRecoveryFlow(true);
    }

    // Listen for verification success from other tabs
    const syncChannel = new BroadcastChannel('auth_sync');
    syncChannel.onmessage = (e) => {
      if (e.data === 'VERIFIED') {
        // Another tab handled the verification. 
        // We don't need to do much because onAuthStateChange will trigger,
        // but we can log it or set a specific state if needed.
        console.log('Verification detected in another tab');
      }
    };

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      
      // If we are the callback tab and just got a session, notify other tabs
      if (_event === 'SIGNED_IN' && isVerificationCallback) {
        const channel = new BroadcastChannel('auth_sync');
        channel.postMessage('VERIFIED');
        channel.close();
      }

      // If we were waiting for verification and just got a session, 
      // but we aren't the callback tab, clear any auth messages.
      if (_event === 'SIGNED_IN' && !isVerificationCallback) {
        setAuthMessage(null);
      }
    });

    return () => {
      subscription.unsubscribe();
      syncChannel.close();
    };
  }, [isVerificationCallback]);

  useEffect(() => {
    if (!user) {
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
        inactivityTimer.current = null;
      }
      return;
    }
    const resetTimer = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(async () => {
        await supabase.auth.signOut();
        setAuthMessage('Session expired due to inactivity. Please sign in again.');
      }, INACTIVITY_TIMEOUT_MS);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
        inactivityTimer.current = null;
      }
    };
  }, [user, INACTIVITY_TIMEOUT_MS]);

  if (BYPASS_AUTH) {
    return <Properties user={{ id: 'bypass', email: 'bypass@local' }} toggleTheme={toggleTheme} theme={theme} />;
  }
  if (loading) {
    return <p>Loading...</p>;
  }

  if (isVerificationCallback) {
    return (
      <div className="login-container">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div className="login-header">
            <h2>Email Verified!</h2>
            <p>Your account is now active.</p>
          </div>
          <div className="status-message" style={{ margin: '20px 0' }}>
            You can now close this tab and return to your original window.
          </div>
          <button 
            className="btn-primary btn-full" 
            onClick={() => {
              setIsVerificationCallback(false);
              window.location.hash = ''; // Clear the hash
            }}
          >
            Continue in this tab
          </button>
        </div>
      </div>
    );
  }

  if (isRecoveryFlow) {
    return (
      <ResetPassword 
        onComplete={() => {
          setIsRecoveryFlow(false);
          // Clear URL params
          window.history.replaceState({}, document.title, window.location.pathname);
        }} 
      />
    );
  }

  if (!user) {
    return <Login message={authMessage} />;
  }
  return <Properties user={user} toggleTheme={toggleTheme} theme={theme} />;
}




// import { useState } from 'react'
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
// import './App.css'

// function App() {
//   const [count, setCount] = useState(0)

//   return (
//     <>
//       <div>
//         <a href="https://vite.dev" target="_blank">
//           <img src={viteLogo} className="logo" alt="Vite logo" />
//         </a>
//         <a href="https://react.dev" target="_blank">
//           <img src={reactLogo} className="logo react" alt="React logo" />
//         </a>
//       </div>
//       <h1>Vite + React</h1>
//       <div className="card">
//         <button onClick={() => setCount((count) => count + 1)}>
//           count is {count}
//         </button>
//         <p>
//           Edit <code>src/App.jsx</code> and save to test HMR
//         </p>
//       </div>
//       <p className="read-the-docs">
//         Click on the Vite and React logos to learn more
//       </p>
//     </>
//   )
// }

// export default App
