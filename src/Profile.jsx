import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { LogOut, ShieldCheck, KeyRound, AlertCircle, CheckCircle2, User, Phone, Edit2, Save, X } from 'lucide-react';
import PasswordInput from './PasswordInput';

export default function Profile({ user, stats, properties }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
  const [phone, setPhone] = useState(user?.user_metadata?.phone_number || '');
  const [profileMessage, setProfileMessage] = useState({ text: '', type: '' });
  const [dbTotalLabels, setDbTotalLabels] = useState(0);

  useEffect(() => {
    if (user?.user_metadata) {
      setFullName(user.user_metadata.full_name || '');
      setPhone(user.user_metadata.phone_number || '');
    }
    fetchProfileStats();
  }, [user]);

  const fetchProfileStats = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('total_labels')
        .eq('id', user.id)
        .single();
      
      if (!error && data) {
        setDbTotalLabels(data.total_labels || 0);
      }
    } catch (err) {
      console.error("Error fetching profile labels:", err);
    }
  };

  // Use the database count for "Total Labels"
  const totalLabels = dbTotalLabels;
  const totalSentences = Object.values(stats).reduce((acc, curr) => acc + curr.total, 0);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setProfileMessage({ text: 'Full Name is required', type: 'error' });
      return;
    }

    setLoading(true);
    setProfileMessage({ text: '', type: '' });

    // 1. Update Auth Metadata
    const { error: authError } = await supabase.auth.updateUser({
      data: {
        full_name: fullName.trim(),
        phone_number: phone.trim()
      }
    });

    if (authError) {
      setProfileMessage({ text: authError.message, type: 'error' });
      setLoading(false);
      return;
    }

    // 2. Sync to public.profiles table
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          full_name: fullName.trim(),
          phone_number: phone.trim(),
          total_labels: totalLabels, // Sync current label count
          updated_at: new Date().toISOString()
        });

      if (profileError) {
        console.error("Error syncing profile:", profileError);
      }
    } catch (err) {
      console.error("Profile sync error:", err);
    }

    setProfileMessage({ text: 'Profile updated successfully!', type: 'success' });
    setIsEditingProfile(false);
    // Automatically clear success message after 3 seconds
    setTimeout(() => setProfileMessage({ text: '', type: '' }), 3000);
    setLoading(false);
  };

  const cancelEditing = () => {
    setFullName(user?.user_metadata?.full_name || '');
    setPhone(user?.user_metadata?.phone_number || '');
    setIsEditingProfile(false);
    setProfileMessage({ text: '', type: '' });
  };
  
  // Calculate completion percentage based on total labels vs total sentences
  const overallProgress = totalSentences > 0 ? Math.round((totalLabels / totalSentences) * 100) : 0;
  
  // Properties started (labeled > 0)
  const propertiesStarted = Object.values(stats).filter(s => s.labeled > 0).length;
  
  // Properties completed (labeled >= total)
  const propertiesCompleted = Object.values(stats).filter(s => s.labeled >= s.total && s.total > 0).length;

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
      <header className="header" style={{ paddingLeft: '20px' }}>
        <div className="header-content">
          <h1>User Profile</h1>
        </div>
      </header>

      <main className="main-content">
        <div className="card profile-card">
           <div className="profile-header">
             <div className="avatar-placeholder">
                {fullName ? fullName[0].toUpperCase() : (user.email ? user.email[0].toUpperCase() : 'U')}
             </div>
             <h2>{fullName || user.email || 'User'}</h2>
             <p className="user-email-subtitle">{user.email}</p>
           </div>

           <div className="security-section-enhanced" style={{ borderTop: 'none', marginTop: '0', paddingTop: '0' }}>
             <div className="security-header">
               <User size={20} className="security-icon" />
               <h3>Personal Information</h3>
               {!isEditingProfile && (
                 <button 
                   onClick={() => setIsEditingProfile(true)} 
                   className="text-btn edit-profile-btn"
                   style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}
                 >
                   <Edit2 size={14} />
                   <span>Edit</span>
                 </button>
               )}
             </div>

             {isEditingProfile ? (
               <form onSubmit={handleUpdateProfile} className="password-form-grid">
                 <div className="password-inputs">
                   <div className="input-group">
                     <label htmlFor="edit-fullname">Full Name</label>
                     <div className="password-input-wrapper">
                       <input
                         id="edit-fullname"
                         type="text"
                         className="input-field"
                         value={fullName}
                         onChange={(e) => setFullName(e.target.value)}
                         placeholder="Enter full name"
                         required
                         style={{ paddingLeft: '40px' }}
                       />
                       <User size={18} style={{ position: 'absolute', left: '12px', opacity: 0.6 }} />
                     </div>
                   </div>
                   <div className="input-group">
                     <label htmlFor="edit-phone">Phone Number (Optional)</label>
                     <div className="password-input-wrapper">
                       <div className="phone-input-container" style={{ position: 'relative', width: '100%' }}>
                         <span className="phone-prefix" style={{ 
                           position: 'absolute', 
                           left: '40px', 
                           top: '50%', 
                           transform: 'translateY(-50%)',
                           fontSize: '0.9rem',
                           opacity: 0.8,
                           fontWeight: '500',
                           pointerEvents: 'none'
                         }}>+91</span>
                         <input
                           id="edit-phone"
                           type="tel"
                           className="input-field"
                           value={phone}
                           onChange={(e) => setPhone(e.target.value)}
                           placeholder="Enter phone number"
                           style={{ paddingLeft: '75px' }}
                         />
                         <Phone size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }} />
                       </div>
                     </div>
                   </div>
                 </div>

                 {profileMessage.text && (
                   <div className={`message-banner ${profileMessage.type === 'error' ? 'error' : 'success'}`}>
                     {profileMessage.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                     <span>{profileMessage.text}</span>
                   </div>
                 )}

                 <div style={{ display: 'flex', gap: '10px' }}>
                   <button 
                     type="submit" 
                     className="btn-primary" 
                     style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                     disabled={loading}
                   >
                     <Save size={18} />
                     <span>{loading ? 'Saving...' : 'Save Changes'}</span>
                   </button>
                   <button 
                     type="button" 
                     onClick={cancelEditing} 
                     className="btn-secondary"
                     style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                   >
                     <X size={18} />
                     <span>Cancel</span>
                   </button>
                 </div>
               </form>
             ) : (
               <div className="profile-details-display">
                 <div className="detail-row">
                   <div className="detail-label">
                     <User size={16} />
                     <span>Full Name</span>
                   </div>
                   <div className="detail-value">{fullName || <span className="placeholder-text">Not provided</span>}</div>
                 </div>
                 <div className="detail-row">
                   <div className="detail-label">
                     <Phone size={16} />
                     <span>Phone</span>
                   </div>
                   <div className="detail-value">{phone ? `+91 ${phone}` : <span className="placeholder-text">Not provided</span>}</div>
                 </div>
                 {profileMessage.text && profileMessage.type === 'success' && (
                   <div className="message-banner success" style={{ marginTop: '10px' }}>
                     <CheckCircle2 size={16} />
                     <span>{profileMessage.text}</span>
                   </div>
                 )}
               </div>
             )}
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

           <div className="security-section-enhanced">
             <div className="security-header">
               <KeyRound size={20} className="security-icon" />
               <h3>Change Password</h3>
             </div>

             <form onSubmit={handleChangePassword} className="password-form-grid">
               <div className="password-inputs">
                 <div className="input-group">
                   <label htmlFor="new-password">New Password</label>
                   <PasswordInput
                     id="new-password"
                     value={newPassword}
                     onChange={(e) => setNewPassword(e.target.value)}
                     placeholder="Enter new password"
                     autoComplete="new-password"
                   />
                 </div>
                 <div className="input-group">
                   <label htmlFor="confirm-password">Confirm Password</label>
                   <PasswordInput
                     id="confirm-password"
                     value={confirmPassword}
                     onChange={(e) => setConfirmPassword(e.target.value)}
                     placeholder="Confirm new password"
                     autoComplete="new-password"
                   />
                 </div>
               </div>
               
               {message.text && (
                 <div className={`message-banner ${message.type === 'error' ? 'error' : 'success'}`}>
                   {message.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                   <span>{message.text}</span>
                 </div>
               )}

               <button 
                 type="submit" 
                 className="btn-primary btn-update-password"
                 disabled={loading}
               >
                 <KeyRound size={18} />
                 <span>{loading ? 'Updating...' : 'Update Password'}</span>
               </button>
             </form>
           </div>

           <div className="profile-actions">
             <button className="btn-danger btn-logout-large" onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
               <LogOut size={20} />
               <span>Logout</span>
             </button>
           </div>
        </div>
      </main>
    </div>
  );
}
