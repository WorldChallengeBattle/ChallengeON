import { IDKitSessionWidget, CredentialRequest, type RpContext } from '@worldcoin/idkit';
import type { User } from 'firebase/auth';
import { useRef } from 'react';
import { apiUrl } from '../config/api';

export type HumanSessionRequest = {
  app_id: `app_${string}`;
  signal: string;
  existing_session_id: `session_${string}` | null;
  rp_context: RpContext;
};

export function WorldIdSessionVerification({ request, user, onClose, onVerified, onError }: {
  request: HumanSessionRequest;
  user: User;
  onClose: () => void;
  onVerified: () => void;
  onError: (message: string) => void;
}) {
  const backendVerified = useRef(false);
  const backendError = useRef<string | null>(null);
  const errorReported = useRef(false);
  return <IDKitSessionWidget
    open
    onOpenChange={open => {
      if (!open && !backendVerified.current && !errorReported.current) onClose();
    }}
    app_id={request.app_id}
    rp_context={request.rp_context}
    existing_session_id={request.existing_session_id || undefined}
    environment="production"
    action_description="Sign in to Challenge ON"
    constraints={CredentialRequest('proof_of_human', { signal: request.signal })}
    handleVerify={async result => {
      backendError.current = null;
      try {
        const response = await fetch(apiUrl('/api/auth/world-id/session/verify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
          body: JSON.stringify({ result })
        });
        const data = await response.json();
        if (!response.ok || data.success !== true) throw new Error(data.error || 'Human session verification failed');
        backendVerified.current = true;
      } catch (error) {
        backendError.current = error instanceof Error ? error.message : 'Human session verification failed';
        throw error;
      }
    }}
    onSuccess={() => { if (backendVerified.current) onVerified(); }}
    onError={code => {
      if (backendVerified.current) return;
      errorReported.current = true;
      const safeCode = typeof code === 'string' && /^[a-z0-9_]{1,64}$/.test(code) ? code : null;
      onError(backendError.current || (safeCode
        ? `World ID sign-in failed (${safeCode}). Please try again.`
        : 'Human verification was not completed. Please try again.'));
    }}
  />;
}
