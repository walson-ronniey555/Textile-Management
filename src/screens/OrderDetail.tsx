import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { getOrder, subscribeToMaterials, deleteOrder, addMaterial, updateMaterial, deleteMaterial, subscribeToBundles, addImportLine, subscribeToOrders, subscribeToOrderImportLines, syncOrderData, subscribeToSettings, addSettingOption } from '../services/dataService';
import { Order, Material, MaterialUnit, ImportBundle, ImportLine, AppSettings } from '../types';
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
  RefreshCw,
  ChevronRight
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
  const [isSubmittingDeleteOrder, setIsSubmittingDeleteOrder] = useState(false);
  const [isSubmittingDeleteMaterial, setIsSubmittingDeleteMaterial] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState<string | null>(null);
  const [showTechSheet, setShowTechSheet] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSubmittingMaterial, setIsSubmittingMaterial] = useState(false);
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bundles, setBundles] = useState<ImportBundle[]>([]);
  const [importLines, setImportLines] = useState<ImportLine[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const fabricTypes = ['Main Fabric', 'Lining', 'Interlining'];
  const sortedMaterials = React.useMemo(() => {
    return [...materials].sort((a, b) => {
      const aIsFabric = fabricTypes.includes(a.type);
      const bIsFabric = fabricTypes.includes(b.type);
      
      if (aIsFabric && !bIsFabric) return -1;
      if (!aIsFabric && bIsFabric) return 1;
      
      if (aIsFabric && bIsFabric) {
        return fabricTypes.indexOf(a.type) - fabricTypes.indexOf(b.type);
      }
      
      return a.type.localeCompare(b.type);
    });
  }, [materials]);

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
  const [isOtherMaterialType, setIsOtherMaterialType] = useState(false);
  const [otherMaterialTypeValue, setOtherMaterialTypeValue] = useState('');
  const [isOtherEditMaterialType, setIsOtherEditMaterialType] = useState(false);
  const [otherEditMaterialTypeValue, setOtherEditMaterialTypeValue] = useState('');

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
    const unsubscribeSettings = subscribeToSettings(setSettings);

    return () => {
      unsubscribeMaterials();
      unsubscribeBundles();
      unsubscribeAllOrders();
      unsubscribeImportLines();
      unsubscribeSettings();
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
    if (!orderId || isSubmittingDeleteOrder) return;
    
    setIsSubmittingDeleteOrder(true);
    try {
      await deleteOrder(orderId);
      toast.success('Order deleted successfully');
      navigate('/orders');
    } catch (error) {
      console.error('Error deleting order:', error);
      toast.error('Failed to delete order');
    } finally {
      setIsSubmittingDeleteOrder(false);
      setIsDeletingOrder(false);
    }
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || !order || isSubmittingMaterial) return;
    setIsSubmittingMaterial(true);

    try {
      let finalType = newMaterial.type;
      if (isOtherMaterialType && otherMaterialTypeValue.trim()) {
        finalType = otherMaterialTypeValue.trim();
        // Automatically add to settings
        await addSettingOption('materialTypes', finalType);
      }

      const totalRequired = newMaterial.consumptionPerUnit * order.quantity;
      await addMaterial(orderId, {
        ...newMaterial,
        type: finalType,
        totalRequired,
      });

      setIsAddingMaterial(false);
      setIsOtherMaterialType(false);
      setOtherMaterialTypeValue('');
      setNewMaterial({
        type: 'Main Fabric',
        composition: '',
        consumptionPerUnit: 0,
        unit: 'meters',
        notes: ''
      });
      toast.success('Material added successfully');
    } catch (error) {
      console.error('Error adding material:', error);
      toast.error('Failed to add material');
    } finally {
      setIsSubmittingMaterial(false);
    }
  };

  const handleUpdateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || !order || !editingMaterial || isSubmittingMaterial) return;
    setIsSubmittingMaterial(true);

    try {
      let finalType = editingMaterial.type;
      if (isOtherEditMaterialType && otherEditMaterialTypeValue.trim()) {
        finalType = otherEditMaterialTypeValue.trim();
        // Automatically add to settings
        await addSettingOption('materialTypes', finalType);
      }

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
        type: finalType,
        composition: editingMaterial.composition,
        consumptionPerUnit: editingMaterial.consumptionPerUnit,
        unit: editingMaterial.unit,
        notes: editingMaterial.notes,
        totalRequired,
        status: newStatus
      });

      setEditingMaterial(null);
      setIsOtherEditMaterialType(false);
      setOtherEditMaterialTypeValue('');
      toast.success('Material updated successfully');
    } catch (error) {
      console.error('Error updating material:', error);
      toast.error('Failed to update material');
    } finally {
      setIsSubmittingMaterial(false);
    }
  };

  const handleDeleteMaterial = async (materialId: string) => {
    if (!orderId) return;
    setMaterialToDelete(materialId);
    setIsDeletingMaterial(true);
  };

  const confirmDeleteMaterial = async () => {
    if (!orderId || !materialToDelete || isSubmittingDeleteMaterial) return;
    
    setIsSubmittingDeleteMaterial(true);
    try {
      await deleteMaterial(orderId, materialToDelete);
      toast.success('Material deleted successfully');
    } catch (error) {
      console.error('Error deleting material:', error);
      toast.error('Failed to delete material');
    } finally {
      setIsSubmittingDeleteMaterial(false);
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
    if (!importDraft.bundleId || isSubmittingImport) return;

    setIsSubmittingImport(true);
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
        setIsSubmittingImport(false);
        return;
      }

      if (totalLines > 0) {
        toast.success(`${totalLines} import lines generated successfully!${skippedLines > 0 ? ` (${skippedLines} duplicates skipped)` : ''}`, { id: toastId });
        setIsGeneratingImport(false);
        navigate(`/bundles/${importDraft.bundleId}`);
      } else {
        toast.info(`No new lines added. ${skippedLines} duplicates were skipped.`, { id: toastId });
        setIsGeneratingImport(false);
      }
    } catch (error) {
      console.error('Error generating import lines:', error);
      toast.error('Failed to generate import lines.', { id: toastId });
    } finally {
      setIsSubmittingImport(false);
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <Link to="/orders" className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 hover:bg-slate-50 transition-all duration-200">
            <ChevronLeft size={24} className="text-slate-600" />
          </Link>
              <div>
                <div className="flex items-center gap-4">
                  <h1 className="text-4xl font-bold text-slate-900 tracking-tight">{order.model}</h1>
                  <span className={cn(
                    "px-4 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest",
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
                </div>
                <p className="text-slate-500 mt-1 font-bold uppercase tracking-wider text-xs">{order.orderNumber} • {order.client} • {order.reference}</p>
              </div>
        </div>
        {profile && (
          <div className="flex items-center gap-3">
            <button 
              onClick={handleSync}
              disabled={isSyncing}
              className={cn(
                "btn-secondary flex items-center gap-2",
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
                  className="btn-primary flex items-center gap-2"
                >
                  <Truck size={20} />
                  Generate Import
                </button>
                <button 
                  onClick={() => setShowTechSheet(true)}
                  className="btn-secondary flex items-center gap-2"
                >
                  <FileText size={20} />
                  Fiche Technique
                </button>
                <Link 
                  to={`/orders/${orderId}/edit`}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Edit size={20} />
                  Edit
                </Link>
                <button 
                  onClick={() => setIsDeletingOrder(true)}
                  className="flex items-center gap-2 bg-rose-50 text-rose-600 px-5 py-3 rounded-2xl font-bold hover:bg-rose-100 transition-all duration-200 shadow-sm"
                >
                  <Trash2 size={20} />
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
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
        isLoading={isSubmittingDeleteOrder}
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
        isLoading={isSubmittingDeleteMaterial}
      />

      {/* Production Readiness Banner */}
      {order.status === 'ready' && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-50 border border-emerald-100 rounded-[2rem] p-8 mb-8 flex items-center gap-8 shadow-sm"
        >
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center shrink-0 shadow-inner">
            <CheckCircle2 size={40} />
          </div>
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-emerald-900 tracking-tight">Ready for Production</h3>
            <p className="text-emerald-700 font-medium mt-1">All required materials have been received. You can now start the production process for this order.</p>
          </div>
          <div className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-emerald-200">
            100% Ready
          </div>
        </motion.div>
      )}

      {order.status === 'partial' && (order.arrivedPercent || 0) > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-100 rounded-[2rem] p-8 mb-8 flex items-center gap-8 shadow-sm"
        >
          <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center shrink-0 shadow-inner">
            <Truck size={40} />
          </div>
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-amber-900 tracking-tight">Materials Arrived</h3>
            <p className="text-amber-700 font-medium mt-1">
              {order.arrivedPercent}% of materials have arrived at the factory and are pending official receipt. 
              Total availability (Rec + Arr): {Math.min(100, (order.receivedPercent || 0) + (order.arrivedPercent || 0))}%
            </p>
          </div>
          <div className="px-8 py-4 bg-amber-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-amber-200">
            {Math.min(100, (order.receivedPercent || 0) + (order.arrivedPercent || 0))}% Available
          </div>
        </motion.div>
      )}

      {/* Image and Quick Info Grid */}
      <div className="flex flex-col lg:flex-row gap-8">
        {order.imageUrl && (
          <div className="lg:w-1/3">
            <div className="bg-white p-3 rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden aspect-square">
              <img 
                src={order.imageUrl} 
                alt={order.model} 
                className="w-full h-full object-cover rounded-[2rem] transition-transform duration-700 hover:scale-105"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        )}
        <div className={cn("grid grid-cols-2 gap-6 flex-1", order.imageUrl ? "lg:grid-cols-2" : "lg:grid-cols-4")}>
          {[
            { label: 'Quantity', value: order.quantity.toLocaleString(), icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Export Week', value: order.exportWeek, icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Export Date', value: order.exportDate, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Created At', value: order.createdAt.toDate().toLocaleDateString(), icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          ].map((info) => (
            <div key={info.label} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 group hover:border-slate-200 transition-all duration-300">
              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110 shadow-sm", info.bg)}>
                <info.icon size={20} className={info.color} />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{info.label}</p>
              <p className="text-2xl font-bold text-slate-900 tracking-tight mt-1">{info.value}</p>
            </div>
          ))}
        </div>
      </div>
        {/* Tabs */}
      <div className="space-y-8">
        <div className="flex items-center gap-4 border-b border-slate-100 overflow-x-auto no-scrollbar">
          {[
            { id: 'materials', label: 'Materials', icon: Package },
            { id: 'timeline', label: 'Import Timeline', icon: Truck },
            { id: 'export', label: 'Export Plan', icon: Calendar },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-8 py-5 text-sm font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap",
                activeTab === tab.id 
                  ? "border-slate-900 text-slate-900" 
                  : "border-transparent text-slate-400 hover:text-slate-600"
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
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Required Materials</h3>
                {profile?.role === 'admin' && (
                  <button 
                    onClick={() => setIsAddingMaterial(true)}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Plus size={18} />
                    Add Material
                  </button>
                )}
              </div>

              {sortedMaterials.length === 0 ? (
                <div className="bg-white rounded-[2rem] border-2 border-dashed border-slate-100 p-16 text-center">
                  <Package size={40} className="text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No materials added yet.</p>
                </div>
              ) : (
                <div className="card-calm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Composition</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Required</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Received</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Progress</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {sortedMaterials.map((material, index) => {
                          const isFirstFabric = index === 0 && fabricTypes.includes(material.type);
                          const isFirstAccessory = !fabricTypes.includes(material.type) && (index === 0 || fabricTypes.includes(sortedMaterials[index - 1].type));
                          
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
                            <React.Fragment key={material.id}>
                              {isFirstFabric && (
                                <tr className="bg-slate-50/80 border-y border-slate-100">
                                  <td colSpan={7} className="px-8 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Fabrics & Linings
                                  </td>
                                </tr>
                              )}
                              {isFirstAccessory && (
                                <tr className="bg-slate-50/80 border-y border-slate-100">
                                  <td colSpan={7} className="px-8 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Accessories
                                  </td>
                                </tr>
                              )}
                              <tr className={cn(
                                "hover:bg-slate-50/50 transition-all duration-200 group",
                                displayStatus === 'missing' && "bg-rose-50/30",
                                displayStatus === 'partial' && "bg-amber-50/30"
                              )}>
                              <td className="px-8 py-5">
                                <span className="font-bold text-slate-900 text-lg tracking-tight">{material.type}</span>
                              </td>
                              <td className="px-8 py-5">
                                <span className="text-sm text-slate-600 font-bold">{material.composition}</span>
                              </td>
                              <td className="px-8 py-5 text-right">
                                <span className="text-sm font-black text-slate-900">{material.totalRequired.toLocaleString()} {material.unit}</span>
                              </td>
                              <td className="px-8 py-5 text-right">
                                <span className="text-sm font-black text-slate-900">{material.totalReceived.toLocaleString()} {material.unit}</span>
                              </td>
                              <td className="px-8 py-5">
                                <div className="w-48 flex flex-col gap-2">
                                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                                    {/* Received Progress */}
                                    <div 
                                      className="h-full bg-emerald-500 transition-all duration-500 relative group/segment"
                                      style={{ width: `${Math.min(100, (material.totalReceived / material.totalRequired) * 100)}%` }}
                                    >
                                      <div className="absolute inset-0 bg-white/20 opacity-0 group-hover/segment:opacity-100 transition-opacity" />
                                    </div>
                                    {/* Arrived Progress */}
                                    <div 
                                      className="h-full bg-amber-400 transition-all duration-500 relative group/segment"
                                      style={{ width: `${Math.min(100 - (material.totalReceived / material.totalRequired) * 100, (arrivedQty / material.totalRequired) * 100)}%` }}
                                    >
                                      <div className="absolute inset-0 bg-white/20 opacity-0 group-hover/segment:opacity-100 transition-opacity" />
                                    </div>
                                    {/* In Transit Progress */}
                                    <div 
                                      className="h-full bg-blue-400 transition-all duration-500 relative group/segment"
                                      style={{ width: `${Math.min(100 - ((material.totalReceived + arrivedQty) / material.totalRequired) * 100, (inTransitQty / material.totalRequired) * 100)}%` }}
                                    >
                                      <div className="absolute inset-0 bg-white/20 opacity-0 group-hover/segment:opacity-100 transition-opacity" />
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                                    <div className="flex items-center gap-1">
                                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                        {Math.round((material.totalReceived / material.totalRequired) * 100)}% Rec
                                      </span>
                                    </div>
                                    {arrivedQty > 0 && (
                                      <div className="flex items-center gap-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                        <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider">
                                          {Math.round((arrivedQty / material.totalRequired) * 100)}% Arr
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-8 py-5">
                                <div className="flex items-center gap-2">
                                  <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2">
                                      {displayStatus === 'ok' && <CheckCircle2 size={14} className="text-emerald-500" />}
                                      {displayStatus === 'partial' && <Clock size={14} className="text-amber-500" />}
                                      {displayStatus === 'missing' && <AlertTriangle size={14} className="text-rose-500" />}
                                      <span className={cn(
                                        "px-2.5 py-0.5 rounded-xl text-[10px] font-black uppercase tracking-widest w-fit",
                                        displayStatus === 'ok' ? "bg-emerald-100 text-emerald-700" : 
                                        displayStatus === 'partial' ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
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
                                          <span className="text-[9px] text-amber-600 font-black uppercase tracking-wider flex items-center gap-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                            Arrived: {arrivedQty.toLocaleString()}
                                          </span>
                                        )}
                                        {inTransitQty > 0 && (
                                          <span className="text-[9px] text-blue-600 font-black uppercase tracking-wider flex items-center gap-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                            In Transit: {inTransitQty.toLocaleString()}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-8 py-5 text-right">
                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
                                  <button 
                                    onClick={() => setEditingMaterial(material)}
                                    className="p-2.5 text-slate-400 hover:text-slate-900 hover:bg-white rounded-xl transition-all duration-200 shadow-sm"
                                    title="Edit Material"
                                  >
                                    <Edit size={16} />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteMaterial(material.id)}
                                    className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all duration-200 shadow-sm"
                                    title="Delete Material"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          </React.Fragment>
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
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Import Timeline</h3>
              {importLines.length === 0 ? (
                <div className="bg-white rounded-[2rem] border-2 border-dashed border-slate-100 p-16 text-center">
                  <Truck size={40} className="text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No import lines found for this order.</p>
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
                      <div key={line.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between group hover:border-slate-200 transition-all duration-300">
                        <div className="flex items-center gap-6">
                          <div className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm",
                            line.status === 'received' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                          )}>
                            <Truck size={24} />
                          </div>
                          <div>
                            <div className="flex items-center gap-3">
                              <p className="text-lg font-bold text-slate-900 tracking-tight">{line.description}</p>
                              {bundle && (
                                <span className="px-3 py-0.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                  {bundle.bundleNumber}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-1">
                              <span className="text-sm font-bold text-slate-500">{line.quantity} {line.unit}</span>
                              <span className="text-slate-200">•</span>
                              <span className={cn(
                                "text-[10px] font-black uppercase tracking-widest px-3 py-0.5 rounded-xl",
                                line.status === 'received' ? "bg-emerald-100 text-emerald-700" : 
                                bundle?.status === 'arrived' ? "bg-amber-100 text-amber-700" :
                                bundle?.status === 'in_transit' ? "bg-blue-100 text-blue-700" :
                                "bg-slate-100 text-slate-600"
                              )}>
                                {line.status === 'received' ? 'Received' : (bundle?.status?.replace('_', ' ') || 'Pending')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-8">
                          {bundle && (
                            <div className="text-right hidden sm:block">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                {bundle.status === 'arrived' || bundle.status === 'received' ? 'Arrived On' : 'Expected'}
                              </p>
                              <p className="text-sm font-black text-slate-900">
                                {bundle.actualArrivalDate || bundle.expectedDate}
                              </p>
                            </div>
                          )}
                          {line.receivedDate && (
                            <div className="text-right">
                              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Received On</p>
                              <p className="text-sm font-black text-slate-900">{line.receivedDate}</p>
                            </div>
                          )}
                          <Link 
                            to={`/imports/${line.bundleId}`}
                            className="p-3 bg-slate-50 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition-all duration-200 shadow-sm"
                          >
                            <ChevronRight size={20} />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'export' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Export Plan</h3>
              <div className="bg-white p-16 rounded-[2rem] shadow-sm border border-slate-100 text-center">
                <Calendar size={48} className="text-slate-200 mx-auto mb-4" />
                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Export planning features coming soon.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Material Modal */}
      <AnimatePresence>
        {isAddingMaterial && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Add New Material</h3>
                <button onClick={() => setIsAddingMaterial(false)} className="p-3 hover:bg-slate-200 rounded-2xl transition-all duration-200">
                  <X size={24} className="text-slate-500" />
                </button>
              </div>
              <form onSubmit={handleAddMaterial} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Type</label>
                    <select 
                      value={isOtherMaterialType ? 'other' : newMaterial.type}
                      onChange={(e) => {
                        if (e.target.value === 'other') {
                          setIsOtherMaterialType(true);
                        } else {
                          setIsOtherMaterialType(false);
                          setNewMaterial({ ...newMaterial, type: e.target.value });
                        }
                      }}
                      className="input-calm w-full"
                    >
                      {(settings?.materialTypes && settings.materialTypes.length > 0 
                        ? settings.materialTypes 
                        : ['Main Fabric', 'Interlining', 'Lining', 'Buttons', 'Elastic', 'Composition Label', 'Brand Label', 'Size Label', 'Special Label', 'Other']
                      ).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                      <option value="other">Other...</option>
                    </select>
                    
                    {isOtherMaterialType && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="pt-2"
                      >
                        <input 
                          type="text" 
                          required
                          placeholder="Enter new material type"
                          value={otherMaterialTypeValue}
                          onChange={(e) => setOtherMaterialTypeValue(e.target.value)}
                          className="input-calm w-full border-2 border-slate-900"
                        />
                      </motion.div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unit</label>
                    <select 
                      value={newMaterial.unit}
                      onChange={(e) => setNewMaterial({ ...newMaterial, unit: e.target.value as MaterialUnit })}
                      className="input-calm w-full"
                    >
                      {['meters', 'units', 'coils'].map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {fabricTypes.includes(newMaterial.type) && !isOtherMaterialType && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Composition</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g., 100% Cotton, 120gsm"
                      value={newMaterial.composition}
                      onChange={(e) => setNewMaterial({ ...newMaterial, composition: e.target.value })}
                      className="input-calm w-full"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Consumption per Unit</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      value={newMaterial.consumptionPerUnit}
                      onChange={(e) => setNewMaterial({ ...newMaterial, consumptionPerUnit: parseFloat(e.target.value) })}
                      className="input-calm w-full pr-24"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {newMaterial.unit} / unit
                    </span>
                  </div>
                </div>

                <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-blue-700">Calculated Total Required</span>
                    <span className="text-xl font-black text-blue-900">
                      {(newMaterial.consumptionPerUnit * order.quantity).toLocaleString()} {newMaterial.unit}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-blue-600 mt-1 uppercase tracking-widest">Based on order quantity: {order.quantity.toLocaleString()}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Notes</label>
                  <textarea 
                    rows={2}
                    value={newMaterial.notes}
                    onChange={(e) => setNewMaterial({ ...newMaterial, notes: e.target.value })}
                    className="input-calm w-full resize-none"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAddingMaterial(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmittingMaterial}
                    className="btn-primary flex-1"
                  >
                    {isSubmittingMaterial ? (
                      <RefreshCw size={24} className="animate-spin mx-auto" />
                    ) : (
                      'Save Material'
                    )}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-lg shadow-slate-200">
                    <Truck size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Generate Import Lines</h3>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">
                      {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected for import
                    </p>
                  </div>
                </div>
                <button onClick={() => setIsGeneratingImport(false)} className="p-3 hover:bg-slate-200 rounded-2xl transition-all duration-200">
                  <X size={24} className="text-slate-500" />
                </button>
              </div>
              <form onSubmit={handleGenerateImport} className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Target Bundle</label>
                    <select 
                      required
                      value={importDraft.bundleId}
                      onChange={(e) => setImportDraft({ ...importDraft, bundleId: e.target.value })}
                      className="input-calm w-full"
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
                      className="flex items-center gap-2 text-slate-900 font-black text-xs uppercase tracking-widest hover:underline transition-all"
                    >
                      <Plus size={16} />
                      Add Another Order/Style
                    </button>
                  </div>
                </div>

                <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {(Object.entries(importDraft.orders) as [string, typeof importDraft.orders[string]][]).map(([oId, orderDraft]) => (
                    <div key={oId} className="space-y-4 bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Package size={20} className="text-slate-400" />
                          <div>
                            <span className="font-bold text-slate-900 tracking-tight">{orderDraft.order.model}</span>
                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest ml-2">#{orderDraft.order.orderNumber}</span>
                          </div>
                        </div>
                        {oId !== orderId && (
                          <button 
                            type="button"
                            onClick={() => removeOrderFromDraft(oId)}
                            className="text-rose-500 hover:text-rose-700 p-2 hover:bg-rose-50 rounded-xl transition-all"
                          >
                            <X size={20} />
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
                    disabled={!importDraft.bundleId || selectedCount === 0 || isSubmittingImport}
                    className="flex-1 px-4 py-3 bg-[#1a2340] text-white font-bold rounded-xl hover:bg-[#2a3a60] transition-colors shadow-lg disabled:opacity-50"
                  >
                    {isSubmittingImport ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                    ) : (
                      `Generate ${selectedCount} Import Line${selectedCount !== 1 ? 's' : ''}`
                    )}
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
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-100"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">Add Order to Import</h3>
                <button onClick={() => setIsAddingOrderToImport(false)} className="p-3 hover:bg-slate-200 rounded-2xl transition-all duration-200">
                  <X size={24} className="text-slate-500" />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input 
                    type="text"
                    placeholder="Search orders..."
                    value={orderSearchTerm}
                    onChange={(e) => setOrderSearchTerm(e.target.value)}
                    className="input-calm w-full pl-12"
                  />
                </div>
                <div className="max-h-[300px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
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
                      className="w-full flex items-center gap-4 p-4 rounded-[1.5rem] hover:bg-slate-50 transition-all text-left border border-transparent hover:border-slate-100 group"
                    >
                      <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-white group-hover:shadow-sm transition-all">
                        <Package size={24} className="text-slate-400" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 tracking-tight">{o.model}</p>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">#{o.orderNumber} • {o.client}</p>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Edit Material</h3>
                <button onClick={() => setEditingMaterial(null)} className="p-3 hover:bg-slate-200 rounded-2xl transition-all duration-200">
                  <X size={24} className="text-slate-500" />
                </button>
              </div>
              <form onSubmit={handleUpdateMaterial} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Type</label>
                    <select 
                      value={isOtherEditMaterialType ? 'other' : editingMaterial.type}
                      onChange={(e) => {
                        if (e.target.value === 'other') {
                          setIsOtherEditMaterialType(true);
                        } else {
                          setIsOtherEditMaterialType(false);
                          setEditingMaterial({ ...editingMaterial, type: e.target.value });
                        }
                      }}
                      className="input-calm w-full"
                    >
                      {(settings?.materialTypes && settings.materialTypes.length > 0 
                        ? settings.materialTypes 
                        : ['Main Fabric', 'Interlining', 'Lining', 'Buttons', 'Elastic', 'Composition Label', 'Brand Label', 'Size Label', 'Special Label', 'Other']
                      ).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                      <option value="other">Other...</option>
                    </select>
                    
                    {isOtherEditMaterialType && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="pt-2"
                      >
                        <input 
                          type="text" 
                          required
                          placeholder="Enter new material type"
                          value={otherEditMaterialTypeValue}
                          onChange={(e) => setOtherEditMaterialTypeValue(e.target.value)}
                          className="input-calm w-full border-2 border-slate-900"
                        />
                      </motion.div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unit</label>
                    <select 
                      value={editingMaterial.unit}
                      onChange={(e) => setEditingMaterial({ ...editingMaterial, unit: e.target.value as MaterialUnit })}
                      className="input-calm w-full"
                    >
                      {['meters', 'units', 'coils'].map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {fabricTypes.includes(editingMaterial.type) && !isOtherEditMaterialType && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Composition</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g., 100% Cotton, 120gsm"
                      value={editingMaterial.composition}
                      onChange={(e) => setEditingMaterial({ ...editingMaterial, composition: e.target.value })}
                      className="input-calm w-full"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Consumption per Unit</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      value={editingMaterial.consumptionPerUnit}
                      onChange={(e) => setEditingMaterial({ ...editingMaterial, consumptionPerUnit: parseFloat(e.target.value) })}
                      className="input-calm w-full pr-24"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {editingMaterial.unit} / unit
                    </span>
                  </div>
                </div>

                <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-blue-700">Calculated Total Required</span>
                    <span className="text-xl font-black text-blue-900">
                      {(editingMaterial.consumptionPerUnit * order.quantity).toLocaleString()} {editingMaterial.unit}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-blue-600 mt-1 uppercase tracking-widest">Based on order quantity: {order.quantity.toLocaleString()}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Notes</label>
                  <textarea 
                    rows={2}
                    value={editingMaterial.notes || ''}
                    onChange={(e) => setEditingMaterial({ ...editingMaterial, notes: e.target.value })}
                    className="input-calm w-full resize-none"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setEditingMaterial(null)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmittingMaterial}
                    className="btn-primary flex-1"
                  >
                    {isSubmittingMaterial ? (
                      <RefreshCw size={24} className="animate-spin mx-auto" />
                    ) : (
                      'Update Material'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
