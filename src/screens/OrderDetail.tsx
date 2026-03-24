import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { getOrder, subscribeToMaterials, deleteOrder, addMaterial, updateMaterial, deleteMaterial, subscribeToBundles, addImportLine, subscribeToOrders, subscribeToOrderImportLines, syncOrderData } from '../services/dataService';
import { Order, Material, MaterialUnit, ImportBundle, ImportLine } from '../types';
import { db, collection, getDocs } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
  ChevronLeft, 
  Package, 
  Truck, 
  Calendar, 
  Plus, 
  Trash2, 
  Edit,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
  FileText,
  Printer,
  Download,
  Search,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import { ConfirmModal } from '../components/ConfirmModal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const OrderDetail: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const techSheetRef = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [activeTab, setActiveTab] = useState<'materials' | 'timeline' | 'export'>('materials');
  const [isAddingMaterial, setIsAddingMaterial] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [isGeneratingImport, setIsGeneratingImport] = useState(false);
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);
  const [isDeletingMaterial, setIsDeletingMaterial] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState<string | null>(null);
  const [showTechSheet, setShowTechSheet] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bundles, setBundles] = useState<ImportBundle[]>([]);
  const [importLines, setImportLines] = useState<ImportLine[]>([]);

  // Import Generation State
  const [importDraft, setImportDraft] = useState<{
    bundleId: string;
    orders: {
      [orderId: string]: {
        order: Order;
        materials: Material[];
        selections: { [matId: string]: { selected: boolean, quantity: number } };
      }
    };
  }>({
    bundleId: '',
    orders: {}
  });
  const [isAddingOrderToImport, setIsAddingOrderToImport] = useState(false);
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [allOrders, setAllOrders] = useState<Order[]>([]);

  // New Material Form State
  const [newMaterial, setNewMaterial] = useState({
    type: 'Main Fabric',
    composition: '',
    consumptionPerUnit: 0,
    unit: 'meters' as MaterialUnit,
    notes: ''
  });

  useEffect(() => {
    if (!orderId) return;

    const fetchOrder = async () => {
      const data = await getOrder(orderId);
      setOrder(data);
      setLoading(false);
      
      // Check if we should show add material modal (from NewOrder redirect)
      const state = location.state as { showAddMaterial?: boolean };
      if (state?.showAddMaterial) {
        setIsAddingMaterial(true);
        navigate(location.pathname, { replace: true, state: {} });
      }
    };

    fetchOrder();
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;

    const unsubscribeMaterials = subscribeToMaterials(orderId, (mats) => {
      setMaterials(mats);
      
      // Initialize current order in draft if not already there and order is available
      setImportDraft(prev => {
        if (prev.orders[orderId] || !order) return prev;
        
        const selections: { [key: string]: { selected: boolean, quantity: number } } = {};
        mats.forEach(m => {
          selections[m.id] = { 
            selected: false, 
            quantity: Math.max(0, m.totalRequired - m.totalReceived) 
          };
        });

        return {
          ...prev,
          orders: {
            ...prev.orders,
            [orderId]: {
              order: order,
              materials: mats,
              selections
            }
          }
        };
      });
    });

    const unsubscribeBundles = subscribeToBundles(setBundles);
    const unsubscribeAllOrders = subscribeToOrders(setAllOrders);
    const unsubscribeImportLines = subscribeToOrderImportLines(orderId, setImportLines);

    return () => {
      unsubscribeMaterials();
      unsubscribeBundles();
      unsubscribeAllOrders();
      unsubscribeImportLines();
    };
  }, [orderId, order]);

  const handleSync = async () => {
    if (!orderId || isSyncing) return;
    setIsSyncing(true);
    const toastId = toast.loading('Syncing order data...');
    try {
      await syncOrderData(orderId);
      toast.success('Order data synced successfully', { id: toastId });
    } catch (error) {
      toast.error('Failed to sync order data', { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!orderId) return;
    try {
      await deleteOrder(orderId);
      toast.success('Order deleted successfully');
      navigate('/orders');
    } catch (error) {
      console.error('Error deleting order:', error);
      toast.error('Failed to delete order');
    }
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || !order) return;

    const totalRequired = newMaterial.consumptionPerUnit * order.quantity;
    await addMaterial(orderId, {
      ...newMaterial,
      totalRequired,
    });

    setIsAddingMaterial(false);
    setNewMaterial({
      type: 'Main Fabric',
      composition: '',
      consumptionPerUnit: 0,
      unit: 'meters',
      notes: ''
    });
  };

  const handleUpdateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || !order || !editingMaterial) return;

    const totalRequired = editingMaterial.consumptionPerUnit * order.quantity;
    
    // Recalculate status based on new requirement
    let newStatus = editingMaterial.status;
    if (editingMaterial.totalReceived >= totalRequired) {
      newStatus = 'ok';
    } else if (editingMaterial.totalReceived > 0) {
      newStatus = 'partial';
    } else {
      newStatus = 'missing';
    }

    await updateMaterial(orderId, editingMaterial.id, {
      type: editingMaterial.type,
      composition: editingMaterial.composition,
      consumptionPerUnit: editingMaterial.consumptionPerUnit,
      unit: editingMaterial.unit,
      notes: editingMaterial.notes,
      totalRequired,
      status: newStatus
    });

    setEditingMaterial(null);
  };

  const handleDeleteMaterial = async (materialId: string) => {
    if (!orderId) return;
    setMaterialToDelete(materialId);
    setIsDeletingMaterial(true);
  };

  const confirmDeleteMaterial = async () => {
    if (!orderId || !materialToDelete) return;
    try {
      await deleteMaterial(orderId, materialToDelete);
      toast.success('Material deleted successfully');
    } catch (error) {
      console.error('Error deleting material:', error);
      toast.error('Failed to delete material');
    } finally {
      setIsDeletingMaterial(false);
      setMaterialToDelete(null);
    }
  };

  const handleDownloadPDF = async () => {
    if (!techSheetRef.current || !order) return;
    
    setIsDownloading(true);
    const toastId = toast.loading('Génération du PDF...');
    
    try {
      const element = techSheetRef.current;
      
      // Use html2canvas to capture the element
      const canvas = await html2canvas(element, {
        scale: 2, // Higher scale for better quality
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1200, // Wider window for better layout rendering
        onclone: (clonedDoc) => {
          // Ensure the cloned element has the fix class
          const clonedElement = clonedDoc.querySelector('.tech-sheet-container') as HTMLElement;
          if (clonedElement) {
            clonedElement.style.boxShadow = 'none';
            clonedElement.style.borderRadius = '0';
            clonedElement.style.width = '1200px';
            
            // Fix grid issues by forcing widths on columns
            const grid = clonedElement.querySelector('.grid-cols-12') as HTMLElement;
            if (grid) {
              grid.style.display = 'flex';
              grid.style.flexWrap = 'nowrap';
              grid.style.width = '100%';
              
              const col4 = grid.querySelector('.md\\:col-span-4') as HTMLElement;
              const col5 = grid.querySelector('.md\\:col-span-5') as HTMLElement;
              const col3 = grid.querySelector('.md\\:col-span-3') as HTMLElement;
              
              if (col4) {
                col4.style.width = '33.33%';
                col4.style.minWidth = '33.33%';
                col4.style.flex = '0 0 33.33%';
              }
              if (col5) {
                col5.style.width = '41.66%';
                col5.style.minWidth = '41.66%';
                col5.style.flex = '0 0 41.66%';
              }
              if (col3) {
                col3.style.width = '25%';
                col3.style.minWidth = '25%';
                col3.style.flex = '0 0 25%';
              }
            }
            
            // Fix accessories grid
            const accGrid = clonedElement.querySelector('.grid-cols-2.md\\:grid-cols-4') as HTMLElement;
            if (accGrid) {
              accGrid.style.display = 'flex';
              accGrid.style.flexWrap = 'wrap';
              accGrid.style.gap = '24px';
              const items = Array.from(accGrid.children);
              items.forEach((item) => {
                const htmlItem = item as HTMLElement;
                htmlItem.style.width = 'calc(25% - 18px)';
                htmlItem.style.minWidth = 'calc(25% - 18px)';
                htmlItem.style.flex = '0 0 calc(25% - 18px)';
                htmlItem.style.height = 'auto';
                htmlItem.style.minHeight = '140px';
                htmlItem.style.marginBottom = '24px';
                htmlItem.style.padding = '16px';
                htmlItem.style.border = '1px solid #f3f4f6';
                htmlItem.style.borderRadius = '12px';
                htmlItem.style.backgroundColor = 'rgba(249, 250, 251, 0.5)';
                
                // Ensure text inside is visible
                const pElements = htmlItem.querySelectorAll('p');
                pElements.forEach(p => {
                  (p as HTMLElement).style.whiteSpace = 'normal';
                  (p as HTMLElement).style.wordBreak = 'break-word';
                  (p as HTMLElement).style.overflow = 'visible';
                  (p as HTMLElement).style.height = 'auto';
                  (p as HTMLElement).style.display = 'block';
                });
              });
            }
            
            // Remove line-clamp and truncate to prevent text clipping
            const clipElements = clonedElement.querySelectorAll('.line-clamp-2, .line-clamp-1, .truncate');
            clipElements.forEach(el => {
              (el as HTMLElement).style.display = 'block';
              (el as HTMLElement).style.webkitLineClamp = 'none';
              (el as HTMLElement).style.webkitBoxOrient = 'vertical';
              (el as HTMLElement).style.overflow = 'visible';
              (el as HTMLElement).style.whiteSpace = 'normal';
              (el as HTMLElement).style.height = 'auto';
            });
            
            // Remove overflow-hidden to prevent text clipping
            const overflowElements = clonedElement.querySelectorAll('.overflow-hidden');
            overflowElements.forEach(el => {
              (el as HTMLElement).style.overflow = 'visible';
              (el as HTMLElement).style.height = 'auto';
            });
          }
        }
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.95); // Use JPEG for smaller size if needed
      
      // Standard A4 size in mm
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      // If content is longer than one page, it will be scaled down to fit one page
      // For a technical sheet, one page is usually preferred
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      
      pdf.save(`Fiche_Technique_${order.model.replace(/\s+/g, '_')}_${order.orderNumber}.pdf`);
      toast.success('PDF téléchargé avec succès !', { id: toastId });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Une erreur est survenue lors de la génération du PDF.', { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleGenerateImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importDraft.bundleId) return;

    setIsGeneratingImport(false);
    const toastId = toast.loading('Generating import lines...');

    try {
      // Fetch existing lines in the bundle to prevent duplicates
      const existingLinesSnap = await getDocs(collection(db, 'importBundles', importDraft.bundleId, 'lines'));
      const existingLines = existingLinesSnap.docs.map(d => d.data() as ImportLine);

      let totalLines = 0;
      let skippedLines = 0;

      for (const oId of Object.keys(importDraft.orders)) {
        const orderDraft = importDraft.orders[oId];
        const selectedIds = Object.keys(orderDraft.selections).filter(id => orderDraft.selections[id].selected);
        
        for (const matId of selectedIds) {
          const material = orderDraft.materials.find(m => m.id === matId);
          if (!material) continue;

          // Check for duplicate
          const isDuplicate = existingLines.some(l => l.linkedOrderId === oId && l.linkedMaterialId === matId);
          if (isDuplicate) {
            skippedLines++;
            continue;
          }

          const selection = orderDraft.selections[matId];
          await addImportLine(importDraft.bundleId, {
            bundleId: importDraft.bundleId,
            description: `${material.type} - ${material.composition}`,
            quantity: selection.quantity,
            unit: material.unit,
            linkedOrderId: oId,
            linkedMaterialId: matId,
            notes: `Auto-generated from Order ${orderDraft.order.orderNumber}`
          });
          totalLines++;
        }
      }
      
      if (totalLines === 0 && skippedLines === 0) {
        toast.error('Please select at least one material.', { id: toastId });
        return;
      }

      if (totalLines > 0) {
        toast.success(`${totalLines} import lines generated successfully!${skippedLines > 0 ? ` (${skippedLines} duplicates skipped)` : ''}`, { id: toastId });
        navigate(`/bundles/${importDraft.bundleId}`);
      } else {
        toast.info(`No new lines added. ${skippedLines} duplicates were skipped.`, { id: toastId });
      }
    } catch (error) {
      console.error('Error generating import lines:', error);
      toast.error('Failed to generate import lines.', { id: toastId });
    }
  };

  const addOrderToDraft = async (oId: string) => {
    if (importDraft.orders[oId]) return;

    const targetOrder = allOrders.find(o => o.id === oId);
    if (!targetOrder) return;

    // We need materials for this order
    // Since we are in a modal, we can't easily use a hook
    // We'll fetch them once
    const matsRef = collection(db, 'orders', oId, 'materials');
    const snapshot = await getDocs(matsRef);
    const mats = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Material));

    const selections: { [key: string]: { selected: boolean, quantity: number } } = {};
    mats.forEach(m => {
      selections[m.id] = { 
        selected: false, 
        quantity: Math.max(0, m.totalRequired - m.totalReceived) 
      };
    });

    setImportDraft(prev => ({
      ...prev,
      orders: {
        ...prev.orders,
        [oId]: {
          order: targetOrder,
          materials: mats,
          selections
        }
      }
    }));
    setIsAddingOrderToImport(false);
  };

  const removeOrderFromDraft = (oId: string) => {
    if (oId === orderId) return; // Can't remove current order
    setImportDraft(prev => {
      const newOrders = { ...prev.orders };
      delete newOrders[oId];
      return { ...prev, orders: newOrders };
    });
  };

  const handlePrint = () => {
    // Direct print call is often more reliable in modern browsers
    // The CSS in index.css handles hiding everything else
    window.print();
  };

  const selectedCount = Object.values(importDraft.orders).reduce((acc: number, orderDraft: any) => {
    return acc + Object.values(orderDraft.selections || {}).filter((s: any) => s.selected).length;
  }, 0);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading order details...</div>;
  if (!order) return <div className="p-8 text-center text-gray-500">Order not found.</div>;

  return (
    <div className="space-y-8">
      <div className={cn("space-y-8", showTechSheet && "no-print-global")}>
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/orders" className="p-2 bg-white rounded-xl shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors">
            <ChevronLeft size={24} className="text-gray-600" />
          </Link>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold text-gray-900">{order.model}</h1>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
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
                </div>
                <p className="text-gray-500 font-medium">{order.orderNumber} • {order.client} • {order.reference}</p>
              </div>
        </div>
        {profile && (
          <div className="flex items-center gap-3">
            <button 
              onClick={handleSync}
              disabled={isSyncing}
              className={cn(
                "flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition-colors shadow-sm",
                isSyncing && "opacity-50 cursor-not-allowed"
              )}
              title="Recalculate progress for this order"
            >
              <RefreshCw size={20} className={cn(isSyncing && "animate-spin")} />
              <span className="hidden sm:inline">Sync</span>
            </button>
            {profile.role === 'admin' && (
              <>
                <button 
                  onClick={() => setIsGeneratingImport(true)}
                  className="flex items-center gap-2 bg-[#1a2340] text-white px-4 py-2.5 rounded-xl font-semibold hover:bg-[#2a3a60] transition-colors shadow-sm"
                >
                  <Truck size={20} />
                  Generate Import
                </button>
                <button 
                  onClick={() => setShowTechSheet(true)}
                  className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <FileText size={20} />
                  Fiche Technique
                </button>
                <Link 
                  to={`/orders/${orderId}/edit`}
                  className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <Edit size={20} />
                  Edit
                </Link>
                <button 
                  onClick={() => setIsDeletingOrder(true)}
                  className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2.5 rounded-xl font-semibold hover:bg-red-100 transition-colors shadow-sm"
                >
                  <Trash2 size={20} />
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeletingOrder}
        onClose={() => setIsDeletingOrder(false)}
        onConfirm={handleDeleteOrder}
        title="Delete Order?"
        message={`Are you sure you want to delete ${order?.model}? This action cannot be undone and all associated data will be removed.`}
        confirmText="Delete"
        variant="danger"
      />

      {/* Delete Material Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeletingMaterial}
        onClose={() => setIsDeletingMaterial(false)}
        onConfirm={confirmDeleteMaterial}
        title="Delete Material?"
        message="Are you sure you want to delete this material? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
      />

      {/* Production Readiness Banner */}
      {order.status === 'ready' && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 border border-green-100 rounded-3xl p-6 mb-8 flex items-center gap-6 shadow-sm"
        >
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center shrink-0">
            <CheckCircle2 size={32} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-green-900">Ready for Production</h3>
            <p className="text-green-700 font-medium">All required materials have been received. You can now start the production process for this order.</p>
          </div>
          <div className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg shadow-green-200">
            100% Ready
          </div>
        </motion.div>
      )}

      {order.status === 'partial' && (order.arrivedPercent || 0) > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-100 rounded-3xl p-6 mb-8 flex items-center gap-6 shadow-sm"
        >
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
            <Truck size={32} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-amber-900">Materials Arrived</h3>
            <p className="text-amber-700 font-medium">
              {order.arrivedPercent}% of materials have arrived at the factory and are pending official receipt. 
              Total availability (Rec + Arr): {Math.min(100, (order.receivedPercent || 0) + (order.arrivedPercent || 0))}%
            </p>
          </div>
          <div className="px-6 py-3 bg-amber-500 text-white rounded-xl font-bold shadow-lg shadow-amber-200">
            {Math.min(100, (order.receivedPercent || 0) + (order.arrivedPercent || 0))}% Available
          </div>
        </motion.div>
      )}

      {/* Image and Quick Info Grid */}
      <div className="flex flex-col lg:flex-row gap-8">
        {order.imageUrl && (
          <div className="lg:w-1/3">
            <div className="bg-white p-2 rounded-3xl shadow-sm border border-gray-100 overflow-hidden aspect-square">
              <img 
                src={order.imageUrl} 
                alt={order.model} 
                className="w-full h-full object-cover rounded-2xl"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        )}
        <div className={cn("grid grid-cols-2 gap-4 flex-1", order.imageUrl ? "lg:grid-cols-2" : "lg:grid-cols-4")}>
          {[
            { label: 'Quantity', value: order.quantity.toLocaleString(), icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Export Week', value: order.exportWeek, icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Export Date', value: order.exportDate, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Created At', value: order.createdAt.toDate().toLocaleDateString(), icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
          ].map((info) => (
            <div key={info.label} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", info.bg)}>
                <info.icon size={16} className={info.color} />
              </div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{info.label}</p>
              <p className="text-lg font-bold text-gray-900">{info.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 border-b border-gray-200 overflow-x-auto no-scrollbar">
          {[
            { id: 'materials', label: 'Materials', icon: Package },
            { id: 'timeline', label: 'Import Timeline', icon: Truck },
            { id: 'export', label: 'Export Plan', icon: Calendar },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 whitespace-nowrap",
                activeTab === tab.id 
                  ? "border-[#1a2340] text-[#1a2340]" 
                  : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {activeTab === 'materials' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">Required Materials</h3>
                {profile?.role === 'admin' && (
                  <button 
                    onClick={() => setIsAddingMaterial(true)}
                    className="flex items-center gap-2 bg-[#1a2340] text-white px-4 py-2 rounded-xl font-semibold hover:bg-[#2a3a60] transition-colors shadow-sm"
                  >
                    <Plus size={18} />
                    Add Material
                  </button>
                )}
              </div>

              {materials.length === 0 ? (
                <div className="bg-white rounded-3xl border-2 border-dashed border-gray-200 p-12 text-center">
                  <Package size={32} className="text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium">No materials added yet.</p>
                </div>
              ) : (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Composition</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Required</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Received</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Progress</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {materials.map((material) => {
                          const progress = Math.min(100, (material.totalReceived / material.totalRequired) * 100);
                          
                          // Calculate custom status based on imports
                          const materialLines = importLines.filter(l => l.linkedMaterialId === material.id);
                          const isFullyReceived = material.totalReceived >= material.totalRequired;
                          
                          // Get quantities by bundle status
                          let arrivedQty = 0;
                          let inTransitQty = 0;
                          let pendingQty = 0;

                          materialLines.forEach(line => {
                            if (line.status === 'received') return;
                            const bundle = bundles.find(b => b.id === line.bundleId);
                            if (bundle?.status === 'arrived') arrivedQty += line.quantity;
                            else if (bundle?.status === 'in_transit') inTransitQty += line.quantity;
                            else pendingQty += line.quantity;
                          });

                          const arrivedProgress = Math.min(100, (arrivedQty / material.totalRequired) * 100);
                          
                          let displayStatus: 'ok' | 'partial' | 'missing' = 'missing';
                          if (isFullyReceived) {
                            displayStatus = 'ok';
                          } else if (materialLines.length > 0 || material.totalReceived > 0) {
                            displayStatus = 'partial';
                          } else {
                            displayStatus = 'missing';
                          }

                          return (
                            <tr key={material.id} className={cn(
                              "hover:bg-gray-50/50 transition-colors group",
                              displayStatus === 'missing' && "bg-red-50/30",
                              displayStatus === 'partial' && "bg-amber-50/30"
                            )}>
                              <td className="px-6 py-4">
                                <span className="font-bold text-gray-900">{material.type}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm text-gray-600 font-medium">{material.composition}</span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className="text-sm font-bold text-gray-900">{material.totalRequired.toLocaleString()} {material.unit}</span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className="text-sm font-bold text-gray-900">{material.totalReceived.toLocaleString()} {material.unit}</span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="w-40 flex flex-col gap-1">
                                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
                                    {/* Received Progress */}
                                    <div 
                                      className="h-full bg-green-500 transition-all duration-500"
                                      style={{ width: `${(material.totalReceived / material.totalRequired) * 100}%` }}
                                    />
                                    {/* Arrived Progress */}
                                    <div 
                                      className="h-full bg-amber-400 transition-all duration-500"
                                      style={{ width: `${(arrivedQty / material.totalRequired) * 100}%` }}
                                    />
                                    {/* In Transit Progress */}
                                    <div 
                                      className="h-full bg-blue-400 transition-all duration-500"
                                      style={{ width: `${(inTransitQty / material.totalRequired) * 100}%` }}
                                    />
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-gray-400">
                                      {Math.round((material.totalReceived / material.totalRequired) * 100)}% Rec
                                    </span>
                                    {arrivedQty > 0 && (
                                      <span className="text-[10px] font-bold text-amber-500">
                                        {Math.round((arrivedQty / material.totalRequired) * 100)}% Arr
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5">
                                      {displayStatus === 'ok' && <CheckCircle2 size={14} className="text-green-500" />}
                                      {displayStatus === 'partial' && <Clock size={14} className="text-amber-500" />}
                                      {displayStatus === 'missing' && <AlertTriangle size={14} className="text-red-500" />}
                                      <span className={cn(
                                        "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit",
                                        displayStatus === 'ok' ? "bg-green-100 text-green-700" : 
                                        displayStatus === 'partial' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                                      )}>
                                        {displayStatus === 'ok' 
                                          ? 'Fully Received' 
                                          : displayStatus === 'partial' 
                                            ? (material.totalReceived > 0 
                                                ? 'Partially Received' 
                                                : arrivedQty > 0 
                                                  ? 'Arrived (Pending Receipt)' 
                                                  : inTransitQty > 0 
                                                    ? 'In Transit' 
                                                    : 'Sent (Pending)') 
                                            : 'Not Sent'}
                                      </span>
                                    </div>
                                    
                                    {displayStatus === 'partial' && (
                                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                                        {arrivedQty > 0 && (
                                          <span className="text-[9px] text-amber-600 font-bold flex items-center gap-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                            Arrived: {arrivedQty.toLocaleString()}
                                          </span>
                                        )}
                                        {inTransitQty > 0 && (
                                          <span className="text-[9px] text-blue-600 font-bold flex items-center gap-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                            In Transit: {inTransitQty.toLocaleString()}
                                          </span>
                                        )}
                                        {pendingQty > 0 && (
                                          <span className="text-[9px] text-gray-500 font-bold flex items-center gap-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                                            Pending: {pendingQty.toLocaleString()}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button 
                                    onClick={() => setEditingMaterial(material)}
                                    className="p-2 text-gray-400 hover:text-[#1a2340] hover:bg-white rounded-lg transition-all"
                                    title="Edit Material"
                                  >
                                    <Edit size={16} />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteMaterial(material.id)}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                    title="Delete Material"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">Import Timeline</h3>
              </div>

              {importLines.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
                  <Truck size={48} className="text-gray-200 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium">No import lines linked to this order yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {importLines.sort((a, b) => {
                    // Sort by status (pending first) then by id
                    if (a.status === 'pending' && b.status === 'received') return -1;
                    if (a.status === 'received' && b.status === 'pending') return 1;
                    return 0;
                  }).map((line) => {
                    const bundle = bundles.find(b => b.id === line.bundleId);
                    
                    return (
                      <div key={line.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between group hover:border-[#1a2340]/20 transition-all">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center",
                            line.status === 'received' ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
                          )}>
                            <Truck size={24} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-gray-900">{line.description}</p>
                              {bundle && (
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold">
                                  {bundle.bundleNumber}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs font-medium text-gray-500">{line.quantity} {line.unit}</span>
                              <span className="text-gray-300">•</span>
                              <span className={cn(
                                "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                                line.status === 'received' ? "bg-green-100 text-green-700" : 
                                bundle?.status === 'arrived' ? "bg-amber-100 text-amber-700" :
                                bundle?.status === 'in_transit' ? "bg-blue-100 text-blue-700" :
                                "bg-gray-100 text-gray-600"
                              )}>
                                {line.status === 'received' ? 'Received' : (bundle?.status?.replace('_', ' ') || 'Pending')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          {bundle && (
                            <div className="text-right hidden sm:block">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                {bundle.status === 'arrived' || bundle.status === 'received' ? 'Arrived On' : 'Expected'}
                              </p>
                              <p className="text-xs font-bold text-gray-900">
                                {bundle.actualArrivalDate || bundle.expectedDate}
                              </p>
                            </div>
                          )}
                          {line.receivedDate && (
                            <div className="text-right">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-green-600">Received On</p>
                              <p className="text-sm font-bold text-gray-900">{line.receivedDate}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'export' && (
            <div className="bg-white rounded-3xl p-8 text-center border border-gray-100">
              <Calendar size={48} className="text-gray-200 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">Export Plan</h3>
              <p className="text-gray-500">Planned vs exported quantities per week.</p>
              <p className="text-xs text-gray-400 mt-4 italic">Feature coming soon: Weekly breakdown.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Material Modal */}
      <AnimatePresence>
        {isAddingMaterial && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <h3 className="text-xl font-bold text-gray-900">Add New Material</h3>
                <button onClick={() => setIsAddingMaterial(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
              <form onSubmit={handleAddMaterial} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Type</label>
                    <select 
                      value={newMaterial.type}
                      onChange={(e) => setNewMaterial({ ...newMaterial, type: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                    >
                      {['Main Fabric', 'Interlining', 'Lining', 'Buttons', 'Elastic', 'Composition Label', 'Brand Label', 'Size Label', 'Special Label', 'Other'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Unit</label>
                    <select 
                      value={newMaterial.unit}
                      onChange={(e) => setNewMaterial({ ...newMaterial, unit: e.target.value as MaterialUnit })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                    >
                      {['meters', 'units', 'coils'].map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Composition</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g., 100% Cotton, 120gsm"
                    value={newMaterial.composition}
                    onChange={(e) => setNewMaterial({ ...newMaterial, composition: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Consumption per Unit</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      value={newMaterial.consumptionPerUnit}
                      onChange={(e) => setNewMaterial({ ...newMaterial, consumptionPerUnit: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 uppercase">
                      {newMaterial.unit} / unit
                    </span>
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-blue-700">Calculated Total Required</span>
                    <span className="text-lg font-black text-blue-900">
                      {(newMaterial.consumptionPerUnit * order.quantity).toLocaleString()} {newMaterial.unit}
                    </span>
                  </div>
                  <p className="text-[10px] text-blue-600 mt-1">Based on order quantity: {order.quantity.toLocaleString()}</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Notes</label>
                  <textarea 
                    rows={2}
                    value={newMaterial.notes}
                    onChange={(e) => setNewMaterial({ ...newMaterial, notes: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAddingMaterial(false)}
                    className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-3 bg-[#1a2340] text-white font-bold rounded-xl hover:bg-[#2a3a60] transition-colors shadow-lg"
                  >
                    Save Material
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Generate Import Modal */}
      <AnimatePresence>
        {isGeneratingImport && order && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#1a2340] text-white rounded-lg">
                    <Truck size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Generate Import Lines</h3>
                    <p className="text-xs text-gray-500 font-medium">
                      {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected for import
                    </p>
                  </div>
                </div>
                <button onClick={() => setIsGeneratingImport(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
              <form onSubmit={handleGenerateImport} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Select Target Bundle</label>
                    <select 
                      required
                      value={importDraft.bundleId}
                      onChange={(e) => setImportDraft({ ...importDraft, bundleId: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                    >
                      <option value="">Select a shipment bundle...</option>
                      {bundles.filter(b => b.status !== 'received').map(b => (
                        <option key={b.id} value={b.id}>{b.bundleNumber} ({b.carrier} - {b.expectedDate})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button 
                      type="button"
                      onClick={() => setIsAddingOrderToImport(true)}
                      className="flex items-center gap-2 text-[#1a2340] font-bold text-sm hover:underline"
                    >
                      <Plus size={16} />
                      Add Another Order/Style
                    </button>
                  </div>
                </div>

                <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2">
                  {(Object.entries(importDraft.orders) as [string, typeof importDraft.orders[string]][]).map(([oId, orderDraft]) => (
                    <div key={oId} className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Package size={16} className="text-gray-400" />
                          <span className="font-bold text-gray-900">{orderDraft.order.model}</span>
                          <span className="text-xs text-gray-500">#{orderDraft.order.orderNumber}</span>
                        </div>
                        {oId !== orderId && (
                          <button 
                            type="button"
                            onClick={() => removeOrderFromDraft(oId)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        {orderDraft.materials.map(m => (
                          <div 
                            key={m.id} 
                            className={cn(
                              "flex items-center gap-4 p-3 rounded-xl border transition-all",
                              orderDraft.selections[m.id]?.selected 
                                ? "bg-white border-blue-200 shadow-sm" 
                                : "bg-transparent border-transparent opacity-60"
                            )}
                          >
                            <input 
                              type="checkbox"
                              checked={orderDraft.selections[m.id]?.selected || false}
                              onChange={(e) => setImportDraft({
                                ...importDraft,
                                orders: {
                                  ...importDraft.orders,
                                  [oId]: {
                                    ...orderDraft,
                                    selections: {
                                      ...orderDraft.selections,
                                      [m.id]: { ...orderDraft.selections[m.id], selected: e.target.checked }
                                    }
                                  }
                                }
                              })}
                              className="w-4 h-4 rounded border-gray-300 text-[#1a2340] focus:ring-[#1a2340]"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{m.type}</p>
                              <p className="text-[10px] text-gray-500 truncate">{m.composition}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-[8px] font-bold text-gray-400 uppercase">Missing</p>
                                <p className="text-[10px] font-bold text-red-600">{(m.totalRequired - m.totalReceived).toLocaleString()} {m.unit}</p>
                              </div>
                              <div className="w-24">
                                <input 
                                  type="number"
                                  disabled={!orderDraft.selections[m.id]?.selected}
                                  value={orderDraft.selections[m.id]?.quantity || 0}
                                  onChange={(e) => setImportDraft({
                                    ...importDraft,
                                    orders: {
                                      ...importDraft.orders,
                                      [oId]: {
                                        ...orderDraft,
                                        selections: {
                                          ...orderDraft.selections,
                                          [m.id]: { ...orderDraft.selections[m.id], quantity: parseFloat(e.target.value) }
                                        }
                                      }
                                    }
                                  })}
                                  className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a2340] disabled:opacity-50 text-xs font-bold"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsGeneratingImport(false)}
                    className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={!importDraft.bundleId || selectedCount === 0}
                    className="flex-1 px-4 py-3 bg-[#1a2340] text-white font-bold rounded-xl hover:bg-[#2a3a60] transition-colors shadow-lg disabled:opacity-50"
                  >
                    Generate {selectedCount} Import Line{selectedCount !== 1 ? 's' : ''}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Order to Import Modal */}
      <AnimatePresence>
        {isAddingOrderToImport && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <h3 className="text-lg font-bold text-gray-900">Add Order to Import</h3>
                <button onClick={() => setIsAddingOrderToImport(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="text"
                    placeholder="Search orders..."
                    value={orderSearchTerm}
                    onChange={(e) => setOrderSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                  />
                </div>
                <div className="max-h-[300px] overflow-y-auto space-y-2">
                  {allOrders
                    .filter(o => !importDraft.orders[o.id])
                    .filter(o => 
                      o.model.toLowerCase().includes(orderSearchTerm.toLowerCase()) || 
                      o.orderNumber.toLowerCase().includes(orderSearchTerm.toLowerCase()) ||
                      o.client.toLowerCase().includes(orderSearchTerm.toLowerCase())
                    )
                    .map(o => (
                    <button
                      key={o.id}
                      onClick={() => addOrderToDraft(o.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left border border-transparent hover:border-gray-100"
                    >
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                        <Package size={20} className="text-gray-400" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{o.model}</p>
                        <p className="text-xs text-gray-500">#{o.orderNumber} • {o.client}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Material Modal */}
      <AnimatePresence>
        {editingMaterial && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <h3 className="text-xl font-bold text-gray-900">Edit Material</h3>
                <button onClick={() => setEditingMaterial(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
              <form onSubmit={handleUpdateMaterial} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Type</label>
                    <select 
                      value={editingMaterial.type}
                      onChange={(e) => setEditingMaterial({ ...editingMaterial, type: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                    >
                      {['Main Fabric', 'Interlining', 'Lining', 'Buttons', 'Elastic', 'Composition Label', 'Brand Label', 'Size Label', 'Special Label', 'Other'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Unit</label>
                    <select 
                      value={editingMaterial.unit}
                      onChange={(e) => setEditingMaterial({ ...editingMaterial, unit: e.target.value as MaterialUnit })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                    >
                      {['meters', 'units', 'coils'].map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Composition</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g., 100% Cotton, 120gsm"
                    value={editingMaterial.composition}
                    onChange={(e) => setEditingMaterial({ ...editingMaterial, composition: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Consumption per Unit</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      value={editingMaterial.consumptionPerUnit}
                      onChange={(e) => setEditingMaterial({ ...editingMaterial, consumptionPerUnit: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340]"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 uppercase">
                      {editingMaterial.unit} / unit
                    </span>
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-blue-700">Calculated Total Required</span>
                    <span className="text-lg font-black text-blue-900">
                      {(editingMaterial.consumptionPerUnit * order.quantity).toLocaleString()} {editingMaterial.unit}
                    </span>
                  </div>
                  <p className="text-[10px] text-blue-600 mt-1">Based on order quantity: {order.quantity.toLocaleString()}</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Notes</label>
                  <textarea 
                    rows={2}
                    value={editingMaterial.notes || ''}
                    onChange={(e) => setEditingMaterial({ ...editingMaterial, notes: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setEditingMaterial(null)}
                    className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-3 bg-[#1a2340] text-white font-bold rounded-xl hover:bg-[#2a3a60] transition-colors shadow-lg"
                  >
                    Update Material
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>

    {/* Tech Sheet Modal */}
    <AnimatePresence>
        {showTechSheet && order && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto print-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowTechSheet(false);
            }}
          >
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-8 overflow-hidden print:shadow-none print:my-0 print:rounded-none relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button 
                onClick={() => setShowTechSheet(false)}
                className="absolute top-4 right-4 p-2 bg-white/80 hover:bg-gray-100 rounded-full transition-colors z-10 shadow-sm no-print"
                title="Fermer"
              >
                <X size={24} className="text-gray-600" />
              </button>

              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50 no-print">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#1a2340] text-white rounded-lg">
                    <FileText size={20} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Fiche Technique Simplifiée</h3>
                </div>
                <div className="flex items-center gap-3 mr-10">
                  <button 
                    onClick={handleDownloadPDF}
                    disabled={isDownloading}
                    className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-xl font-semibold hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isDownloading ? (
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Download size={18} />
                    )}
                    {isDownloading ? 'Génération...' : 'Télécharger PDF'}
                  </button>
                  <button 
                    onClick={handlePrint}
                    className="flex items-center gap-2 bg-[#1a2340] text-white px-4 py-2 rounded-xl font-semibold hover:bg-[#2a3a60] transition-colors shadow-sm"
                  >
                    <Printer size={18} />
                    Imprimer
                  </button>
                </div>
              </div>

              <div className="p-8 bg-gray-100 print:p-0 overflow-y-auto max-h-[80vh] print:max-h-none">
                <div ref={techSheetRef} className="max-w-[900px] mx-auto bg-white shadow-lg rounded-xl p-10 print:shadow-none print:p-8 tech-sheet-container">
                  <h2 className="text-3xl font-bold text-[#1a2340] text-center mb-10 pb-4 border-b-2 border-gray-100">Fiche Technique Simplifiée</h2>
                  
                  {/* TISSUS Section */}
                  <div className="mb-10 border border-gray-200 rounded-xl">
                    <div className="bg-gray-100 flex justify-center py-2 border-b border-gray-200">
                      <div className="bg-[#1a2340] text-white px-8 py-1 rounded-md text-sm font-bold uppercase tracking-widest">TISSUS</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-0">
                      {/* Left: Order Info */}
                      <div className="md:col-span-4 p-6 space-y-6 border-r border-gray-100">
                        <div className="border-b border-gray-50 pb-2">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Modèle:</p>
                          <p className="text-base font-bold text-gray-900">{order.model}</p>
                        </div>
                        <div className="border-b border-gray-50 pb-2">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Client:</p>
                          <p className="text-base font-bold text-gray-900">{order.client}</p>
                        </div>
                        <div className="pb-2">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Type de Produit:</p>
                          <p className="text-base font-bold text-gray-900">{order.reference}</p>
                        </div>
                      </div>

                      {/* Middle: Fabric Info */}
                      <div className="md:col-span-5 p-6 space-y-6 border-r border-gray-100">
                        {['Main Fabric', 'Lining', 'Interlining'].map(type => {
                          const m = materials.find(mat => mat.type === type);
                          return (
                            <div key={type} className="border-b border-gray-50 pb-2 last:border-0">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                                {type === 'Main Fabric' ? 'Tissu Principal' : type === 'Lining' ? 'Doublure' : 'Entoilage'}:
                              </p>
                              {m ? (
                                <>
                                  <p className="text-sm font-bold text-gray-900">{m.composition}</p>
                                  <p className="text-[10px] text-gray-500 font-medium mt-1">Consommation: {m.consumptionPerUnit} {m.unit} / pièce</p>
                                </>
                              ) : (
                                <p className="text-sm text-gray-300 italic">Non spécifié</p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Right: Image */}
                      <div className="md:col-span-3 p-6 flex items-center justify-center bg-gray-50/30">
                        {order.imageUrl ? (
                          <div className="w-full aspect-[3/4] rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-white">
                            <img 
                              src={order.imageUrl} 
                              alt={order.model} 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ) : (
                          <div className="w-full aspect-[3/4] rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 bg-white">
                            <Package size={32} className="mb-2 opacity-20" />
                            <span className="text-[10px] font-bold uppercase">Aucun Visuel</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ACCESSOIRES Section */}
                  <div className="border border-gray-200 rounded-xl">
                    <div className="bg-gray-100 flex justify-center py-2 border-b border-gray-200">
                      <div className="bg-[#1a2340] text-white px-8 py-1 rounded-md text-sm font-bold uppercase tracking-widest">ACCESSOIRES</div>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {['Buttons', 'Elastic', 'Composition Label', 'Brand Label', 'Size Label', 'Special Label', 'Other'].map(type => {
                          const m = materials.find(mat => mat.type === type);
                          if (!m) return null;
                          return (
                            <div key={m.id} className="text-center p-4 border border-gray-100 rounded-xl bg-gray-50/50 flex flex-col items-center justify-between min-h-[140px]">
                              <div className="w-full">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">{m.type}</p>
                                <div className="h-12 flex items-center justify-center mb-2">
                                  <Package size={24} className="text-gray-300" />
                                </div>
                                <p className="text-xs font-bold text-gray-900 break-words w-full">{m.composition}</p>
                              </div>
                              <p className="text-[10px] text-gray-500 font-medium mt-2">{m.consumptionPerUnit} {m.unit} / pc</p>
                            </div>
                          );
                        })}
                        {materials.filter(m => !['Main Fabric', 'Lining', 'Interlining'].includes(m.type)).length === 0 && (
                          <div className="col-span-full text-center py-10 text-gray-400 italic bg-gray-50 rounded-xl border border-dashed border-gray-200">
                            Aucun accessoire spécifié pour ce modèle.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer Stats */}
                  <div className="mt-12 pt-8 border-t-2 border-gray-100 flex justify-center items-center gap-16">
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Tissu:</p>
                        <p className="text-xl font-black text-[#1a2340]">
                          {materials
                            .filter(m => ['Main Fabric', 'Lining', 'Interlining'].includes(m.type))
                            .reduce((acc, m) => acc + (m.consumptionPerUnit * order.quantity), 0)
                            .toLocaleString()} mètres
                        </p>
                      </div>
                    </div>
                    <div className="w-px h-10 bg-gray-200"></div>
                    <div className="flex items-center gap-3">
                      <div className="text-left">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Quantité:</p>
                        <p className="text-xl font-black text-[#1a2340]">{order.quantity.toLocaleString()} pièces</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OrderDetail;
