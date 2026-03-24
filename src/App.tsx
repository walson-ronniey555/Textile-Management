/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
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
import { Toaster } from 'sonner';

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" richColors />
      <Router>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            
            {/* Orders */}
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/new" element={<NewOrder />} />
            <Route path="/orders/:orderId" element={<OrderDetail />} />
            <Route path="/orders/:orderId/edit" element={<EditOrder />} />
            
            {/* Bundles */}
            <Route path="/bundles" element={<ImportBundles />} />
            <Route path="/bundles/new" element={<NewBundle />} />
            <Route path="/bundles/:bundleId" element={<BundleDetail />} />
            
            {/* Export Plan */}
            <Route path="/export-plan" element={<ExportPlanScreen />} />
            
            {/* Notifications */}
            <Route path="/notifications" element={<Notifications />} />
            
            {/* Settings */}
            <Route path="/settings" element={<div className="p-8 text-center text-gray-500">Settings coming soon.</div>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
