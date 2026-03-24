import React, { createContext, useContext, useEffect, useState } from 'react';
import { Timestamp } from '../firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: any;
  profile: UserProfile | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MOCK_USER = {
  uid: 'direct-access-user',
  email: 'admin@noryotex.com',
  displayName: 'NORYOTEX Admin',
};

const MOCK_PROFILE: UserProfile = {
  uid: 'direct-access-user',
  email: 'admin@noryotex.com',
  displayName: 'NORYOTEX Admin',
  role: 'admin',
  createdAt: Timestamp.now(),
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user] = useState<any>(MOCK_USER);
  const [profile] = useState<UserProfile | null>(MOCK_PROFILE);
  const [loading] = useState(false);

  const signIn = async () => {};
  const signOutUser = async () => {};

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
