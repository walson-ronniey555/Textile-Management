import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBundle, subscribeToBundleLines, addImportLine, updateBundleStatus, subscribeToOrders, subscribeToMaterials, deleteImportLine, updateImportLine } from '../services/dataService';
import { db, doc, updateDoc } from '../firebase';
import { ImportBundle, ImportLine, Order, Material } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
  ChevronLeft, 
  Truck, 
  Plus, 
  CheckCircle2, 
  Clock, 
  X,
  Search,
  Package,
  AlertCircle,
  Trash2,
  Edit
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ConfirmModal } from '../components/ConfirmModal';
import { toast } from 'sonner';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const BundleDetail: React.FC = () => {
  const { bundleId } = useParams<{ bundleId: string }>();
  const { profile } = useAuth();
  const [bundle, setBundle] = useState<ImportBundle | null>(null);
  const [lines, setLines] = useState<ImportLine[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isAddingLine, setIsAddingLine] = useState(false);
  const [isSettingArrivalDate, setIsSettingArrivalDate] = useState(false);
  const [isConfirmingReceived, setIsConfirmingReceived] = useState(false);
  const [isDeletingLine, setIsDeletingLine] = useState(false);
  const [isEditingLine, setIsEditingLine] = useState(false);
  const [lineToDelete, setLineToDelete] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<ImportLine | null>(null);
  const [arrivalDate, setArrivalDate] = useState(new Date().toISOString().split('T')[0]);
  const [pendingStatus, setPendingStatus] = useState<ImportBundle['status'] | null>(null);
  const [loading, setLoading] = useState(true);

  // New Line Form State
  const [newLine, setNewLine] = useState({
    bundleId: bundleId || '',
    description: '',
    quantity: 0,
    unit: 'meters',
    linkedOrderId: '',
    linkedMaterialId: '',
    notes: ''
  });
  const [availableMaterials, setAvailableMaterials] = useState<Material[]>([]);

  useEffect(() => {
    if (!bundleId) return;

    const fetchBundle = async () => {
      const data = await getBundle(bundleId);
      setBundle(data);
      setLoading(false);
    };

    fetchBundle();
    const unsubscribeLines = subscribeToBundleLines(bundleId, setLines);
    const unsubscribeOrders = subscribeToOrders(setOrders);

    return () => {
      unsubscribeLines();
      unsubscribeOrders();
    };
  }, [bundleId]);

  // Sync lineCount if out of sync
  useEffect(() => {
    if (bundle && lines.length !== bundle.lineCount) {
      updateDoc(doc(db, 'importBundles', bundle.id), { lineCount: lines.length });
    }
  }, [bundle, lines.length]);

  useEffect(() => {
    if (newLine.linkedOrderId) {
      const unsubscribe = subscribeToMaterials(newLine.linkedOrderId, setAvailableMaterials);
      return () => unsubscribe();
    } else {
      setAvailableMaterials([]);
    }
  }, [newLine.linkedOrderId]);

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bundleId) return;

    await addImportLine(bundleId, newLine);
    setIsAddingLine(false);
    toast.success('Import line added successfully');
    setNewLine({
      bundleId: bundleId || '',
      description: '',
      quantity: 0,
      unit: 'meters',
      linkedOrderId: '',
      linkedMaterialId: '',
      notes: ''
    });
  };

  const handleUpdateStatus = async (newStatus: ImportBundle['status']) => {
    if (!bundleId || !bundle) return;
    
    if (newStatus === 'arrived') {
      setPendingStatus(newStatus);
      setIsSettingArrivalDate(true);
      return;
    }

    if (newStatus === 'received') {
      setIsConfirmingReceived(true);
      return;
    }

    try {
      await updateBundleStatus(bundleId, newStatus);
      setBundle({ ...bundle, status: newStatus });
      toast.success(`Bundle status updated to ${newStatus.replace('_', ' ')}`);
    } catch (error) {
      console.error('Error updating bundle status:', error);
      toast.error('Failed to update bundle status');
    }
  };

  const confirmReceived = async () => {
    if (!bundleId || !bundle) return;
    try {
      await updateBundleStatus(bundleId, 'received');
      setBundle({ ...bundle, status: 'received' });
      setIsConfirmingReceived(false);
      toast.success('Bundle marked as Received. All items updated.');
    } catch (error) {
      console.error('Error marking bundle as received:', error);
      toast.error('Failed to mark bundle as received');
    }
  };

  const confirmArrival = async () => {
    if (!bundleId || !bundle || !pendingStatus) return;
    try {
      await updateBundleStatus(bundleId, pendingStatus, arrivalDate);
      setBundle({ ...bundle, status: pendingStatus, actualArrivalDate: arrivalDate });
      setIsSettingArrivalDate(false);
      setPendingStatus(null);
      toast.success('Bundle arrival confirmed');
    } catch (error) {
      console.error('Error confirming arrival:', error);
      toast.error('Failed to confirm arrival');
    }
  };

  const handleDeleteLine = (lineId: string) => {
    setLineToDelete(lineId);
    setIsDeletingLine(true);
  };

  const confirmDeleteLine = async () => {
    if (!bundleId || !lineToDelete) return;
    try {
      await deleteImportLine(bundleId, lineToDelete);
      toast.success('Line item deleted successfully');
    } catch (error) {
      console.error('Error deleting line:', error);
      toast.error('Failed to delete line item');
    } finally {
      setIsDeletingLine(false);
      setLineToDelete(null);
    }
  };

  const handleEditLine = (line: ImportLine) => {
    setEditingLine({ ...line });
    setIsEditingLine(true);
  };

  const confirmEditLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bundleId || !editingLine) return;
    try {
      await updateImportLine(bundleId, editingLine.id, {
        description: editingLine.description,
        quantity: editingLine.quantity,
        unit: editingLine.unit,
        notes: editingLine.notes
      });
      toast.success('Line item updated successfully');
      setIsEditingLine(false);
      setEditingLine(null);
    } catch (error) {
      console.error('Error updating line:', error);
      toast.error('Failed to update line item');
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading bundle details...</div>;
  if (!bundle) return <div className="p-8 text-center text-gray-500">Bundle not found.</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/bundles" className="p-2 bg-white rounded-xl shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors">
            <ChevronLeft size={24} className="text-gray-600" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">{bundle.bundleNumber}</h1>
              {profile?.role === 'admin' ? (
                <select 
                  value={bundle.status}
                  onChange={(e) => handleUpdateStatus(e.target.value as ImportBundle['status'])}
                  className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border-none focus:ring-2 focus:ring-[#1a2340] cursor-pointer",
                    bundle.status === 'received' || bundle.status === 'arrived' ? "bg-green-100 text-green-700" : 
                    bundle.status === 'in_transit' ? "bg-blue-100 text-blue-700" : 
                    bundle.status === 'waiting_delivery' ? "bg-amber-100 text-amber-700" : 
                    bundle.status === 'not_embarked' ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"
                  )}
                >
                  <option value="waiting_delivery">Waiting Delivery</option>
                  <option value="not_embarked">Not Embarked</option>
                  <option value="in_transit">In Transit</option>
                  <option value="arrived">Arrived</option>
                  <option value="received">Received</option>
                </select>
              ) : (
                <span className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                  bundle.status === 'received' || bundle.status === 'arrived' ? "bg-green-100 text-green-700" : 
                  bundle.status === 'in_transit' ? "bg-blue-100 text-blue-700" : 
                  bundle.status === 'waiting_delivery' ? "bg-amber-100 text-amber-700" : 
                  bundle.status === 'not_embarked' ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"
                )}>
                  {bundle.status.replace('_', ' ')}
                </span>
              )}
            </div>
            <p className="text-gray-500 font-medium">
              {bundle.carrier} • {bundle.status === 'arrived' || bundle.status === 'received' 
                ? `Arrived On: ${bundle.actualArrivalDate || bundle.expectedDate}` 
                : `Expected: ${bundle.expectedDate}`}
            </p>
          </div>
        </div>
        {profile?.role === 'admin' && bundle.status !== 'received' && (
          <button 
            onClick={() => setIsAddingLine(true)}
            className="flex items-center gap-2 bg-[#1a2340] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#2a3a60] transition-all shadow-sm"
          >
            <Plus size={20} />
            Add Line Item
          </button>
        )}
      </div>

      {/* Lines Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900">Bundle Contents</h3>
          <span className="text-sm font-bold text-gray-400">{lines.length} Items</span>
        </div>
        
        {lines.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={32} className="text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No lines added to this bundle yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Quantity</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Linked Order</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Received Date</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lines.map((line) => {
                  const linkedOrder = orders.find(o => o.id === line.linkedOrderId);
                  return (
                    <tr key={line.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-bold text-gray-900">{line.description}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-gray-700">{line.quantity.toLocaleString()} {line.unit}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-[#1a2340]">{linkedOrder?.model || 'Unknown'}</span>
                          <span className="text-[10px] text-gray-400 font-bold">#{linkedOrder?.orderNumber || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {line.status === 'received' ? (
                            <div className="flex items-center gap-1.5 text-green-600">
                              <CheckCircle2 size={16} />
                              <span className="text-xs font-bold uppercase tracking-wider">Received</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-amber-600">
                              <Clock size={16} />
                              <span className="text-xs font-bold uppercase tracking-wider">Pending</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {line.status === 'received' && (
                          <span className="text-[10px] text-gray-400 font-bold uppercase">{line.receivedDate}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {profile?.role === 'admin' && line.status !== 'received' && (
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleEditLine(line)}
                              className="p-1.5 text-gray-400 hover:text-[#1a2340] hover:bg-gray-100 rounded-lg transition-colors"
                              title="Edit Line"
                            >
                              <Edit size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteLine(line.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Line"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Line Modal */}
      <AnimatePresence>
        {isConfirmingReceived && (
          <ConfirmModal
            isOpen={isConfirmingReceived}
            onClose={() => setIsConfirmingReceived(false)}
            onConfirm={confirmReceived}
            title="Mark as Received?"
            message="Marking this bundle as Received will mark ALL items inside as received and update material availability. This action cannot be easily undone."
            confirmText="Mark as Received"
            variant="warning"
          />
        )}

        {isDeletingLine && (
          <ConfirmModal
            isOpen={isDeletingLine}
            onClose={() => setIsDeletingLine(false)}
            onConfirm={confirmDeleteLine}
            title="Delete Line Item?"
            message="Are you sure you want to delete this line item? This will update the material progress for the linked order."
            confirmText="Delete Line"
            variant="danger"
          />
        )}

        {isEditingLine && editingLine && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <h3 className="text-xl font-bold text-gray-900">Edit Line Item</h3>
                <button onClick={() => setIsEditingLine(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
              <form onSubmit={confirmEditLine} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Description</label>
                  <input 
                    type="text" 
                    required
                    value={editingLine.description}
                    onChange={(e) => setEditingLine({ ...editingLine, description: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Quantity</label>
                    <input 
                      type="number" 
                      required
                      value={editingLine.quantity}
                      onChange={(e) => setEditingLine({ ...editingLine, quantity: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Unit</label>
                    <input 
                      type="text" 
                      required
                      value={editingLine.unit}
                      onChange={(e) => setEditingLine({ ...editingLine, unit: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Notes</label>
                  <textarea 
                    value={editingLine.notes || ''}
                    onChange={(e) => setEditingLine({ ...editingLine, notes: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] min-h-[100px]"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsEditingLine(false)}
                    className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-3 bg-[#1a2340] text-white font-bold rounded-xl hover:bg-[#2a3a60] transition-colors shadow-lg"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isAddingLine && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <h3 className="text-xl font-bold text-gray-900">Add Import Line</h3>
                <button onClick={() => setIsAddingLine(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
              <form onSubmit={handleAddLine} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Description</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g., Main Fabric - Navy Blue"
                    value={newLine.description}
                    onChange={(e) => setNewLine({ ...newLine, description: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Quantity</label>
                    <input 
                      type="number" 
                      required
                      value={newLine.quantity}
                      onChange={(e) => setNewLine({ ...newLine, quantity: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Unit</label>
                    <input 
                      type="text" 
                      required
                      placeholder="meters, units, etc."
                      value={newLine.unit}
                      onChange={(e) => setNewLine({ ...newLine, unit: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Linked Order</label>
                  <select 
                    required
                    value={newLine.linkedOrderId}
                    onChange={(e) => setNewLine({ ...newLine, linkedOrderId: e.target.value, linkedMaterialId: '' })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                  >
                    <option value="">Select an Order</option>
                    {orders.map(o => (
                      <option key={o.id} value={o.id}>{o.model} (#{o.orderNumber})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Linked Material</label>
                  <select 
                    required
                    disabled={!newLine.linkedOrderId}
                    value={newLine.linkedMaterialId}
                    onChange={(e) => setNewLine({ ...newLine, linkedMaterialId: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] disabled:opacity-50"
                  >
                    <option value="">Select a Material</option>
                    {availableMaterials.map(m => (
                      <option key={m.id} value={m.id}>{m.type} ({m.composition})</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAddingLine(false)}
                    className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-3 bg-[#1a2340] text-white font-bold rounded-xl hover:bg-[#2a3a60] transition-colors shadow-lg"
                  >
                    Add Line
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isSettingArrivalDate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <h3 className="text-xl font-bold text-gray-900">Confirm Arrival</h3>
                <button onClick={() => setIsSettingArrivalDate(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Actual Arrival Date</label>
                  <input 
                    type="date" 
                    required
                    value={arrivalDate}
                    onChange={(e) => setArrivalDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsSettingArrivalDate(false)}
                    className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={confirmArrival}
                    className="flex-1 px-4 py-3 bg-[#1a2340] text-white font-bold rounded-xl hover:bg-[#2a3a60] transition-colors shadow-lg"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BundleDetail;
