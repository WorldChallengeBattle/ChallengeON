import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  type User,
  onAuthStateChanged,
  signInWithCustomToken,
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { MiniKit } from '@worldcoin/minikit-js';
import { apiUrl } from '../config/api';

interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  points: number;
  level: number;
  onboardingClaimed?: boolean;
  onboardingClaimPendingHash?: string | null;
  onboardingClaimPendingAt?: unknown;
}

interface AuthContextType {
  currentUser: User | null;
  userData: UserData | null;
  loading: boolean;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const hasAttemptedAutoLoginRef = useRef(false);
  const isAuthenticatingRef = useRef(false);

  const syncUserData = async (user: User) => {
    if (!db) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        setUserData(userSnap.data() as UserData);
        return;
      }

      const newUserData: UserData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || 'Challenger',
        photoURL: user.photoURL,
        points: 0,
        level: 1,
        onboardingClaimed: false,
        onboardingClaimPendingHash: null,
        createdAt: serverTimestamp(),
      } as any;

      await setDoc(userRef, newUserData);
      setUserData(newUserData);
    } catch (error: any) {
      console.error('[Auth] Firestore sync error:', error.message);
    }
  };

  const refreshUserData = async () => {
    if (currentUser) {
      await syncUserData(currentUser);
    }
  };

  const loginWithWorldID = useCallback(async () => {
    if (currentUser || isAuthenticatingRef.current) {
      return;
    }

    if (!MiniKit.isInstalled()) {
      console.warn('MiniKit is not installed. Please run this app inside World App.');
      return;
    }

    isAuthenticatingRef.current = true;

    try {
      const nonceRes = await fetch(apiUrl('/api/auth/nonce'));
      const nonceData = await nonceRes.json();

      const authResult = await MiniKit.walletAuth({
        nonce: nonceData.nonce,
        statement: 'Log in to Challenge On as a verified human.',
      });

      if (!authResult?.data) {
        console.warn('[World ID] Verification did not complete successfully.');
        return;
      }

      const verifyRes = await fetch(apiUrl('/api/auth/complete-siwe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: authResult, nonce: nonceData.nonce }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.success) {
        throw new Error(verifyData.error || 'World ID verification failed.');
      }

      await signInWithCustomToken(auth, verifyData.customToken);
      console.log('[World ID] Successfully authenticated with SIWE.');
    } catch (error) {
      console.error('[World ID] Auth error:', error);
    } finally {
      isAuthenticatingRef.current = false;
    }
  }, [currentUser]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      try {
        if (user) {
          await syncUserData(user);
        } else {
          setUserData(null);

          if (!hasAttemptedAutoLoginRef.current) {
            hasAttemptedAutoLoginRef.current = true;
            void loginWithWorldID();
          }
        }
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [loginWithWorldID]);

  const value = {
    currentUser,
    userData,
    loading,
    refreshUserData,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
