import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { useHuggingFaceToken } from '@/shared/hooks/useExternalApiKeys';
import { Loader2, CheckCircle2, XCircle, ExternalLink, Trash2, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface HuggingFaceTokenSetupProps {
  /** Called when token is successfully saved and verified */
  onSuccess?: () => void;
  /** Compact mode for inline display */
  compact?: boolean;
  /** Additional class names */
  className?: string;
}

type SetupState = 'idle' | 'verifying' | 'saving' | 'success' | 'error';

export const HuggingFaceTokenSetup: React.FC<HuggingFaceTokenSetupProps> = ({
  onSuccess,
  compact = false,
  className,
}) => {
  const {
    hasToken,
    isLoading,
    username,
    isVerified,
    verifyToken,
    saveToken,
    deleteToken,
    isSaving,
    isDeleting,
  } = useHuggingFaceToken();

  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [state, setState] = useState<SetupState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifiedUsername, setVerifiedUsername] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!tokenInput.trim()) return;

    setState('verifying');
    setErrorMessage(null);

    const result = await verifyToken(tokenInput.trim());

    if (result.valid) {
      setVerifiedUsername(result.username || null);
      setState('idle');
    } else {
      setErrorMessage(result.error || 'Token verification failed');
      setState('error');
    }
  };

  const handleSave = async () => {
    if (!tokenInput.trim()) return;

    setState('saving');
    setErrorMessage(null);

    const result = await saveToken(tokenInput.trim());

    if (result.success) {
      setState('success');
      setTokenInput('');
      setVerifiedUsername(null);
      onSuccess?.();
    } else {
      setErrorMessage(result.error || 'Failed to save token');
      setState('error');
    }
  };

  const handleDelete = async () => {
    await deleteToken();
    setState('idle');
    setVerifiedUsername(null);
  };

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-4', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Already connected state
  if (hasToken && isVerified) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-900 dark:text-green-100">
              Connected to HuggingFace
            </p>
            {username && (
              <p className="text-xs text-green-700 dark:text-green-300 truncate">
                Logged in as <span className="font-medium">{username}</span>
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Setup form
  return (
    <div className={cn('space-y-4', className)}>
      {!compact && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Connect HuggingFace</h3>
          <p className="text-xs text-muted-foreground">
            To upload LoRAs directly, connect your HuggingFace account with a write-access token.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="hf-token" className="text-sm">
          HuggingFace Token
        </Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="hf-token"
              type={showToken ? 'text' : 'password'}
              placeholder="hf_xxxxxxxxxxxxxxxxxx"
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.target.value);
                setState('idle');
                setErrorMessage(null);
                setVerifiedUsername(null);
              }}
              className={cn(
                'pr-10',
                state === 'error' && 'border-red-500 focus-visible:ring-red-500'
              )}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Verification result */}
        {verifiedUsername && state === 'idle' && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>
              Verified as <span className="font-medium">{verifiedUsername}</span>
            </span>
          </div>
        )}

        {/* Error message */}
        {state === 'error' && errorMessage && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <XCircle className="h-4 w-4" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Help text */}
        <p className="text-xs text-muted-foreground">
          Create a token at{' '}
          <a
            href="https://huggingface.co/settings/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            huggingface.co/settings/tokens
            <ExternalLink className="h-3 w-3" />
          </a>
          {' '}with <span className="font-medium">Write</span> permission.
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {!verifiedUsername ? (
          <Button
            onClick={handleVerify}
            disabled={!tokenInput.trim() || state === 'verifying'}
            variant="outline"
            size="sm"
          >
            {state === 'verifying' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Verifying...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
        ) : (
          <Button
            onClick={handleSave}
            disabled={state === 'saving'}
            size="sm"
          >
            {state === 'saving' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Token'
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default HuggingFaceTokenSetup;
