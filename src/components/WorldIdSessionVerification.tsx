import { IDKitSessionWidget, CredentialRequest, type RpContext } from '@worldcoin/idkit';
import { useRef } from 'react';
import { apiUrl } from '../config/api';

export type HumanSessionRequest = {
  app_id: `app_${string}`;
  wallet: string;
  wallet_auth_time: number;
  signal: string;
  existing_session_id: `session_${string}` | null;
  rp_context: RpContext;
};

export function WorldIdSessionVerification({ request, token, onClose, onVerified, onError }: {
  request: HumanSessionRequest;
  token: string;
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
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
    onError={(code, report) => {
      if (backendVerified.current) return;
      errorReported.current = true;
      const safeCode = typeof code === 'string' && /^[a-z0-9_]{1,64}$/.test(code) ? code : null;
      // Only fixed transport labels may leave the SDK's sensitive debug report.
      let diagnostic = '';
      if (report?.transport === 'mini_app') {
        const platform = report.mini_app?.platform;
        const version = report.mini_app?.verify_version;
        const response = report.response_payload;
        const source = response && typeof response === 'object' && 'status' in response
          ? (response.status === 'error' ? 'native-error' : 'response-parse') : 'sdk';
        diagnostic = ` [mini_app/${platform === 'android' || platform === 'ios' ? platform : 'unknown'}/${version === 1 || version === 2 ? `verify-v${version}` : 'verify-unknown'}/${source}]`;
      }
      onError(backendError.current || (safeCode
        ? `World ID sign-in failed (${safeCode}). Please try again.${diagnostic}`
        : 'Human verification was not completed. Please try again.'));
    }}
  />;
}
