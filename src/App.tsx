/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './screens/Login';
import Dashboard from './screens/Dashboard';
import Orders from './screens/Orders';
import OrderDetail from './screens/OrderDetail';
import NewOrder from './screens/NewOrder';
import EditOrder from './screens/EditOrder';
import ImportBundles from './screens/ImportBundles';
import BundleDetail from './screens/BundleDetail';
import NewBundle from './screens/NewBundle';
import ExportPlanScreen from './screens/ExportPlan';
import Notifications from './screens/Notifications';
import Settings from './screens/Settings';
import { Toaster } from 'sonner';

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" richColors />
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            
            {/* Orders */}
            <Route path="/orders" element={<ProtectedRoute allowedRoles={['admin', 'factory']}><Orders /></ProtectedRoute>} />
            <Route path="/orders/new" element={<ProtectedRoute allowedRoles={['admin']}><NewOrder /></ProtectedRoute>} />
            <Route path="/orders/:orderId" element={<ProtectedRoute allowedRoles={['admin', 'factory']}><OrderDetail /></ProtectedRoute>} />
            <Route path="/orders/:orderId/edit" element={<ProtectedRoute allowedRoles={['admin']}><EditOrder /></ProtectedRoute>} />
            
            {/* Bundles */}
            <Route path="/bundles" element={<ProtectedRoute allowedRoles={['admin', 'supplier']}><ImportBundles /></ProtectedRoute>} />
            <Route path="/bundles/new" element={<ProtectedRoute allowedRoles={['admin']}><NewBundle /></ProtectedRoute>} />
            <Route path="/bundles/:bundleId" element={<ProtectedRoute allowedRoles={['admin', 'supplier']}><BundleDetail /></ProtectedRoute>} />
            
            {/* Export Plan */}
            <Route path="/export-plan" element={<ProtectedRoute allowedRoles={['admin', 'boss']}><ExportPlanScreen /></ProtectedRoute>} />
            
            {/* Notifications */}
            <Route path="/notifications" element={<Notifications />} />
            
            {/* Settings */}
            <Route path="/settings" element={<ProtectedRoute allowedRoles={['admin']}><Settings /></ProtectedRoute>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
