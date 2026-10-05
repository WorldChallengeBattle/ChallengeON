import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { type User, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { MiniKit } from '@worldcoin/minikit-js';
import { RefreshCw, Shield } from 'lucide-react';
import { auth } from '../firebase';
import { apiUrl } from '../config/api';
import { WorldIdLoginVerification, type HumanLoginRequest } from '../components/WorldIdLoginVerification';
import brandIcon from '../assets/brand/ChallengeOnICO.png';

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
  const [accessGranted, setAccessGranted] = useState(false);
  const [error, setError] = useState('');
  const [proofRequest, setProofRequest] = useState<(HumanLoginRequest & { token: string }) | null>(null);
  const hasAttemptedAutoLoginRef = useRef(false);
  const isAuthenticatingRef = useRef(false);
  const generation = useRef(0);
  const proofAccepted = useRef(false);

  const syncUserData = useCallback(async (user: User, token?: string) => {
    const response = await fetch(apiUrl('/api/auth/profile'), { headers: { Authorization: `Bearer ${token ?? await user.getIdToken()}` } });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Profile unavailable');
    if (auth.currentUser?.uid === user.uid) setUserData(result.data as UserData);
    return result.data as UserData;
  }, []);

  const loginWithWorldID = useCallback(async () => {
    if (isAuthenticatingRef.current) return;
    if (!MiniKit.isInstalled()) throw new Error('Open Challenge ON inside World App.');
    isAuthenticatingRef.current = true;
    try {
      const nonceRes = await fetch(apiUrl('/api/auth/nonce'));
      const nonceData = await nonceRes.json();
      if (!nonceRes.ok || !nonceData.success) throw new Error(nonceData.error || 'Wallet login is unavailable.');
      const authResult = await MiniKit.walletAuth({ nonce: nonceData.nonce,
        statement: 'Log in to Challenge On with your wallet.', expirationTime: new Date(Date.now() + 5 * 60 * 1000) });
      if (!authResult?.data) throw new Error('Wallet login was not completed.');
      const verifyRes = await fetch(apiUrl('/api/auth/complete-siwe'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: authResult, nonce: nonceData.nonce })
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok || !data.success) throw new Error(data.error || 'Wallet login failed.');
      return (await signInWithCustomToken(auth, data.customToken)).user;
    } finally { isAuthenticatingRef.current = false; }
  }, []);

  const getFreshWalletToken = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in with your wallet first');
    const token = await user.getIdTokenResult();
    const claims = token.claims;
    if (claims.wallet_auth_version === 2 && claims.wallet_verified === true &&
        String(claims.wallet_address).toLowerCase() === user.uid.toLowerCase() &&
        Date.now() - Number(claims.auth_time) * 1000 < 14 * 60 * 1000) return token.token;
    const signedIn = await loginWithWorldID();
    if (!signedIn || signedIn.uid.toLowerCase() !== user.uid.toLowerCase()) throw new Error('Please use the same wallet and try again');
    return signedIn.getIdToken(true);
  }, [loginWithWorldID]);

  const prepareAccess = useCallback(async (user: User, run: number) => {
    try {
      if (!MiniKit.isInstalled()) throw new Error('Open Challenge ON inside World App.');
      const token = await getFreshWalletToken();
      if (run !== generation.current) return;
      await syncUserData(user, token);
      if (run !== generation.current) return;
      const response = await fetch(apiUrl('/api/auth/world-id/login/request'), { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (run !== generation.current) return;
      if (!response.ok) throw new Error(data.error || 'Human verification is unavailable');
      if (data.verified === true) {
        const profile = await syncUserData(user, token);
        if (run !== generation.current) return;
        if (profile.worldIdVerified !== true) throw new Error('Human verification is not confirmed');
        setAccessGranted(true);
      } else {
        if (data.wallet !== user.uid.toLowerCase() || data.action !== 'challengeon-human-login' ||
            data.app_id !== 'app_a5a8b0a2d65c376bf242d317a9f4ac78' || data.rp_context?.rp_id !== 'rp_cba96127b0447fa4' ||
            !/^0x[0-9a-f]{64}$/.test(data.rp_context?.nonce || '') ||
            !Number.isSafeInteger(data.wallet_auth_time) || data.wallet_auth_time <= 0 ||
            data.signal !== `${data.wallet}:${data.wallet_auth_time}:${data.rp_context.nonce}`) {
          throw new Error('Invalid human login request; sign in with the same wallet again');
        }
        proofAccepted.current = false;
        setProofRequest({ ...data, token });
      }
    } catch (cause) {
      if (run === generation.current) setError(cause instanceof Error ? cause.message : 'Sign-in failed');
    } finally { if (run === generation.current) setLoading(false); }
  }, [getFreshWalletToken, syncUserData]);

  const refreshUserData = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const profile = await syncUserData(user);
      if (profile.worldIdVerified !== true) { setAccessGranted(false); setError('Human verification is required.'); }
    } catch { setAccessGranted(false); setError('Unable to confirm your profile. Please retry.'); }
  }, [syncUserData]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      const run = ++generation.current;
      setCurrentUser(user);
      setUserData(null);
      setAccessGranted(false);
      setProofRequest(null);
      setError('');
      setLoading(true);
      if (user) void prepareAccess(user, run);
      else if (!hasAttemptedAutoLoginRef.current) {
        hasAttemptedAutoLoginRef.current = true;
        void loginWithWorldID().catch(cause => {
          if (!auth.currentUser) { setError(cause.message); setLoading(false); }
        });
      } else setLoading(false);
    });
    return () => { generation.current++; unsubscribe(); };
  }, [loginWithWorldID, prepareAccess]);

  const retry = async () => {
    setError('');
    setLoading(true);
    if (auth.currentUser) await prepareAccess(auth.currentUser, ++generation.current);
    else {
      try { await loginWithWorldID(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign-in failed'); setLoading(false); }
    }
  };

  const finishProof = async () => {
    proofAccepted.current = true;
    setProofRequest(null);
    setLoading(true);
    const run = generation.current;
    try {
      if (!auth.currentUser) throw new Error('Sign in again.');
      const profile = await syncUserData(auth.currentUser);
      if (run !== generation.current) return;
      if (profile.worldIdVerified !== true) throw new Error('Human verification is not confirmed');
      setAccessGranted(true);
      setError('');
    } catch (cause) {
      if (run === generation.current) setError(cause instanceof Error ? cause.message : 'Human verification failed');
    } finally { if (run === generation.current) setLoading(false); }
  };

  return <AuthContext.Provider value={{ currentUser, userData, loading, refreshUserData, getFreshWalletToken }}>
    {accessGranted && currentUser && userData?.worldIdVerified === true ? children : (
      <main className="auth-entry">
        <img src={brandIcon} alt="" className="auth-entry-brand" />
        <h1>Challenge ON</h1>
        <Shield size={28} aria-hidden="true" />
        <p role={error ? 'alert' : 'status'}>{error || (proofRequest ? 'Verifying your World ID...' : 'Signing in securely...')}</p>
        {!loading && !proofRequest && <button type="button" onClick={() => { void retry(); }}>
          <RefreshCw size={18} /> Retry sign-in
        </button>}
      </main>
    )}
    {proofRequest && currentUser && proofRequest.wallet === currentUser.uid.toLowerCase() && <WorldIdLoginVerification
      key={proofRequest.rp_context.nonce} request={proofRequest} token={proofRequest.token}
      onVerified={() => { void finishProof(); }}
      onClose={() => {
        if (!proofAccepted.current) { setProofRequest(null); setError('Human verification was not completed. Please retry.'); }
      }}
      onError={message => { if (!proofAccepted.current) { setProofRequest(null); setError(message); } }}
    />}
  </AuthContext.Provider>;
};
