import React, { useEffect, useState } from 'react';
import { subscribeToNotifications, markNotificationAsRead } from '../services/dataService';
import { Notification } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
  Bell, 
  CheckCircle2, 
  AlertCircle, 
  Truck, 
  Calendar,
  Filter,
  Check
} from 'lucide-react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const Notifications: React.FC = () => {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    if (!profile) return;
    const unsubscribe = subscribeToNotifications([profile.role], setNotifications);
    return () => unsubscribe();
  }, [profile]);

  const filteredNotifications = filter === 'all' 
    ? notifications 
    : notifications.filter(n => !n.isRead);

  const handleMarkAsRead = async (id: string) => {
    await markNotificationAsRead(id);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'import_arrived': return <Truck className="text-blue-500" size={20} />;
      case 'production_blocked': return <AlertCircle className="text-red-500" size={20} />;
      case 'order_ready': return <CheckCircle2 className="text-green-500" size={20} />;
      case 'export_due': return <Calendar className="text-purple-500" size={20} />;
      default: return <Bell className="text-gray-500" size={20} />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-500">Stay updated with production and import alerts.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-semibold transition-all",
              filter === 'all' ? "bg-[#1a2340] text-white shadow-md" : "bg-white text-gray-600 border border-gray-200"
            )}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-semibold transition-all",
              filter === 'unread' ? "bg-[#1a2340] text-white shadow-md" : "bg-white text-gray-600 border border-gray-200"
            )}
          >
            Unread
          </button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-4">
        {filteredNotifications.length === 0 ? (
          <div className="bg-white rounded-3xl border-2 border-dashed border-gray-200 p-12 text-center">
            <Bell size={32} className="text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No notifications found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notification, i) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "bg-white p-6 rounded-2xl shadow-sm border-l-4 transition-all flex items-start gap-4",
                  notification.isRead ? "border-transparent opacity-60" : "border-blue-500 shadow-md"
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                  {getIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-4">
                    <p className={cn(
                      "text-sm font-bold text-gray-900",
                      !notification.isRead && "text-[#1a2340]"
                    )}>
                      {notification.message}
                    </p>
                    <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap">
                      {notification.createdAt.toDate().toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-0.5 rounded">
                      {notification.type.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                {!notification.isRead && (
                  <button 
                    onClick={() => handleMarkAsRead(notification.id)}
                    className="p-2 hover:bg-blue-50 text-blue-500 rounded-full transition-colors"
                    title="Mark as read"
                  >
                    <Check size={20} />
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
