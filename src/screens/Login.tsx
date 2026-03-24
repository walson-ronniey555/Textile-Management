import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import { LogIn, AlertCircle, X, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

const Login: React.FC = () => {
  const { user, signIn, loading, error, signingIn, clearError } = useAuth();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || "/";

  if (loading) return null;
  if (user) return <Navigate to={from} replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center"
      >
        <div className="w-16 h-16 bg-[#1a2340] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <LogIn className="text-white" size={32} />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">TextilFlow</h1>
        <p className="text-gray-500 mb-8">Manage garment production readiness with ease.</p>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-left relative">
            <button
              onClick={clearError}
              className="absolute top-3 right-3 text-red-400 hover:text-red-600"
            >
              <X size={16} />
            </button>
            <div className="flex gap-3">
              <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-red-700 pr-4">{error}</p>
            </div>
          </div>
        )}

        <button
          onClick={signIn}
          disabled={signingIn}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-xl hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {signingIn ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" referrerPolicy="no-referrer" />
          )}
          {signingIn ? 'Signing in...' : 'Sign in with Google'}
        </button>

        <p className="mt-8 text-xs text-gray-400">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
};

export default Login;
