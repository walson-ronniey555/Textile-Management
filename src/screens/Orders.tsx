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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-500">Manage and track production orders.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
            <button
              onClick={() => {
                setViewMode('active');
                setStatusFilter('all');
              }}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                viewMode === 'active' ? "bg-[#1a2340] text-white" : "text-gray-500 hover:text-gray-700"
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
                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                viewMode === 'archive' ? "bg-[#1a2340] text-white" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Archive
            </button>
          </div>
          {profile?.role === 'admin' && (
            <Link 
              to="/orders/new" 
              className="flex items-center gap-2 bg-[#1a2340] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#2a3a60] transition-all shadow-sm"
            >
              <Plus size={20} />
              New Order
            </Link>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="Search by model, order number, or client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all shadow-sm"
            />
          </div>
          <div className="relative min-w-[200px]">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all shadow-sm appearance-none font-semibold text-gray-700"
            >
              <option value="all">All Customers</option>
              {customers.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          <Filter className="text-gray-400 mr-2 shrink-0" size={20} />
          {viewMode === 'active' ? (
            (['all', 'partial', 'blocked'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap capitalize",
                  statusFilter === f 
                    ? "bg-[#1a2340] text-white shadow-md" 
                    : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
                )}
              >
                {f}
              </button>
            ))
          ) : (
            <button
              className="px-4 py-2 rounded-full text-sm font-semibold bg-[#1a2340] text-white shadow-md whitespace-nowrap capitalize"
            >
              Ready (Received)
            </button>
          )}
        </div>
      </div>

      {/* Orders Table/Grid */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package size={32} className="text-gray-300" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">No orders found</h3>
          <p className="text-gray-500 mb-6 max-w-xs mx-auto">Try adjusting your search or filters, or create a new order.</p>
          {profile?.role === 'admin' && (
            <Link 
              to="/orders/new" 
              className="inline-flex items-center gap-2 bg-[#1a2340] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#2a3a60] transition-all shadow-sm"
            >
              <Plus size={20} />
              Create New Order
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Order Info</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Quantity</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Export</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredOrders.map((order, i) => (
                  <motion.tr 
                    key={order.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        {order.imageUrl ? (
                          <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-100 shrink-0">
                            <img src={order.imageUrl} alt={order.model} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center border border-gray-100 shrink-0">
                            <Package size={20} className="text-gray-300" />
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-900">{order.model}</span>
                          <span className="text-xs text-gray-500 font-medium">{order.orderNumber} • {order.reference}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-gray-600">{order.client}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-gray-900">{order.quantity.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-700">{order.exportWeek}</span>
                        <span className="text-[10px] text-gray-400 font-bold">{order.exportDate}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit",
                          order.status === 'ready' ? "bg-green-100 text-green-700" : 
                          order.status === 'partial' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                        )}>
                          {order.status === 'ready' ? 'Ready (100%)' : 
                           order.status === 'partial' 
                             ? (order.arrivedPercent && order.arrivedPercent > 0
                                 ? `Partial (Rec: ${order.receivedPercent || 0}% | Arr: ${order.arrivedPercent}%)`
                                 : `Partial (${order.receivedPercent || 0}%)`)
                             : `Blocked (${order.receivedPercent || 0}%)`}
                        </span>
                        {order.status === 'partial' && (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-green-500" 
                                  style={{ width: `${order.receivedPercent || 0}%` }}
                                />
                              </div>
                              <span className="text-[9px] font-bold text-gray-400">{order.receivedPercent || 0}% Rec</span>
                            </div>
                            {(order.arrivedPercent || 0) > 0 && (
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-amber-400" 
                                    style={{ width: `${order.arrivedPercent || 0}%` }}
                                  />
                                </div>
                                <span className="text-[9px] font-bold text-gray-400">{order.arrivedPercent || 0}% Arr</span>
                              </div>
                            )}
                            {(order.plannedPercent || 0) > 0 && (order.receivedPercent || 0) === 0 && (
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-blue-400" 
                                    style={{ width: `${order.plannedPercent || 0}%` }}
                                  />
                                </div>
                                <span className="text-[9px] font-bold text-gray-400">{order.plannedPercent || 0}% Plan</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={(e) => handleToggleArchive(e, order.id, order.isArchived || false)}
                          className="p-2 text-gray-400 hover:text-[#1a2340] hover:bg-gray-100 rounded-lg transition-all"
                          title={order.isArchived ? "Unarchive" : "Archive"}
                        >
                          {order.isArchived ? <RotateCcw size={18} /> : <Archive size={18} />}
                        </button>
                        <div className="flex items-center gap-2 text-gray-400 group-hover:text-[#1a2340] transition-colors">
                          <span className="text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">Details</span>
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
