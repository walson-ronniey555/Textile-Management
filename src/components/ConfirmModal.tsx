import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning',
  isLoading = false
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full overflow-hidden border border-slate-100"
          >
            <div className="p-8">
              <div className="flex flex-col items-center text-center gap-6">
                <div className={cn(
                  "p-5 rounded-[2rem] shrink-0 shadow-lg",
                  variant === 'danger' ? "bg-rose-50 text-rose-600 shadow-rose-100" :
                  variant === 'warning' ? "bg-amber-50 text-amber-600 shadow-amber-100" :
                  "bg-blue-50 text-blue-600 shadow-blue-100"
                )}>
                  <AlertTriangle size={40} strokeWidth={1.5} />
                </div>
                <div className="space-y-3">
                  <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h3>
                  <p className="text-slate-500 leading-relaxed font-medium">{message}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-slate-50/50 px-8 py-6 flex gap-4 border-t border-slate-100">
              <button
                onClick={onClose}
                disabled={isLoading}
                className="btn-secondary flex-1"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                }}
                disabled={isLoading}
                className={cn(
                  "btn-primary flex-1 flex items-center justify-center gap-2",
                  variant === 'danger' ? "bg-rose-600 hover:bg-rose-700 shadow-rose-200" :
                  variant === 'warning' ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200" :
                  "bg-slate-900 hover:bg-slate-800 shadow-slate-200"
                )}
              >
                {isLoading && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
