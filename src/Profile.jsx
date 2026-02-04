import { useState } from 'react';
import { supabase } from './supabase';

export default function Profile({ user, stats, properties, onBack }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Calculate aggregate stats
  const totalLabels = Object.values(stats).reduce((acc, curr) => acc + curr.labeled, 0);
  const totalSentences = Object.values(stats).reduce((acc, curr) => acc + curr.total, 0);
  
  // Calculate completion percentage based on total sentences vs total labels
  // Note: This assumes one label per sentence.
  const overallProgress = totalSentences > 0 ? Math.round((totalLabels / totalSentences) * 100) : 0;
  
  const propertiesStarted = Object.values(stats).filter(s => s.labeled > 0).length;
  const propertiesCompleted = Object.values(stats).filter(s => s.labeled === s.total && s.total > 0).length;

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      setMessage({ text: 'Please fill in all fields', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ text: 'Passwords do not match', type: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ text: 'Password must be at least 6 characters', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setMessage({ text: error.message, type: 'error' });
    } else {
      setMessage({ text: 'Password updated successfully!', type: 'success' });
      setNewPassword('');
      setConfirmPassword('');
    }
    setLoading(false);
  };

  return (
    <div className="container">
      <header className="header">
        <div className="header-content">
          <button className="btn-secondary btn-icon-text" onClick={onBack}>
             ← Back
          </button>
          <h1>User Profile</h1>
          <div style={{ width: '80px' }}></div> {/* Spacer for alignment */}
        </div>
      </header>

      <main className="main-content">
        <div className="card profile-card">
           <div className="profile-header">
             <div className="avatar-placeholder">
                {user.email ? user.email[0].toUpperCase() : 'U'}
             </div>
             <h2>{user.email || 'User'}</h2>
           </div>

           <div className="stats-grid">
             <div className="stat-item">
               <span className="stat-value">{totalLabels}</span>
               <span className="stat-label">Total Labels</span>
             </div>
             <div className="stat-item">
               <span className="stat-value">{overallProgress}%</span>
               <span className="stat-label">Overall Progress</span>
             </div>
             <div className="stat-item">
               <span className="stat-value">{propertiesStarted}</span>
               <span className="stat-label">Properties Started</span>
             </div>
             <div className="stat-item">
                <span className="stat-value">{propertiesCompleted}</span>
                <span className="stat-label">Properties Completed</span>
             </div>
           </div>

           <div className="security-section" style={{ marginTop: '30px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
             <h3>Change Password</h3>
             <form onSubmit={handleChangePassword} style={{ maxWidth: '400px', margin: '0 auto' }}>
               <div className="input-group">
                 <label htmlFor="new-password">New Password</label>
                 <input
                   id="new-password"
                   type="password"
                   className="input-field"
                   value={newPassword}
                   onChange={(e) => setNewPassword(e.target.value)}
                   placeholder="Enter new password"
                 />
               </div>
               <div className="input-group">
                 <label htmlFor="confirm-password">Confirm Password</label>
                 <input
                   id="confirm-password"
                   type="password"
                   className="input-field"
                   value={confirmPassword}
                   onChange={(e) => setConfirmPassword(e.target.value)}
                   placeholder="Confirm new password"
                 />
               </div>
               
               {message.text && (
                 <div className={`message ${message.type === 'error' ? 'error-message' : 'success-message'}`} style={{ marginBottom: '15px' }}>
                   {message.text}
                 </div>
               )}

               <button 
                 type="submit" 
                 className="btn-primary btn-full"
                 disabled={loading}
               >
                 {loading ? 'Updating...' : 'Update Password'}
               </button>
             </form>
           </div>

           <div className="profile-actions">
             <button className="btn-danger btn-logout-large" onClick={handleLogout}>
               Logout
             </button>
           </div>
        </div>
      </main>
    </div>
  );
}
