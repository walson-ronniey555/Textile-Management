import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import { LogIn, Mail, Lock, User as UserIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

const Login: React.FC = () => {
  const { user, signIn, signInWithEmail, signUpWithEmail, loading } = useAuth();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || "/";

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to={from} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password, name);
        toast.success('Account created successfully!');
      } else {
        await signInWithEmail(email, password);
        toast.success('Signed in successfully!');
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      let message = 'Authentication failed';
      
      if (error.code === 'auth/operation-not-allowed') {
        message = 'Email/Password sign-in is not enabled in the Firebase Console. Please enable it under Authentication > Sign-in method.';
      } else if (error.code === 'auth/email-already-in-use') {
        message = 'This email is already in use. Try signing in instead.';
        setIsSignUp(false); // Automatically switch to sign-in
      } else if (error.code === 'auth/weak-password') {
        message = 'Password is too weak. Please use at least 6 characters.';
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        message = isSignUp 
          ? 'Failed to create account. Please check your details.' 
          : 'Invalid email or password. If you just signed up, please check your inbox for a verification email.';
      } else if (error.code === 'auth/too-many-requests') {
        message = 'Too many failed attempts. Please try again later.';
      } else {
        message = error.message || message;
      }
      
      toast.error(message, { duration: 6000 });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signIn();
      toast.success('Signed in with Google!');
    } catch (error: any) {
      console.error('Google Auth error:', error);
      toast.error('Google sign in failed');
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      toast.error('Please enter your email address first.');
      return;
    }
    try {
      const { sendEmailVerification } = await import('firebase/auth');
      const { auth } = await import('../firebase');
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
        toast.success('Verification email sent! Check your inbox.');
      } else {
        toast.error('Please sign in first to resend verification.');
      }
    } catch (error: any) {
      console.error('Verification error:', error);
      toast.error(error.message || 'Failed to send verification email');
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error('Please enter your email address first.');
      return;
    }
    try {
      const { sendPasswordResetEmail } = await import('../firebase');
      const { auth } = await import('../firebase');
      await sendPasswordResetEmail(auth, email);
      toast.success('Password reset email sent! Check your inbox.');
    } catch (error: any) {
      console.error('Reset error:', error);
      toast.error(error.message || 'Failed to send reset email');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#1a2340] rounded-2xl flex items-center justify-center mx-auto mb-6">
            <LogIn className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">NORYOTEX</h1>
          <p className="text-gray-500">Manage garment production readiness with ease.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          {isSignUp && (
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1a2340] focus:border-transparent transition-all outline-none"
              />
            </div>
          )}
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1a2340] focus:border-transparent transition-all outline-none"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!isSignUp}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1a2340] focus:border-transparent transition-all outline-none"
            />
          </div>

          {!isSignUp && (
            <div className="flex justify-between items-center">
              <button 
                type="button"
                onClick={handleResendVerification}
                className="text-xs font-bold text-gray-500 hover:text-[#1a2340] hover:underline"
              >
                Resend Verification?
              </button>
              <button 
                type="button"
                onClick={handleForgotPassword}
                className="text-xs font-bold text-[#1a2340] hover:underline"
              >
                Forgot Password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#1a2340] text-white font-bold py-3 px-4 rounded-xl hover:bg-[#2a3a60] transition-all shadow-md disabled:opacity-50"
          >
            {isSubmitting ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500 uppercase tracking-widest text-[10px] font-bold">Or continue with</span>
          </div>
        </div>
        
        <button
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-xl hover:bg-gray-50 transition-colors shadow-sm mb-6"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" referrerPolicy="no-referrer" />
          Google Account
        </button>
        
        <div className="text-center">
          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm font-bold text-[#1a2340] hover:underline"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
        
        <p className="mt-8 text-xs text-gray-400 text-center">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
};

export default Login;
