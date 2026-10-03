import { IDKitRequestWidget, proofOfHuman, type RpContext } from '@worldcoin/idkit';
import type { User } from 'firebase/auth';
import { useRef } from 'react';
import { apiUrl } from '../config/api';

export type WelcomeProofRequest = {
  app_id: `app_${string}`;
  action: string;
  signal: string;
  rp_context: RpContext;
};

export function WorldIdWelcomeVerification({ request, user, onClose, onVerified, onError }: {
  request: WelcomeProofRequest;
  user: User;
  onClose: () => void;
  onVerified: () => void;
  onError: (message: string) => void;
}) {
  const backendVerified = useRef(false);
  const backendError = useRef<string | null>(null);
  const errorReported = useRef(false);
  return <IDKitRequestWidget
    open
    onOpenChange={(open) => {
      if (!open && !backendVerified.current && !errorReported.current) onClose();
    }}
    app_id={request.app_id}
    action={request.action}
    rp_context={request.rp_context}
    environment="production"
    allow_legacy_proofs={false}
    preset={proofOfHuman({ signal: request.signal })}
    handleVerify={async (result) => {
      backendError.current = null;
      try {
        const response = await fetch(apiUrl('/api/auth/world-id/verify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
          body: JSON.stringify({ result })
        });
        const data = await response.json();
        if (!response.ok || data.success !== true) throw new Error(data.error || 'Human verification failed');
        backendVerified.current = true;
      } catch (error) {
        backendError.current = error instanceof Error ? error.message : 'Human verification failed';
        throw error;
      }
    }}
    onSuccess={onVerified}
    onError={(code) => {
      if (backendVerified.current) return;
      errorReported.current = true;
      const safeCode = typeof code === 'string' && /^[a-z0-9_]{1,64}$/.test(code) ? code : null;
      onError(backendError.current || (safeCode
        ? `World ID verification failed (${safeCode}). Please retry.`
        : 'Human verification was not completed. Please try again.'));
    }}
  />;
}
