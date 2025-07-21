import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle, Loader2, XCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { useCredits } from '@/shared/hooks/useCredits';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const PaymentSuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCredits();
  const [verificationStatus, setVerificationStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [sessionDetails, setSessionDetails] = useState<{
    amount?: string;
    sessionId?: string;
  } | null>(null);

  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (!sessionId) {
      setVerificationStatus('error');
      return;
    }

    // Set a timeout to automatically redirect if verification takes too long
    const timeoutId = setTimeout(() => {
      if (verificationStatus === 'loading') {
        setVerificationStatus('success');
        toast.success('Payment received! Your credits should be available shortly.');
      }
    }, 5000);

    // Invalidate credits queries to trigger a refetch
    // This will update the user's balance once the webhook processes
    const refreshCredits = () => {
      queryClient.invalidateQueries({ queryKey: ['credits', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['credits', 'ledger'] });
    };

    // Initial refresh
    refreshCredits();

    // Set up polling to check for credit updates
    const pollInterval = setInterval(refreshCredits, 2000);

    // Clean up after 30 seconds
    const cleanupTimeout = setTimeout(() => {
      clearInterval(pollInterval);
      clearTimeout(timeoutId);
      setVerificationStatus('success');
    }, 30000);

    setSessionDetails({
      sessionId,
      amount: searchParams.get('amount') || undefined,
    });

    // Mark as success after a short delay to show loading state
    setTimeout(() => {
      setVerificationStatus('success');
    }, 1500);

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(cleanupTimeout);
      clearInterval(pollInterval);
    };
  }, [sessionId, queryClient, searchParams, verificationStatus]);

  const handleContinue = () => {
    navigate('/tools');
  };

  const handleViewTransactions = () => {
    navigate('/tools', { state: { openSettings: true, creditsTab: 'history' } });
  };

  if (!sessionId || verificationStatus === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wes-cream via-white to-wes-mint/10">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-xl">Payment Verification Failed</CardTitle>
            <CardDescription>
              We couldn't verify your payment. This might be a temporary issue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground text-center">
              If you were charged, your credits will be added automatically within a few minutes.
              You can check your transaction history in Settings.
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/')} className="flex-1">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Home
              </Button>
              <Button onClick={handleViewTransactions} className="flex-1">
                View Transactions
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (verificationStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wes-cream via-white to-wes-mint/10">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <CardTitle className="text-xl">Processing Payment</CardTitle>
            <CardDescription>
              Please wait while we confirm your payment...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground text-center">
              <div className="font-mono break-all">
                Session ID: {sessionId}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wes-cream via-white to-wes-mint/10">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <CardTitle className="text-xl">Payment Successful!</CardTitle>
          <CardDescription>
            Your credits have been added to your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Transaction ID:</span>
              <span className="font-mono text-xs">{sessionDetails?.sessionId?.slice(-12)}</span>
            </div>
            {sessionDetails?.amount && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-semibold">${sessionDetails.amount}</span>
              </div>
            )}
          </div>
          
          <div className="text-sm text-muted-foreground text-center">
            Your credits are being processed and will be available shortly.
            You can start using them for AI generation tasks.
          </div>

          <div className="flex gap-2">
            <Button onClick={handleContinue} className="flex-1">
              Return to Tool
            </Button>
            <Button variant="outline" onClick={handleViewTransactions} className="flex-1">
              View Transactions
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSuccessPage; 