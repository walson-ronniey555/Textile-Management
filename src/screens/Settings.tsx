import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { subscribeToSettings, updateSettings } from '../services/dataService';
import { AppSettings } from '../types';
import { toast } from 'sonner';

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newMaterial, setNewMaterial] = useState('');
  const [newCustomer, setNewCustomer] = useState('');
  const [newCarrier, setNewCarrier] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeToSettings((data) => {
      setSettings(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAddItem = (list: 'materialTypes' | 'customers' | 'carriers', value: string, setter: (v: string) => void) => {
    if (!settings || !value.trim()) return;
    
    const newList = [...settings[list], value.trim()];
    // Remove duplicates
    const uniqueList = Array.from(new Set(newList));
    
    setSettings({ ...settings, [list]: uniqueList });
    setter('');
  };

  const handleRemoveItem = (list: 'materialTypes' | 'customers' | 'carriers', index: number) => {
    if (!settings) return;
    
    const newList = [...settings[list]];
    newList.splice(index, 1);
    
    setSettings({ ...settings, [list]: newList });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await updateSettings(settings);
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Application Settings</h1>
          <p className="text-gray-500">Customize options for materials, customers, and carriers.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <Save size={18} />}
          Save Changes
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Material Types */}
        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            Material Types
          </h2>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newMaterial}
              onChange={(e) => setNewMaterial(e.target.value)}
              placeholder="Add material type..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              onKeyPress={(e) => e.key === 'Enter' && handleAddItem('materialTypes', newMaterial, setNewMaterial)}
            />
            <button
              onClick={() => handleAddItem('materialTypes', newMaterial, setNewMaterial)}
              className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Plus size={20} />
            </button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {(settings?.materialTypes || []).map((item, index) => (
              <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg group">
                <span className="text-gray-700">{item}</span>
                <button
                  onClick={() => handleRemoveItem('materialTypes', index)}
                  className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {(!settings || settings.materialTypes.length === 0) && (
              <p className="text-center text-gray-400 py-4 italic text-sm">No material types added.</p>
            )}
          </div>
        </section>

        {/* Customers */}
        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            Customers
          </h2>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newCustomer}
              onChange={(e) => setNewCustomer(e.target.value)}
              placeholder="Add customer..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              onKeyPress={(e) => e.key === 'Enter' && handleAddItem('customers', newCustomer, setNewCustomer)}
            />
            <button
              onClick={() => handleAddItem('customers', newCustomer, setNewCustomer)}
              className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Plus size={20} />
            </button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {(settings?.customers || []).map((item, index) => (
              <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg group">
                <span className="text-gray-700">{item}</span>
                <button
                  onClick={() => handleRemoveItem('customers', index)}
                  className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {(!settings || settings.customers.length === 0) && (
              <p className="text-center text-gray-400 py-4 italic text-sm">No customers added.</p>
            )}
          </div>
        </section>

        {/* Carriers */}
        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            Carriers
          </h2>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newCarrier}
              onChange={(e) => setNewCarrier(e.target.value)}
              placeholder="Add carrier..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              onKeyPress={(e) => e.key === 'Enter' && handleAddItem('carriers', newCarrier, setNewCarrier)}
            />
            <button
              onClick={() => handleAddItem('carriers', newCarrier, setNewCarrier)}
              className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Plus size={20} />
            </button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {(settings?.carriers || []).map((item, index) => (
              <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg group">
                <span className="text-gray-700">{item}</span>
                <button
                  onClick={() => handleRemoveItem('carriers', index)}
                  className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {(!settings || settings.carriers.length === 0) && (
              <p className="text-center text-gray-400 py-4 italic text-sm">No carriers added.</p>
            )}
          </div>
        </section>
      </div>

      <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-3">
        <AlertCircle className="text-blue-500 mt-0.5" size={20} />
        <div>
          <h3 className="text-sm font-semibold text-blue-900">Note on Customization</h3>
          <p className="text-sm text-blue-700">
            These options will be available as dropdown selections when creating or editing orders and bundles. 
            This ensures data consistency across the application.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
