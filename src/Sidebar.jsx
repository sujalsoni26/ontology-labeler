import React from 'react';
import { supabase } from './supabase';
import { Home, History, User, ShieldAlert, BookOpen, Sun, Moon, LogOut } from 'lucide-react';

export default function Sidebar({ 
  user, 
  view, 
  setView, 
  theme, 
  toggleTheme, 
  sidebarOpen, 
  setSidebarOpen, 
  setShowGuidelines,
  setGuidelinesTheme 
}) {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { id: 'labeling', label: 'Home', icon: <Home size={18} /> },
    { id: 'history', label: 'My Labels', icon: <History size={18} /> },
    { id: 'profile', label: 'Profile', icon: <User size={18} /> },
  ];

  // Only show Admin for the admin user
  if (user?.email === 'ontologylabeling@gmail.com') {
    navItems.push({ id: 'admin', label: 'Admin', icon: <ShieldAlert size={18} /> });
  }

  return (
    <>
      {/* Sidebar Overlay */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`} 
        onClick={() => setSidebarOpen(false)}
      ></div>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'active' : ''}`}>
        <div className="sidebar-header">
          <h2>Menu</h2>
          <button className="btn-close-sidebar" onClick={() => setSidebarOpen(false)}>×</button>
        </div>
        
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button 
              key={item.id}
              className={`btn-sidebar-item ${view === item.id ? 'active' : ''}`} 
              onClick={() => { setView(item.id); setSidebarOpen(false); }}
            >
              {item.icon} <span>{item.label}</span>
            </button>
          ))}
          
          <button 
            className="btn-sidebar-item" 
            onClick={() => {
              setShowGuidelines(true);
              setGuidelinesTheme(theme === 'dark' ? 'dark' : 'light');
              setSidebarOpen(false);
            }}
          >
            <BookOpen size={18} /> <span>Guidelines</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="btn-secondary btn-icon-text theme-toggle-btn" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          <div className="user-info-sidebar">
            <div className="avatar-mini">
              {user.email ? user.email[0].toUpperCase() : 'U'}
            </div>
            <div className="user-details-mini">
              <span className="user-email-mini" title={user.email}>{user.email}</span>
              <button className="btn-logout-sidebar" onClick={handleLogout}>
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
