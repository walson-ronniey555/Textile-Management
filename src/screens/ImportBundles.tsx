import React, { useEffect, useState } from 'react';
import { subscribeToBundles } from '../services/dataService';
import { ImportBundle } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
  Truck, 
  Plus, 
  Search,
  Calendar,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Package
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ImportBundles: React.FC = () => {
  const { profile } = useAuth();
  const [bundles, setBundles] = useState<ImportBundle[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'active' | 'archive'>('active');

  useEffect(() => {
    const unsubscribe = subscribeToBundles(setBundles);
    return () => unsubscribe();
  }, []);

  const filteredBundles = bundles.filter(bundle => {
    const matchesSearch = 
      bundle.bundleNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bundle.carrier.toLowerCase().includes(searchTerm.toLowerCase());
    
    const isReceived = bundle.status === 'received';
    const matchesViewMode = viewMode === 'active' ? !isReceived : isReceived;

    return matchesSearch && matchesViewMode;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Import Bundles</h1>
          <p className="text-gray-500">Track incoming shipments and material arrivals.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
            <button
              onClick={() => setViewMode('active')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                viewMode === 'active' ? "bg-[#1a2340] text-white" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Active
            </button>
            <button
              onClick={() => setViewMode('archive')}
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
              to="/bundles/new" 
              className="flex items-center gap-2 bg-[#1a2340] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#2a3a60] transition-all shadow-sm"
            >
              <Plus size={20} />
              New Bundle
            </Link>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input 
          type="text" 
          placeholder="Search by bundle number or carrier..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all shadow-sm"
        />
      </div>

      {/* Bundles Grid */}
      {filteredBundles.length === 0 ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Truck size={32} className="text-gray-300" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">No bundles found</h3>
          <p className="text-gray-500 mb-6 max-w-xs mx-auto">Create your first import bundle to start tracking shipments.</p>
          {profile?.role === 'admin' && (
            <Link 
              to="/bundles/new" 
              className="inline-flex items-center gap-2 bg-[#1a2340] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#2a3a60] transition-all shadow-sm"
            >
              <Plus size={20} />
              Create First Bundle
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredBundles.map((bundle, i) => (
            <motion.div
              key={bundle.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Link 
                to={`/bundles/${bundle.id}`}
                className="group block bg-white rounded-3xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all h-full"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center group-hover:bg-[#1a2340] group-hover:text-white transition-colors">
                    <Truck size={24} />
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                    bundle.status === 'received' || bundle.status === 'arrived' ? "bg-green-100 text-green-700" : 
                    bundle.status === 'in_transit' ? "bg-blue-100 text-blue-700" : 
                    bundle.status === 'waiting_delivery' ? "bg-amber-100 text-amber-700" : 
                    bundle.status === 'not_embarked' ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"
                  )}>
                    {bundle.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="space-y-1 mb-6">
                  <h3 className="text-xl font-bold text-gray-900 group-hover:text-[#1a2340] transition-colors">{bundle.bundleNumber}</h3>
                  <p className="text-sm text-gray-500 font-medium">{bundle.carrier}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-50 p-3 rounded-2xl">
                    <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">
                      {bundle.status === 'arrived' || bundle.status === 'received' ? 'Arrived Date' : 'Expected Date'}
                    </p>
                    <div className="flex items-center gap-1.5 text-sm font-bold text-gray-700">
                      <Calendar size={14} className="text-gray-400" />
                      {bundle.actualArrivalDate || bundle.expectedDate}
                    </div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-2xl">
                    <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Line Items</p>
                    <div className="flex items-center gap-1.5 text-sm font-bold text-gray-700">
                      <Package size={14} className="text-gray-400" />
                      {bundle.lineCount || 0}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm font-bold text-[#1a2340]">
                  <span>View Bundle Details</span>
                  <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ImportBundles;
