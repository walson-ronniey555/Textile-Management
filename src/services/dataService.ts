import { 
  db, 
  collection, 
  collectionGroup,
  doc, 
  getDoc, 
  getDocs,
  updateDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  Timestamp, 
  writeBatch,
  increment,
  deleteField,
  getDocFromServer,
  getDocsFromServer,
  OperationType,
  handleFirestoreError
} from '../firebase';
import { 
  Order, 
  Material, 
  ImportBundle, 
  ImportLine, 
  ExportPlan, 
  Notification, 
  UserRole, 
  OrderStatus, 
  MaterialStatus,
  ImportLineStatus,
  BundleStatus
} from '../types';

// Orders
export const checkOrderExists = async (orderNumber: string, excludeOrderId?: string) => {
  try {
    const q = query(collection(db, 'orders'), where('orderNumber', '==', orderNumber));
    const snapshot = await getDocs(q);
    if (excludeOrderId) {
      return snapshot.docs.some(doc => doc.id !== excludeOrderId);
    }
    return !snapshot.empty;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'orders');
    return false;
  }
};

export const subscribeToOrders = (callback: (orders: Order[]) => void) => {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
    callback(orders);
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'orders'));
};

export const getOrder = async (orderId: string) => {
  try {
    const docRef = doc(db, 'orders', orderId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Order;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `orders/${orderId}`);
  }
};

export const createOrder = async (orderData: Omit<Order, 'id' | 'status' | 'createdAt'>) => {
  try {
    const newOrder = {
      ...orderData,
      status: 'blocked' as OrderStatus,
      createdAt: Timestamp.now(),
    };
    const docRef = await addDoc(collection(db, 'orders'), newOrder);
    const orderId = docRef.id;
    await syncExportPlan(orderId, { id: orderId, ...newOrder } as Order);
    return orderId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'orders');
  }
};

export const updateOrder = async (orderId: string, data: Partial<Order>) => {
  try {
    const docRef = doc(db, 'orders', orderId);
    await updateDoc(docRef, data);
    
    // If quantity changed, we need to update all materials' totalRequired
    if (data.quantity !== undefined) {
      console.log(`Order ${orderId} quantity changed to ${data.quantity}. Updating materials...`);
      const materialsRef = collection(db, 'orders', orderId, 'materials');
      const materialsSnap = await getDocs(materialsRef);
      const batch = writeBatch(db);
      
      for (const mDoc of materialsSnap.docs) {
        const mData = mDoc.data() as Material;
        const newTotalRequired = (mData.consumptionPerUnit || 0) * data.quantity;
        batch.update(mDoc.ref, {
          totalRequired: newTotalRequired
        });
      }
      
      await batch.commit();
      
      // Recalculate status for each material
      for (const mDoc of materialsSnap.docs) {
        await recalculateMaterialStatus(orderId, mDoc.id);
      }
    } else {
      // Sync export plan after update if quantity didn't change (if it did, recalculateMaterialStatus already triggered updates)
      const updatedOrder = await getOrder(orderId);
      if (updatedOrder) {
        await syncExportPlan(orderId, updatedOrder);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
};

export const toggleOrderArchive = async (orderId: string, isArchived: boolean) => {
  try {
    const docRef = doc(db, 'orders', orderId);
    await updateDoc(docRef, { isArchived });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
};

export const deleteOrder = async (orderId: string) => {
  try {
    await deleteDoc(doc(db, 'orders', orderId));
    await syncExportPlan(orderId, null);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `orders/${orderId}`);
  }
};

// Materials
export const subscribeToMaterials = (orderId: string, callback: (materials: Material[]) => void) => {
  const q = collection(db, 'orders', orderId, 'materials');
  return onSnapshot(q, (snapshot) => {
    const materials = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Material));
    callback(materials);
  }, (error) => handleFirestoreError(error, OperationType.LIST, `orders/${orderId}/materials`));
};

export const addMaterial = async (orderId: string, materialData: Omit<Material, 'id' | 'totalReceived' | 'status' | 'linkedImportLines'>) => {
  try {
    const newMaterial = {
      ...materialData,
      totalReceived: 0,
      totalArrived: 0,
      status: 'missing' as MaterialStatus,
      linkedImportLines: [],
    };
    const docRef = await addDoc(collection(db, 'orders', orderId, 'materials'), newMaterial);
    await recalculateMaterialStatus(orderId, docRef.id);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `orders/${orderId}/materials`);
  }
};

