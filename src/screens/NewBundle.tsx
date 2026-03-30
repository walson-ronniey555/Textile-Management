import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createBundle, subscribeToSettings, addSettingOption } from '../services/dataService';
import { ChevronLeft, Save } from 'lucide-react';
import { motion } from 'motion/react';
import { AppSettings } from '../types';

const NewBundle: React.FC = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isOtherCarrier, setIsOtherCarrier] = useState(false);
  const [otherCarrierValue, setOtherCarrierValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    bundleNumber: '',
    carrier: '',
    expectedDate: '',
    notes: ''
  });

  useEffect(() => {
    const unsubscribe = subscribeToSettings((data) => {
      setSettings(data);
      if (data?.carriers && data.carriers.length > 0 && !formData.carrier) {
        setFormData(prev => ({ ...prev, carrier: data.carriers[0] }));
      }
    });
    return () => unsubscribe();
  }, [formData.carrier]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      let finalCarrier = formData.carrier;
      if (isOtherCarrier && otherCarrierValue.trim()) {
        finalCarrier = otherCarrierValue.trim();
        // Automatically add to settings
        await addSettingOption('carriers', finalCarrier);
      }

      const bundleId = await createBundle({
        ...formData,
        carrier: finalCarrier
      });

      if (bundleId) {
        navigate(`/bundles/${bundleId}`);
      }
    } catch (error) {
      console.error('Error creating bundle:', error);
      setIsSubmitting(false);
    }
  };

  const carrierOptions = settings?.carriers || [];

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
                required
                value={isOtherCarrier ? 'other' : formData.carrier}
                onChange={(e) => {
                  if (e.target.value === 'other') {
                    setIsOtherCarrier(true);
                  } else {
                    setIsOtherCarrier(false);
                    setFormData({ ...formData, carrier: e.target.value });
                  }
                }}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all"
              >
                <option value="">Select a Carrier</option>
                {carrierOptions.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="other">Other...</option>
              </select>
              
              {isOtherCarrier && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="pt-2"
                >
                  <input 
                    type="text" 
                    required
                    placeholder="Enter new carrier name"
                    value={otherCarrierValue}
                    onChange={(e) => setOtherCarrierValue(e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-[#1a2340] rounded-xl focus:outline-none transition-all shadow-sm"
                  />
                </motion.div>
              )}

              {carrierOptions.length === 0 && !isOtherCarrier && (
                <p className="text-[10px] text-amber-600 font-bold">
                  No carriers found in settings. Please add them in the Settings page or select "Other...".
                </p>
              )}
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
              disabled={isSubmitting || !formData.carrier}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-[#1a2340] text-white font-bold rounded-2xl hover:bg-[#2a3a60] transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save size={20} />
                  Save Bundle
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default NewBundle;
