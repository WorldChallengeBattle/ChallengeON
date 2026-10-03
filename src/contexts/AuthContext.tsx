import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  type User,
  onAuthStateChanged,
  signInWithCustomToken,
} from 'firebase/auth';
import { auth } from '../firebase';
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
  worldIdVerified?: boolean;
  onboardingClaimPendingHash?: string | null;
  onboardingClaimPendingAt?: unknown;
}

interface AuthContextType {
  currentUser: User | null;
  userData: UserData | null;
  loading: boolean;
  refreshUserData: () => Promise<void>;
  getFreshWalletToken: () => Promise<string>;
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
    try {
      const response = await fetch(apiUrl('/api/auth/profile'), {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` }
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Profile unavailable');
      setUserData(result.data as UserData);
    } catch (error: any) {
      console.error('[Auth] Firestore sync error:', error.message);
    }
  };

  const refreshUserData = async () => {
    if (currentUser) {
      await syncUserData(currentUser);
    }
  };

  const loginWithWorldID = useCallback(async (force = false) => {
    if ((!force && currentUser) || isAuthenticatingRef.current) {
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
      if (!nonceRes.ok || !nonceData.success) throw new Error(nonceData.error || 'Wallet login is unavailable.');

      const authResult = await MiniKit.walletAuth({
        nonce: nonceData.nonce,
        statement: 'Log in to Challenge On with your wallet.',
        expirationTime: new Date(Date.now() + 5 * 60 * 1000),
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

      const credential = await signInWithCustomToken(auth, verifyData.customToken);
      console.log('[World ID] Successfully authenticated with SIWE.');
      return credential.user;
    } catch (error) {
      console.error('[World ID] Auth error:', error);
      if (force) throw error;
    } finally {
      isAuthenticatingRef.current = false;
    }
  }, [currentUser]);

  const getFreshWalletToken = useCallback(async () => {
    if (!currentUser) throw new Error('Sign in with your wallet first');
    const token = await currentUser.getIdTokenResult();
    const claims = token.claims;
    if (claims.wallet_auth_version === 2 && claims.wallet_verified === true &&
        String(claims.wallet_address).toLowerCase() === currentUser.uid.toLowerCase() &&
        Date.now() - Number(claims.auth_time) * 1000 < 14 * 60 * 1000) return token.token;
    const signedIn = await loginWithWorldID(true);
    if (!signedIn || signedIn.uid.toLowerCase() !== currentUser.uid.toLowerCase()) {
      throw new Error('Please use the same wallet and try again');
    }
    return signedIn.getIdToken(true);
  }, [currentUser, loginWithWorldID]);

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
    getFreshWalletToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