export const updateMaterial = async (orderId: string, materialId: string, data: Partial<Material>) => {
  try {
    const docRef = doc(db, 'orders', orderId, 'materials', materialId);
    await updateDoc(docRef, data);
    await recalculateMaterialStatus(orderId, materialId);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}/materials/${materialId}`);
  }
};

export const deleteMaterial = async (orderId: string, materialId: string) => {
  try {
    const docRef = doc(db, 'orders', orderId, 'materials', materialId);
    await deleteDoc(docRef);
    await recalculateOrderStatus(orderId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `orders/${orderId}/materials/${materialId}`);
  }
};

// Import Bundles
export const subscribeToBundles = (callback: (bundles: ImportBundle[]) => void) => {
  const q = query(collection(db, 'importBundles'), orderBy('expectedDate', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const bundles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ImportBundle));
    callback(bundles);
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'importBundles'));
};

export const createBundle = async (bundleData: Omit<ImportBundle, 'id' | 'status' | 'createdAt' | 'lineCount'>) => {
  try {
    const newBundle = {
      ...bundleData,
      status: 'waiting_delivery' as any,
      lineCount: 0,
      createdAt: Timestamp.now(),
    };
    const docRef = await addDoc(collection(db, 'importBundles'), newBundle);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'importBundles');
  }
};

export const getBundle = async (bundleId: string) => {
  try {
    const docRef = doc(db, 'importBundles', bundleId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as ImportBundle;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `importBundles/${bundleId}`);
  }
};

export const updateBundleStatus = async (bundleId: string, newStatus: BundleStatus, arrivedDate?: string) => {
  try {
    const bundleRef = doc(db, 'importBundles', bundleId);
    const bundleSnap = await getDoc(bundleRef);
    if (!bundleSnap.exists()) throw new Error('Bundle not found');
    const bundleData = { id: bundleSnap.id, ...bundleSnap.data() } as ImportBundle;
    const oldStatus = bundleData.status;

    const batch = writeBatch(db);
    const updateData: any = { status: newStatus };
    if (newStatus === 'arrived' && arrivedDate) {
      updateData.actualArrivalDate = arrivedDate;
    } else if (newStatus !== 'received' && newStatus !== 'arrived') {
      // If moving back from arrived to something else, clear the date
      updateData.actualArrivalDate = deleteField();
    }
    batch.update(bundleRef, updateData);

    const affected = new Set<string>(); // "orderId:materialId"

    // Fetch all lines in the bundle to update material summary fields
    const linesRef = collection(db, 'importBundles', bundleId, 'lines');
    const linesSnap = await getDocsFromServer(linesRef);
    const lines = linesSnap.docs.map(d => ({ id: d.id, ...d.data() } as ImportLine));

    for (const line of lines) {
      affected.add(`${line.linkedOrderId}:${line.linkedMaterialId}`);
      const materialRef = doc(db, 'orders', line.linkedOrderId, 'materials', line.linkedMaterialId);
      
      const updates: any = {};

      // Handle 'arrived' status changes (only for pending lines)
      if (line.status === 'pending') {
        if (oldStatus !== 'arrived' && newStatus === 'arrived') {
          updates.totalArrived = increment(line.quantity);
        } else if (oldStatus === 'arrived' && newStatus !== 'arrived' && newStatus !== 'received') {
          // If it was arrived and now it's NOT arrived and NOT received, decrement
          updates.totalArrived = increment(-line.quantity);
        }
      }

      // Handle 'received' status changes
      if (newStatus === 'received' && oldStatus !== 'received') {
        if (line.status === 'pending') {
          // Mark line as received
          const lineRef = doc(db, 'importBundles', bundleId, 'lines', line.id);
          batch.update(lineRef, {
            status: 'received',
            receivedDate: new Date().toISOString().split('T')[0]
          });

          updates.totalReceived = increment(line.quantity);
          updates.pendingImportCount = increment(-1);
          
          // If it was arrived, decrement totalArrived
          if (oldStatus === 'arrived') {
            updates.totalArrived = increment(-line.quantity);
          }
        }
      } else if (oldStatus === 'received' && newStatus !== 'received') {
        if (line.status === 'received') {
          // This is a revert from received
          const lineRef = doc(db, 'importBundles', bundleId, 'lines', line.id);
          batch.update(lineRef, {
            status: 'pending',
            receivedDate: deleteField()
          });

          updates.totalReceived = increment(-line.quantity);
          updates.pendingImportCount = increment(1);

          // If moving to arrived, increment totalArrived
          if (newStatus === 'arrived') {
            updates.totalArrived = increment(line.quantity);
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        batch.update(materialRef, updates);
      }
    }

    await batch.commit();

    // Recalculate statuses for all affected orders/materials
    for (const pair of affected) {
      const [orderId, materialId] = pair.split(':');
      console.log(`Triggering recalculation for Order: ${orderId}, Material: ${materialId}`);
      await recalculateMaterialStatus(orderId, materialId);
    }
  } catch (error) {
    console.error('Error updating bundle status:', error);
    handleFirestoreError(error, OperationType.UPDATE, `importBundles/${bundleId}`);
  }
};

// Import Lines
export const subscribeToBundleLines = (bundleId: string, callback: (lines: ImportLine[]) => void) => {
  const q = collection(db, 'importBundles', bundleId, 'lines');
  return onSnapshot(q, (snapshot) => {
    const lines = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ImportLine));
    callback(lines);
  }, (error) => handleFirestoreError(error, OperationType.LIST, `importBundles/${bundleId}/lines`));
};

export const subscribeToOrderImportLines = (orderId: string, callback: (lines: ImportLine[]) => void) => {
  const q = query(collectionGroup(db, 'lines'), where('linkedOrderId', '==', orderId));
  return onSnapshot(q, (snapshot) => {
    const lines = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ImportLine));
    callback(lines);
  }, (error) => handleFirestoreError(error, OperationType.LIST, `order/${orderId}/importLines`));
};

export const addImportLine = async (bundleId: string, lineData: Omit<ImportLine, 'id' | 'status'>) => {
  try {
    const batch = writeBatch(db);
    
    // 1. Add the line
    const newLine = {
      ...lineData,
      bundleId,
      status: 'pending' as ImportLineStatus,
    };
    const lineRef = doc(collection(db, 'importBundles', bundleId, 'lines'));
    batch.set(lineRef, newLine);

    // 2. Increment bundle lineCount
    const bundleRef = doc(db, 'importBundles', bundleId);
    batch.update(bundleRef, { lineCount: increment(1) });

    // 3. Update material summary fields
    const materialRef = doc(db, 'orders', lineData.linkedOrderId, 'materials', lineData.linkedMaterialId);
    const bundleSnap = await getDocFromServer(bundleRef);
    const isArrived = bundleSnap.exists() && (bundleSnap.data() as ImportBundle).status === 'arrived';
    
    batch.update(materialRef, {
      totalPlanned: increment(lineData.quantity),
      totalArrived: isArrived ? increment(lineData.quantity) : increment(0),
      pendingImportCount: increment(1)
    });

    await batch.commit();

    // 3. Recalculate material status
    await recalculateMaterialStatus(lineData.linkedOrderId, lineData.linkedMaterialId);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `importBundles/${bundleId}/lines`);
  }
};

export const deleteImportLine = async (bundleId: string, lineId: string) => {
  try {
    // Get line data first to know which material to recalculate
    const lineRef = doc(db, 'importBundles', bundleId, 'lines', lineId);
    const lineSnap = await getDoc(lineRef);
    if (!lineSnap.exists()) return;
    const lineData = lineSnap.data() as ImportLine;

    const batch = writeBatch(db);
    
    // 1. Delete the line
    batch.delete(lineRef);

    // 2. Decrement bundle lineCount
    const bundleRef = doc(db, 'importBundles', bundleId);
    batch.update(bundleRef, { lineCount: increment(-1) });

    // 3. Update material summary fields
    const materialRef = doc(db, 'orders', lineData.linkedOrderId, 'materials', lineData.linkedMaterialId);
    const bundleSnap = await getDocFromServer(bundleRef);
    const isArrived = bundleSnap.exists() && (bundleSnap.data() as ImportBundle).status === 'arrived';
    
    const updates: any = {
      totalPlanned: increment(-lineData.quantity),
      pendingImportCount: lineData.status === 'pending' ? increment(-1) : increment(0)
    };

    if (lineData.status === 'received') {
      updates.totalReceived = increment(-lineData.quantity);
    } else if (isArrived) {
      updates.totalArrived = increment(-lineData.quantity);
    }

    batch.update(materialRef, updates);

    await batch.commit();

    // 3. Recalculate material status
    await recalculateMaterialStatus(lineData.linkedOrderId, lineData.linkedMaterialId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `importBundles/${bundleId}/lines/${lineId}`);
  }
};

export const updateImportLine = async (bundleId: string, lineId: string, updates: Partial<ImportLine>) => {
  try {
    const lineRef = doc(db, 'importBundles', bundleId, 'lines', lineId);
    const lineSnap = await getDoc(lineRef);
    if (!lineSnap.exists()) return;
    const oldLine = lineSnap.data() as ImportLine;

    const batch = writeBatch(db);
    
    // 1. Update the line
    batch.update(lineRef, updates);

    // 2. If quantity changed, update material summary
    if (updates.quantity !== undefined && updates.quantity !== oldLine.quantity) {
      const diff = updates.quantity - oldLine.quantity;
      const materialRef = doc(db, 'orders', oldLine.linkedOrderId, 'materials', oldLine.linkedMaterialId);
      const bundleRef = doc(db, 'importBundles', bundleId);
      const bundleSnap = await getDocFromServer(bundleRef);
      const isArrived = bundleSnap.exists() && (bundleSnap.data() as ImportBundle).status === 'arrived';

      const matUpdates: any = {
        totalPlanned: increment(diff)
      };

      if (oldLine.status === 'received') {
        matUpdates.totalReceived = increment(diff);
      } else if (isArrived) {
        matUpdates.totalArrived = increment(diff);
      }

      batch.update(materialRef, matUpdates);
    }

    await batch.commit();

    // 3. Recalculate material status
    await recalculateMaterialStatus(oldLine.linkedOrderId, oldLine.linkedMaterialId);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `importBundles/${bundleId}/lines/${lineId}`);
  }
};

// Auto-calculation logic

const recalculateMaterialStatus = async (orderId: string, materialId: string, orderData?: Order) => {
  try {
    console.log(`Recalculating Material Status: Order ${orderId}, Material ${materialId}`);
    const materialRef = doc(db, 'orders', orderId, 'materials', materialId);
    
    // Use getDocFromServer to bypass local cache and ensure we see the latest increment
    const materialSnap = await getDocFromServer(materialRef);
    if (!materialSnap.exists()) {
      console.warn(`Material ${materialId} not found in order ${orderId}`);
      return;
    }
    const materialData = materialSnap.data() as Material;

    // SELF-HEALING: Recalculate totalRequired based on current order quantity
    let currentOrderData = orderData;
    if (!currentOrderData) {
      const orderSnap = await getDocFromServer(doc(db, 'orders', orderId));
      if (orderSnap.exists()) {
        currentOrderData = { id: orderSnap.id, ...orderSnap.data() } as Order;
      }
    }

    let correctTotalRequired = materialData.totalRequired || 0;
    if (currentOrderData) {
      correctTotalRequired = (materialData.consumptionPerUnit || 0) * (currentOrderData.quantity || 0);
      if (Math.abs(correctTotalRequired - (materialData.totalRequired || 0)) > 0.001) {
        console.log(`  Material ${materialId}: Self-healing totalRequired from ${materialData.totalRequired} to ${correctTotalRequired}`);
      }
    }

    // Fetch all import lines for this material across all bundles
    let allLines: ImportLine[] = [];
    try {
      const q = query(collectionGroup(db, 'lines'), where('linkedMaterialId', '==', materialId));
      const allLinesSnap = await getDocsFromServer(q);
      allLines = allLinesSnap.docs.map(d => ({ id: d.id, ...d.data() } as ImportLine));
      console.log(`  Material ${materialId}: Found ${allLines.length} lines via collectionGroup`);
    } catch (err) {
      console.warn(`  Material ${materialId}: collectionGroup failed, using fallback:`, err);
    }

    // FALLBACK: If collectionGroup returned 0 lines, try manual scan
    if (allLines.length === 0) {
      console.log(`  Material ${materialId}: collectionGroup returned 0, performing manual scan fallback...`);
      try {
        const bundlesSnap = await getDocsFromServer(collection(db, 'importBundles'));
        for (const bundleDoc of bundlesSnap.docs) {
          const linesSnap = await getDocsFromServer(collection(db, 'importBundles', bundleDoc.id, 'lines'));
          const bundleLines = linesSnap.docs.map(d => ({ id: d.id, ...d.data() } as ImportLine));
          const matchedLines = bundleLines.filter(l => l.linkedMaterialId === materialId);
          if (matchedLines.length > 0) {
            allLines = [...allLines, ...matchedLines];
          }
        }
        console.log(`  Material ${materialId}: Found ${allLines.length} lines via manual scan fallback`);
      } catch (fallbackErr) {
        console.error(`  Material ${materialId}: Manual scan fallback failed:`, fallbackErr);
      }
    }

    // Fetch relevant bundles to check statuses
    const bundleIds = Array.from(new Set(allLines.map(l => l.bundleId))).filter(id => !!id);
    let bundles: ImportBundle[] = [];
    if (bundleIds.length > 0) {
      for (let i = 0; i < bundleIds.length; i += 10) {
        const chunk = bundleIds.slice(i, i + 10);
        const bundlesQ = query(collection(db, 'importBundles'), where('__name__', 'in', chunk));
        const bundlesSnap = await getDocsFromServer(bundlesQ);
        bundles = [...bundles, ...bundlesSnap.docs.map(d => ({ id: d.id, ...d.data() } as ImportBundle))];
      }
    }

    const totalArrived = allLines
      .filter(l => l.status === 'pending' && bundles.find(b => b.id === l.bundleId)?.status === 'arrived')
      .reduce((sum, l) => sum + Number(l.quantity || 0), 0);
    
    const totalReceived = allLines
      .filter(l => l.status === 'received')
      .reduce((sum, l) => sum + Number(l.quantity || 0), 0);
    
    const totalPlanned = allLines.reduce((sum, l) => sum + Number(l.quantity || 0), 0);
    const hasPendingImport = allLines.some(l => l.status === 'pending');
    const pendingImportCount = allLines.filter(l => l.status === 'pending').length;

    console.log(`  Material ${materialId}: Recalculated - Received=${totalReceived}, Arrived=${totalArrived}, Planned=${totalPlanned}, PendingCount=${pendingImportCount}`);

    // Use a small epsilon for floating point comparison
    const EPSILON = 0.001;
    // If requirement is 0, it's considered fully received
    const isFullyReceived = correctTotalRequired <= EPSILON || totalReceived >= (correctTotalRequired - EPSILON);
    const isPartiallyReceived = totalReceived > EPSILON && !isFullyReceived;

    let newStatus: MaterialStatus = 'missing';
    if (isFullyReceived) {
      newStatus = 'ok';
    } else if (hasPendingImport || isPartiallyReceived || totalArrived > EPSILON) {
      newStatus = 'partial';
    } else {
      newStatus = 'missing';
    }

    await updateDoc(materialRef, { 
      status: newStatus,
      totalArrived,
      totalReceived,
      totalPlanned,
      pendingImportCount,
      totalRequired: correctTotalRequired
    });
    
    await recalculateOrderStatus(orderId);
  } catch (error) {
    console.error('Error recalculating material status:', error);
  }
};

export const syncAllData = async () => {
  try {
    console.log('Starting full data sync...');
    const ordersSnap = await getDocsFromServer(collection(db, 'orders'));
    for (const orderDoc of ordersSnap.docs) {
      const orderData = { id: orderDoc.id, ...orderDoc.data() } as Order;
      const materialsRef = collection(db, 'orders', orderDoc.id, 'materials');
      const materialsSnap = await getDocsFromServer(materialsRef);
      for (const materialDoc of materialsSnap.docs) {
        await recalculateMaterialStatus(orderDoc.id, materialDoc.id, orderData);
      }
    }
    console.log('Full data sync completed.');
  } catch (error) {
    console.error('Error syncing all data:', error);
    throw error;
  }
};

export const syncOrderData = async (orderId: string) => {
  try {
    console.log(`Syncing data for Order ${orderId}...`);
    const orderSnap = await getDocFromServer(doc(db, 'orders', orderId));
    if (!orderSnap.exists()) return;
    const orderData = { id: orderSnap.id, ...orderSnap.data() } as Order;
    
    const materialsRef = collection(db, 'orders', orderId, 'materials');
    const materialsSnap = await getDocsFromServer(materialsRef);
    for (const materialDoc of materialsSnap.docs) {
      await recalculateMaterialStatus(orderId, materialDoc.id, orderData);
    }
    console.log(`Order ${orderId} sync completed.`);
  } catch (error) {
    console.error(`Error syncing order ${orderId}:`, error);
    throw error;
  }
};

const recalculateOrderStatus = async (orderId: string) => {
  try {
    console.log(`Recalculating Order Status: ${orderId}`);
    const materialsRef = collection(db, 'orders', orderId, 'materials');
    
    // Use getDocsFromServer to ensure we read the latest material summary fields
    const snapshot = await getDocsFromServer(materialsRef);
    const materials = snapshot.docs.map(d => d.data() as Material);
    
    if (materials.length === 0) {
      console.log(`No materials for order ${orderId}, skipping status update`);
      return;
    }

    // Calculate percentages
    const totalRequired = materials.reduce((sum, m) => {
      const val = Number(m.totalRequired || 0);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
    
    const totalReceived = materials.reduce((sum, m) => {
      const val = Number(m.totalReceived || 0);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
    
    const totalArrived = materials.reduce((sum, m) => {
      const val = Number(m.totalArrived || 0);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);

    const totalPlanned = materials.reduce((sum, m) => {
      const val = Number(m.totalPlanned || 0);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);

    console.log(`Order ${orderId} Totals: Required=${totalRequired}, Received=${totalReceived}, Arrived=${totalArrived}, Planned=${totalPlanned}`);
    
    // Log individual material statuses for debugging
    materials.forEach(m => {
      console.log(`  Material Status: ${m.status}, Req=${m.totalRequired}, Rec=${m.totalReceived}, Arr=${m.totalArrived}, Plan=${m.totalPlanned}`);
    });

    let receivedPercent = 0;
    let arrivedPercent = 0;
    let plannedPercent = 0;
    
    if (totalRequired > 0) {
      receivedPercent = Math.round((totalReceived / totalRequired) * 100);
      arrivedPercent = Math.round((totalArrived / totalRequired) * 100);
      plannedPercent = Math.round((totalPlanned / totalRequired) * 100);
    }
    
    // Final safety check for NaN
    receivedPercent = isNaN(receivedPercent) ? 0 : receivedPercent;
    arrivedPercent = isNaN(arrivedPercent) ? 0 : arrivedPercent;
    plannedPercent = isNaN(plannedPercent) ? 0 : plannedPercent;

    let newOrderStatus: OrderStatus = 'blocked';
    const allOk = materials.every(m => m.status === 'ok');
    const anyOkOrPartial = materials.some(m => m.status === 'ok' || m.status === 'partial');
    const allMissing = materials.every(m => m.status === 'missing');

    if (allOk && materials.length > 0) {
      newOrderStatus = 'ready';
    } else if (anyOkOrPartial) {
      newOrderStatus = 'partial';
    } else if (allMissing) {
      newOrderStatus = 'blocked';
    }

    console.log(`Updating Order ${orderId}: Status=${newOrderStatus}, Rec%=${receivedPercent}, Arr%=${arrivedPercent}, Plan%=${plannedPercent}`);
    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);
    const oldStatus = orderSnap.data()?.status;

    await updateDoc(orderRef, { 
      status: newOrderStatus,
      receivedPercent,
      arrivedPercent,
      plannedPercent
    });

    if (oldStatus !== 'ready' && newOrderStatus === 'ready') {
      const orderData = orderSnap.data() as Order;
      await createNotification({
        type: 'order_ready',
        message: `Order ${orderData.model} is now ready to produce`,
        orderId,
        isRead: false,
        createdAt: Timestamp.now(),
        targetRoles: ['admin', 'factory']
      });
    }
  } catch (error) {
    console.error('Error recalculating order status:', error);
  }
};

export const syncExportPlan = async (orderId: string, orderData: Order | null) => {
  try {
    const q = query(collection(db, 'exportPlan'), where('orderId', '==', orderId));
    const snapshot = await getDocs(q);
    
    if (!orderData) {
      // Delete existing plans if order is deleted
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      return;
    }

    const planData: Omit<ExportPlan, 'id'> = {
      orderId: orderId,
      orderNumber: orderData.orderNumber,
      week: orderData.exportWeek,
      weekDate: orderData.exportDate,
      plannedQty: orderData.quantity,
      exportedQty: 0,
      remaining: orderData.quantity,
      channel: orderData.client
    };

    if (snapshot.empty) {
      await addDoc(collection(db, 'exportPlan'), planData);
    } else {
      // Update existing plan
      const planDoc = snapshot.docs[0];
      const existingData = planDoc.data() as ExportPlan;
      await updateDoc(planDoc.ref, {
        ...planData,
        exportedQty: existingData.exportedQty || 0,
        remaining: planData.plannedQty - (existingData.exportedQty || 0)
      });
    }
  } catch (error) {
    console.error('Error syncing export plan:', error);
  }
};

// Export Plan
export const subscribeToExportPlan = (callback: (plans: ExportPlan[]) => void) => {
  const q = query(collection(db, 'exportPlan'), orderBy('week', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExportPlan));
    callback(plans);
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'exportPlan'));
};

export const updateExportedQty = async (planId: string, exportedQty: number) => {
  try {
    const docRef = doc(db, 'exportPlan', planId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;
    const data = docSnap.data() as ExportPlan;
    const remaining = data.plannedQty - exportedQty;
    await updateDoc(docRef, { exportedQty, remaining });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `exportPlan/${planId}`);
  }
};

// Notifications
export const subscribeToNotifications = (roles: UserRole[], callback: (notifications: Notification[]) => void) => {
  const q = query(
    collection(db, 'notifications'), 
    where('targetRoles', 'array-contains-any', roles),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
    callback(notifications);
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'notifications'));
};

export const markNotificationAsRead = async (notificationId: string) => {
  try {
    const docRef = doc(db, 'notifications', notificationId);
    await updateDoc(docRef, { isRead: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
};

export const createNotification = async (notification: Omit<Notification, 'id'>) => {
  try {
    await addDoc(collection(db, 'notifications'), notification);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'notifications');
  }
};
