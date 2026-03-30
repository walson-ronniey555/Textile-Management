import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  Truck, 
  Calendar, 
  Bell, 
  Settings, 
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const Sidebar: React.FC = () => {
  const { profile, signOut } = useAuth();
  const [isOpen, setIsOpen] = React.useState(false);
  const navigate = useNavigate();

  if (!profile) return null;

  const role = profile.role;

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/', roles: ['admin', 'boss', 'factory', 'supplier'] },
    { label: 'Orders', icon: Package, path: '/orders', roles: ['admin', 'factory'] },
    { label: 'Import Bundles', icon: Truck, path: '/bundles', roles: ['admin', 'supplier'] },
    { label: 'Export Plan', icon: Calendar, path: '/export-plan', roles: ['admin', 'boss'] },
    { label: 'Notifications', icon: Bell, path: '/notifications', roles: ['admin', 'boss', 'factory', 'supplier'] },
    { label: 'Settings', icon: Settings, path: '/settings', roles: ['admin'] },
  ];

  const filteredItems = navItems.filter(item => item.roles.includes(role));

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile Toggle */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-slate-900 text-white rounded-xl shadow-lg"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white transition-transform duration-300 ease-in-out lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-8 border-b border-white/5">
            <h1 className="text-2xl font-bold tracking-tight text-white">NORYOTEX</h1>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-[0.2em] font-bold">{role}</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-8 space-y-1 overflow-y-auto">
            {filteredItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200 group",
                  isActive 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                {({ isActive }) => (
                  <>
                    <item.icon size={20} className={cn(
                      "transition-colors",
                      isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                    )} />
                    <span className="font-semibold text-sm">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* User Profile & Sign Out */}
          <div className="p-6 border-t border-white/5 bg-slate-950/30">
            <div className="flex items-center gap-3 px-2 py-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center text-sm font-bold text-white shadow-inner">
                {profile.displayName?.[0] || profile.email[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate text-white">{profile.displayName || 'User'}</p>
                <p className="text-[10px] text-slate-500 truncate font-medium">{profile.email}</p>
              </div>
            </div>
            <button 
              onClick={handleSignOut}
              className="flex items-center gap-3 w-full px-4 py-3 text-slate-400 hover:bg-red-500/10 hover:text-red-400 rounded-2xl transition-all duration-200 font-semibold text-sm"
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}
    </>
  );
};

export default Sidebar;
