import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  Truck, 
  Calendar, 
  Bell, 
  Settings, 
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const Sidebar: React.FC = () => {
  const { profile } = useAuth();
  const [isOpen, setIsOpen] = React.useState(false);

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

  return (
    <>
      {/* Mobile Toggle */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-[#1a2340] text-white rounded-md"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-[#1a2340] text-white transition-transform duration-300 ease-in-out lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-white/10">
            <h1 className="text-2xl font-bold tracking-tight">NORYOTEX</h1>
            <p className="text-xs text-white/50 mt-1 uppercase tracking-widest">{role}</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {filteredItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-colors",
                  isActive 
                    ? "bg-white/10 text-white" 
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                )}
              >
                <item.icon size={20} />
                <span className="font-medium">{item.label}</span>
              </NavLink>
            ))}
          </nav>
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
