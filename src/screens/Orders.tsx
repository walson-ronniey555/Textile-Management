import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { subscribeToOrders, toggleOrderArchive } from '../services/dataService';
import { Order, OrderStatus } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
  Package, 
  Plus, 
  Search,
  Filter,
  ChevronRight,
  MoreVertical,
  Archive,
  RotateCcw
} from 'lucide-react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const Orders: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'active' | 'archive'>('active');

  useEffect(() => {
    const unsubscribe = subscribeToOrders(setOrders);
    return () => unsubscribe();
  }, []);

  const customers = Array.from(new Set(orders.map(o => o.client))).sort();

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.client.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesCustomer = customerFilter === 'all' || order.client === customerFilter;
    
    // Archive logic: manual flag
    const isArchived = order.isArchived === true;
    const matchesViewMode = viewMode === 'active' ? !isArchived : isArchived;

    return matchesSearch && matchesStatus && matchesCustomer && matchesViewMode;
  });

  const handleToggleArchive = async (e: React.MouseEvent, orderId: string, currentStatus: boolean) => {
    e.stopPropagation();
    if (window.confirm(currentStatus ? 'Unarchive this order?' : 'Archive this order?')) {
      await toggleOrderArchive(orderId, !currentStatus);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Orders</h1>
          <p className="text-slate-500 mt-1 font-medium">Manage and track production orders.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
            <button
              onClick={() => {
                setViewMode('active');
                setStatusFilter('all');
              }}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-bold transition-all duration-200",
                viewMode === 'active' ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Active
            </button>
            <button
              onClick={() => {
                setViewMode('archive');
                setStatusFilter('all');
              }}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-bold transition-all duration-200",
                viewMode === 'archive' ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Archive
            </button>
          </div>
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

      {/* Search & Filters */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Search by model, order number, or client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-calm pl-12"
            />
          </div>
          <div className="relative min-w-[240px]">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="input-calm pl-12 appearance-none font-bold text-slate-700"
            >
              <option value="all">All Customers</option>
              {customers.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="flex items-center gap-3 overflow-x-auto pb-2 no-scrollbar">
          <div className="p-2 bg-slate-100 rounded-xl text-slate-500 shrink-0">
            <Filter size={18} />
          </div>
          {viewMode === 'active' ? (
            (['all', 'partial', 'blocked'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn(
                  "px-6 py-2 rounded-2xl text-sm font-bold transition-all duration-200 whitespace-nowrap capitalize",
                  statusFilter === f 
                    ? "bg-slate-900 text-white shadow-md" 
                    : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
                )}
              >
                {f}
              </button>
            ))
          ) : (
            <button
              className="px-6 py-2 rounded-2xl text-sm font-bold bg-slate-900 text-white shadow-md whitespace-nowrap capitalize"
            >
              Ready (Received)
            </button>
          )}
        </div>
      </div>

      {/* Orders Table/Grid */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-[2rem] border-2 border-dashed border-slate-100 p-16 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Package size={40} className="text-slate-300" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mb-2">No orders found</h3>
          <p className="text-slate-500 mb-8 max-w-xs mx-auto font-medium">Try adjusting your search or filters, or create a new order.</p>
          {profile?.role === 'admin' && (
            <Link 
              to="/orders/new" 
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus size={20} />
              Create New Order
            </Link>
          )}
        </div>
      ) : (
        <div className="card-calm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order Info</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantity</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Export</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredOrders.map((order, i) => (
                  <motion.tr 
                    key={order.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="hover:bg-slate-50/50 transition-all duration-200 group cursor-pointer"
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-5">
                        {order.imageUrl ? (
                          <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-100 shrink-0 shadow-sm">
                            <img src={order.imageUrl} alt={order.model} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 shrink-0 shadow-inner">
                            <Package size={24} className="text-slate-300" />
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 text-lg tracking-tight">{order.model}</span>
                          <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{order.orderNumber} • {order.reference}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-bold text-slate-600">{order.client}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-black text-slate-900">{order.quantity.toLocaleString()}</span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-slate-700">{order.exportWeek}</span>
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{order.exportDate}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-2">
                        <span className={cn(
                          "px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest w-fit",
                          order.status === 'ready' ? "bg-emerald-100 text-emerald-700" : 
                          order.status === 'partial' ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                        )}>
                          {order.status === 'ready' ? 'Ready (100%)' : 
                           order.status === 'partial' 
                             ? (order.arrivedPercent && order.arrivedPercent > 0
                                 ? `Partial (Rec: ${order.receivedPercent || 0}% | Arr: ${order.arrivedPercent}%)`
                                 : `Partial (${order.receivedPercent || 0}%)`)
                             : `Blocked (${order.receivedPercent || 0}%)`}
                        </span>
                        {order.status === 'partial' && (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                <div 
                                  className="h-full bg-emerald-500 transition-all duration-500" 
                                  style={{ width: `${order.receivedPercent || 0}%` }}
                                />
                              </div>
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{order.receivedPercent || 0}% Rec</span>
                            </div>
                            {(order.arrivedPercent || 0) > 0 && (
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                  <div 
                                    className="h-full bg-amber-400 transition-all duration-500" 
                                    style={{ width: `${order.arrivedPercent || 0}%` }}
                                  />
                                </div>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{order.arrivedPercent || 0}% Arr</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center justify-end gap-4">
                        <button
                          onClick={(e) => handleToggleArchive(e, order.id, order.isArchived || false)}
                          className="p-2.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-200"
                          title={order.isArchived ? "Unarchive" : "Archive"}
                        >
                          {order.isArchived ? <RotateCcw size={18} /> : <Archive size={18} />}
                        </button>
                        <div className="flex items-center gap-2 text-slate-300 group-hover:text-slate-900 transition-all duration-200">
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Details</span>
                          <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
