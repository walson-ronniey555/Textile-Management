import React, { useEffect, useState } from 'react';
import { subscribeToExportPlan, updateExportedQty, syncExportPlan } from '../services/dataService';
import { db, collection, getDocs } from '../firebase';
import { ExportPlan, Order } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
  Calendar, 
  Search,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Edit,
  Download,
  RefreshCw
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { ConfirmModal } from '../components/ConfirmModal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ExportPlanScreen: React.FC = () => {
  const { profile } = useAuth();
  const [plans, setPlans] = useState<ExportPlan[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConfirmingSync, setIsConfirmingSync] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToExportPlan(setPlans);
    return () => unsubscribe();
  }, []);

  const filteredPlans = plans.filter(plan => 
    plan.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plan.channel.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveQty = async (id: string) => {
    await updateExportedQty(id, editValue);
    setEditingId(null);
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      const ordersSnapshot = await getDocs(collection(db, 'orders'));
      const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      
      for (const order of orders) {
        await syncExportPlan(order.id, order);
      }
      toast.success('Sync completed successfully!');
    } catch (error) {
      console.error('Error syncing orders:', error);
      toast.error('Error syncing orders. Check console for details.');
    } finally {
      setIsSyncing(false);
      setIsConfirmingSync(false);
    }
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(20);
    doc.text('Planned Export Calendar', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

    // Prepare table data
    const tableData = filteredPlans.map(plan => [
      plan.week,
      plan.weekDate,
      plan.orderNumber,
      plan.channel,
      plan.plannedQty.toLocaleString(),
      plan.exportedQty.toLocaleString(),
      plan.remaining.toLocaleString()
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Week', 'Date', 'Order #', 'Channel', 'Planned', 'Exported', 'Remaining']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [26, 35, 64] },
      styles: { fontSize: 9 },
    });

    doc.save(`export-plan-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const getStatusColor = (plan: ExportPlan) => {
    const progress = (plan.exportedQty / plan.plannedQty) * 100;
    if (progress >= 100) return 'text-green-600 bg-green-50 border-green-100';
    if (progress > 50) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-red-600 bg-red-50 border-red-100';
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Export Plan</h1>
          <p className="text-gray-500">Weekly calendar view of planned exports.</p>
        </div>
        <div className="flex items-center gap-3">
          {profile?.role === 'admin' && (
            <button 
              onClick={() => setIsConfirmingSync(true)}
              disabled={isSyncing}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={20} className={cn(isSyncing && "animate-spin")} />
              Sync All
            </button>
          )}
          <button 
            onClick={downloadPDF}
            className="flex items-center gap-2 bg-[#1a2340] text-white px-4 py-2.5 rounded-xl font-semibold hover:bg-[#2a3a60] transition-colors shadow-sm"
          >
            <Download size={20} />
            Download PDF
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input 
          type="text" 
          placeholder="Search by order number or channel..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all shadow-sm"
        />
      </div>

      {/* Sync Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmingSync}
        onClose={() => setIsConfirmingSync(false)}
        onConfirm={handleSyncAll}
        title="Sync All Orders?"
        message="This will sync all existing orders to the export plan. This might take a moment if you have many orders."
        confirmText="Sync Now"
        variant="info"
      />

      {/* Plans Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        {filteredPlans.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar size={32} className="text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No export plan yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Week</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Order Info</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Channel</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Planned Qty</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Exported Qty</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Remaining</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredPlans.map((plan, i) => (
                  <motion.tr 
                    key={plan.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-900">{plan.week}</span>
                        <span className="text-[10px] text-gray-400 font-bold">{plan.weekDate}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-[#1a2340]">{plan.orderNumber}</span>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Order ID: {plan.orderId.slice(0, 8)}...</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-gray-600">{plan.channel}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-bold text-gray-900">{plan.plannedQty.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {editingId === plan.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <input 
                            type="number" 
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm font-bold"
                            value={editValue}
                            onChange={(e) => setEditValue(parseInt(e.target.value))}
                          />
                          <button 
                            onClick={() => handleSaveQty(plan.id)}
                            className="p-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-sm font-bold text-gray-900">{plan.exportedQty.toLocaleString()}</span>
                          {profile?.role === 'admin' && (
                            <button 
                              onClick={() => {
                                setEditingId(plan.id);
                                setEditValue(plan.exportedQty);
                              }}
                              className="p-1 text-gray-400 hover:text-[#1a2340] transition-colors"
                            >
                              <Edit size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={cn(
                        "text-sm font-bold px-2 py-1 rounded-lg border",
                        getStatusColor(plan)
                      )}>
                        {plan.remaining.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link to={`/orders/${plan.orderId}`} className="text-gray-400 hover:text-[#1a2340] transition-colors">
                        <ChevronRight size={20} />
                      </Link>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExportPlanScreen;
