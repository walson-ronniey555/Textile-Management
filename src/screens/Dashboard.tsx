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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-slate-500 mt-1 font-medium">Welcome back, <span className="text-slate-900">{profile?.displayName || 'User'}</span>.</p>
        </div>
        <div className="flex items-center gap-3">
          {profile && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className={cn(
                "btn-secondary flex items-center gap-2",
                isSyncing && "opacity-50 cursor-not-allowed"
              )}
              title="Recalculate all order data"
            >
              <RefreshCw size={18} className={cn(isSyncing && "animate-spin")} />
              <span className="hidden sm:inline">Sync Data</span>
            </button>
          )}
          <Link to="/notifications" className="relative p-3 bg-white rounded-2xl shadow-sm border border-slate-100 hover:bg-slate-50 transition-all active:scale-95">
            <Bell size={22} className="text-slate-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white shadow-sm">
                {unreadCount}
              </span>
            )}
          </Link>
          {profile?.role === 'admin' && (
            <Link 
              to="/orders/new" 
              className="btn-primary flex items-center gap-2"
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
          { label: 'Total Orders', value: stats.total, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50/50' },
          { label: 'Ready', value: stats.ready, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50/50' },
          { label: 'Partial', value: stats.partial, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50/50' },
          { label: 'Blocked', value: stats.blocked, icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50/50' },
          { label: 'Week Exports', value: stats.thisWeek, icon: TrendingUp, color: 'text-violet-600', bg: 'bg-violet-50/50' },
        ].map((stat, i) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="card-calm p-5"
          >
            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-inner", stat.bg)}>
              <stat.icon size={22} className={stat.color} />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
            <p className="text-3xl font-bold text-slate-900 tracking-tight">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters & List */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          {(['all', 'ready', 'partial', 'blocked'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn( f === filter ? "btn-primary px-6 py-2" : "btn-secondary px-6 py-2", "capitalize"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-[2rem] border-2 border-dashed border-slate-100 p-16 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Package size={40} className="text-slate-300" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">No orders yet</h3>
            <p className="text-slate-500 mb-8 max-w-xs mx-auto font-medium">Create your first order to start managing production readiness.</p>
            {profile?.role === 'admin' && (
              <Link 
                to="/orders/new" 
                className="btn-primary inline-flex items-center gap-2"
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
                  "group card-calm p-6 border-l-[6px]",
                  order.status === 'ready' ? "border-emerald-500" : 
                  order.status === 'partial' ? "border-amber-500" : "border-rose-500"
                )}
              >
                <div className="flex gap-5 mb-6">
                  {order.imageUrl && (
                    <div className="w-20 h-20 rounded-2xl overflow-hidden border border-slate-100 shrink-0 shadow-sm">
                      <img src={order.imageUrl} alt={order.model} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-xl font-bold text-slate-900 group-hover:text-slate-700 transition-colors truncate tracking-tight">{order.model}</h3>
                    </div>
                    <p className="text-sm text-slate-500 font-bold truncate tracking-tight mb-2">{order.orderNumber} • {order.client}</p>
                    <span className={cn(
                      "px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest h-fit inline-block",
                      order.status === 'ready' ? "bg-emerald-100 text-emerald-700" : 
                      order.status === 'partial' ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
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
                </div>
                
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100/50">
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Export Week</p>
                    <p className="text-sm font-bold text-slate-700">{order.exportWeek}</p>
                  </div>
                  <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100/50">
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Quantity</p>
                    <p className="text-sm font-bold text-slate-700">{order.quantity.toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm font-bold text-slate-900 pt-4 border-t border-slate-50">
                  <span className="group-hover:translate-x-1 transition-transform inline-flex items-center gap-2">
                    View Details
                    <ChevronRight size={18} />
                  </span>
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
