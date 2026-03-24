import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createBundle } from '../services/dataService';
import { ChevronLeft, Save } from 'lucide-react';
import { motion } from 'motion/react';

const CARRIERS = ['AIRSEA', 'DACHSER', 'ADUANA ALIE', 'EMA LOG', 'Other'];

const NewBundle: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    bundleNumber: '',
    carrier: CARRIERS[0],
    expectedDate: '',
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bundleId = await createBundle(formData);
    if (bundleId) {
      navigate(`/bundles/${bundleId}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/bundles" className="p-2 bg-white rounded-xl shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors">
          <ChevronLeft size={24} className="text-gray-600" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Import Bundle</h1>
          <p className="text-gray-500">Create a new incoming shipment.</p>
        </div>
      </div>

      {/* Form */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden"
      >
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">Bundle Number</label>
              <input 
                type="text" 
                required
                placeholder="e.g., BNDL-2024-001"
                value={formData.bundleNumber}
                onChange={(e) => setFormData({ ...formData, bundleNumber: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">Carrier</label>
              <select 
                value={formData.carrier}
                onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all"
              >
                {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Expected Arrival Date</label>
            <input 
              type="date" 
              required
              value={formData.expectedDate}
              onChange={(e) => setFormData({ ...formData, expectedDate: e.target.value })}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Notes</label>
            <textarea 
              rows={4}
              placeholder="Any additional information..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all resize-none"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <Link 
              to="/bundles"
              className="flex-1 flex items-center justify-center px-6 py-4 bg-white border border-gray-200 text-gray-600 font-bold rounded-2xl hover:bg-gray-50 transition-all"
            >
              Cancel
            </Link>
            <button 
              type="submit"
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-[#1a2340] text-white font-bold rounded-2xl hover:bg-[#2a3a60] transition-all shadow-lg"
            >
              <Save size={20} />
              Save Bundle
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default NewBundle;
