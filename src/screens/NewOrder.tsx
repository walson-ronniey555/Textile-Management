import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createOrder, checkOrderExists, subscribeToSettings, addSettingOption } from '../services/dataService';
import { ChevronLeft, Save, Upload, X, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { resizeImage } from '../lib/imageUtils';
import { AppSettings } from '../types';

const NewOrder: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isOtherClient, setIsOtherClient] = useState(false);
  const [otherClientValue, setOtherClientValue] = useState('');
  const [formData, setFormData] = useState({
    model: '',
    reference: '',
    orderNumber: '',
    client: '',
    quantity: 0,
    imageUrl: '',
    exportWeek: '',
    exportDate: '',
    notes: ''
  });

  useEffect(() => {
    const unsubscribe = subscribeToSettings(setSettings);
    return () => unsubscribe();
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const resized = await resizeImage(reader.result as string);
          setFormData({ ...formData, imageUrl: resized });
        } catch (err) {
          console.error('Error resizing image:', err);
          setError('Failed to process image. Please try a different one.');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const exists = await checkOrderExists(formData.orderNumber);
      if (exists) {
        setError(`An order with number "${formData.orderNumber}" already exists.`);
        setIsSubmitting(false);
        return;
      }

      let finalClient = formData.client;
      if (isOtherClient && otherClientValue.trim()) {
        finalClient = otherClientValue.trim();
        // Automatically add to settings
        await addSettingOption('customers', finalClient);
      }

      const orderId = await createOrder({
        ...formData,
        client: finalClient
      });

      if (orderId) {
        navigate(`/orders/${orderId}`, { state: { showAddMaterial: true } });
      }
    } catch (err) {
      setError('An error occurred while creating the order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/orders" className="p-2 bg-white rounded-xl shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors">
          <ChevronLeft size={24} className="text-gray-600" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Order</h1>
          <p className="text-gray-500">Create a new production order.</p>
        </div>
      </div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl flex items-center gap-3"
        >
          <AlertCircle size={20} />
          <p className="text-sm font-bold">{error}</p>
        </motion.div>
      )}

      {/* Form */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden"
      >
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* Image Upload */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Order Image</label>
            <div className="flex items-center gap-4">
              {formData.imageUrl ? (
                <div className="relative w-32 h-32 rounded-2xl overflow-hidden border border-gray-200">
                  <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                  <button 
                    type="button"
                    onClick={() => setFormData({ ...formData, imageUrl: '' })}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label className="w-32 h-32 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:bg-gray-50 hover:border-[#1a2340] transition-all group">
                  <Upload size={24} className="text-gray-400 group-hover:text-[#1a2340]" />
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider group-hover:text-[#1a2340]">Upload Image</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
              )}
              <div className="flex-1">
                <p className="text-xs text-gray-500">Upload a photo or sketch of the model. Max 2MB recommended.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">Model Name</label>
              <input 
                type="text" 
                required
                placeholder="e.g., Summer Dress V-Neck"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">Client</label>
              <select
                required
                value={isOtherClient ? 'other' : formData.client}
                onChange={(e) => {
                  if (e.target.value === 'other') {
                    setIsOtherClient(true);
                  } else {
                    setIsOtherClient(false);
                    setFormData({ ...formData, client: e.target.value });
                  }
                }}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all"
              >
                <option value="">Select a customer</option>
                {(settings?.customers || []).map((customer) => (
                  <option key={customer} value={customer}>
                    {customer}
                  </option>
                ))}
                <option value="other">Other...</option>
              </select>
              
              {isOtherClient && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="pt-2"
                >
                  <input 
                    type="text" 
                    required
                    placeholder="Enter new customer name"
                    value={otherClientValue}
                    onChange={(e) => setOtherClientValue(e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-[#1a2340] rounded-xl focus:outline-none transition-all shadow-sm"
                  />
                </motion.div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">Order Number(s)</label>
              <input 
                type="text" 
                required
                placeholder="e.g., ORD-2024-001, ORD-2024-002"
                value={formData.orderNumber}
                onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">Reference</label>
              <input 
                type="text" 
                required
                placeholder="e.g., REF-9988"
                value={formData.reference}
                onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">Quantity</label>
              <input 
                type="number" 
                required
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">Export Week</label>
              <input 
                type="text" 
                required
                placeholder="e.g., W12"
                value={formData.exportWeek}
                onChange={(e) => setFormData({ ...formData, exportWeek: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">Export Date</label>
              <input 
                type="date" 
                required
                value={formData.exportDate}
                onChange={(e) => setFormData({ ...formData, exportDate: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a2340] transition-all"
              />
            </div>
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
              to="/orders"
              className="flex-1 flex items-center justify-center px-6 py-4 bg-white border border-gray-200 text-gray-600 font-bold rounded-2xl hover:bg-gray-50 transition-all"
            >
              Cancel
            </Link>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-[#1a2340] text-white font-bold rounded-2xl hover:bg-[#2a3a60] transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save size={20} />
                  Save Order
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default NewOrder;
