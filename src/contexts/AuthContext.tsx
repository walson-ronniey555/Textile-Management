import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, onAuthStateChanged, doc, getDoc, setDoc, Timestamp, User } from '../firebase';
import { UserProfile, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          // Ensure admin email always has admin role
          if (user.email === 'omarfarah192@gmail.com' && data.role !== 'admin') {
            const updatedProfile = { ...data, role: 'admin' as UserRole };
            await setDoc(docRef, updatedProfile, { merge: true });
            setProfile(updatedProfile);
          } else {
            setProfile(data);
          }
        } else {
          // Create default profile for new users
          // Default role is 'factory' unless it's the admin email
          const role: UserRole = user.email === 'omarfarah192@gmail.com' ? 'admin' : 'factory';
          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email!,
            displayName: user.displayName || '',
            role,
            createdAt: Timestamp.now(),
          };
          await setDoc(docRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    const { signInWithPopup, googleProvider } = await import('../firebase');
    await signInWithPopup(auth, googleProvider);
  };

  const signOutUser = async () => {
    const { signOut } = await import('../firebase');
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut: signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
