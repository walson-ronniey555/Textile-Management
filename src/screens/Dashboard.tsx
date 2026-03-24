import React, { useEffect, useState } from 'react';
import { subscribeToOrders, subscribeToNotifications, syncAllData } from '../services/dataService';
import { Order, Notification, OrderStatus } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
  Package, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  TrendingUp,
  Plus,
  ChevronRight,
  Bell,
  RefreshCw
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toast } from 'sonner';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const unsubscribeOrders = subscribeToOrders(setOrders);
    let unsubscribeNotifications: () => void = () => {};
    
    if (profile) {
      unsubscribeNotifications = subscribeToNotifications([profile.role], setNotifications);
    }

    return () => {
      unsubscribeOrders();
      unsubscribeNotifications();
    };
  }, [profile]);

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    const toastId = toast.loading('Syncing all order data...');
    try {
      await syncAllData();
      toast.success('Data sync completed successfully', { id: toastId });
    } catch (error) {
      toast.error('Failed to sync data', { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  const stats = {
    total: orders.length,
    ready: orders.filter(o => o.status === 'ready').length,
    partial: orders.filter(o => o.status === 'partial').length,
    blocked: orders.filter(o => o.status === 'blocked').length,
    thisWeek: orders.filter(o => {
      // Simple week check (e.g., "W12")
      const currentWeek = `W${Math.ceil(new Date().getDate() / 7)}`; // Mock week for demo
      return o.exportWeek === currentWeek;
    }).length
  };

  const filteredOrders = filter === 'all' ? orders : orders.filter(o => o.status === filter);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Welcome back, {profile?.displayName || 'User'}.</p>
        </div>
        <div className="flex items-center gap-3">
          {profile && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className={cn(
                "flex items-center gap-2 bg-white text-gray-700 px-4 py-2.5 rounded-xl font-semibold border border-gray-200 hover:bg-gray-50 transition-all shadow-sm",
                isSyncing && "opacity-50 cursor-not-allowed"
              )}
              title="Recalculate all order percentages"
            >
              <RefreshCw size={20} className={cn(isSyncing && "animate-spin")} />
              <span className="hidden sm:inline">Sync Data</span>
            </button>
          )}
          <Link to="/notifications" className="relative p-2 bg-white rounded-xl shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors">
            <Bell size={24} className="text-gray-600" />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">
                {unreadCount}
              </span>
            )}
          </Link>
          {profile?.role === 'admin' && (
            <Link 
              to="/orders/new" 
              className="flex items-center gap-2 bg-[#1a2340] text-white px-4 py-2.5 rounded-xl font-semibold hover:bg-[#2a3a60] transition-colors shadow-sm"
            >
              <Plus size={20} />
              New Order
            </Link>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Orders', value: stats.total, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Ready', value: stats.ready, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Partial', value: stats.partial, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Blocked', value: stats.blocked, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Week Exports', value: stats.thisWeek, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((stat, i) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100"
          >
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", stat.bg)}>
              <stat.icon size={20} className={stat.color} />
            </div>
            <p className="text-sm font-medium text-gray-500">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters & List */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          {(['all', 'ready', 'partial', 'blocked'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap capitalize",
                filter === f 
                  ? "bg-[#1a2340] text-white shadow-md" 
                  : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-3xl border-2 border-dashed border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package size={32} className="text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">No orders yet</h3>
            <p className="text-gray-500 mb-6 max-w-xs mx-auto">Create your first order to start managing production readiness.</p>
            {profile?.role === 'admin' && (
              <Link 
                to="/orders/new" 
                className="inline-flex items-center gap-2 bg-[#1a2340] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#2a3a60] transition-all shadow-sm"
              >
                <Plus size={20} />
                Create First Order
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredOrders.map((order) => (
              <Link 
                key={order.id} 
                to={`/orders/${order.id}`}
                className={cn(
                  "group bg-white rounded-3xl shadow-sm border-l-8 p-6 hover:shadow-md transition-all",
                  order.status === 'ready' ? "border-green-500" : 
                  order.status === 'partial' ? "border-amber-500" : "border-red-500"
                )}
              >
                <div className="flex gap-4 mb-4">
                  {order.imageUrl && (
                    <div className="w-16 h-16 rounded-2xl overflow-hidden border border-gray-100 shrink-0">
                      <img src={order.imageUrl} alt={order.model} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-gray-900 group-hover:text-[#1a2340] transition-colors truncate">{order.model}</h3>
                    <p className="text-sm text-gray-500 font-medium truncate">{order.orderNumber} • {order.client}</p>
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider h-fit",
                    order.status === 'ready' ? "bg-green-100 text-green-700" : 
                    order.status === 'partial' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                  )}>
                    {order.status === 'ready' ? 'Ready (100%)' : 
                     order.status === 'partial' 
                       ? (order.arrivedPercent && order.arrivedPercent > 0
                           ? `Partial (Rec: ${order.receivedPercent || 0}% | Arr: ${order.arrivedPercent}%)`
                           : (order.plannedPercent && order.plannedPercent > 0 && (order.receivedPercent || 0) === 0
                               ? `Partial (Planned: ${order.plannedPercent}%)`
                               : `Partial (${order.receivedPercent || 0}%)`))
                       : `Blocked (${order.receivedPercent || 0}%)`}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-50 p-3 rounded-2xl">
                    <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Export Week</p>
                    <p className="text-sm font-bold text-gray-700">{order.exportWeek}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-2xl">
                    <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Quantity</p>
                    <p className="text-sm font-bold text-gray-700">{order.quantity.toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm font-bold text-[#1a2340]">
                  <span>View Details</span>
                  <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
