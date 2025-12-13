import React from 'react';
import { useNavigate } from 'react-router-dom';
import { XCircle, ArrowLeft, CreditCard } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';

const PaymentCancelPage: React.FC = () => {
  const navigate = useNavigate();

  const handleRetryPayment = () => {
    navigate('/tools', { state: { openSettings: true, settingsTab: 'generate-locally' } });
  };

  const handleGoHome = () => {
    navigate('/');
  };

  const handleContinue = () => {
    navigate('/tools');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-wes-cream via-white to-wes-mint/10">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
            <XCircle className="w-8 h-8 text-orange-600" />
          </div>
          <CardTitle className="text-xl">Payment Cancelled</CardTitle>
          <CardDescription>
            Your payment was cancelled and no charges were made
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground text-center">
            You can continue using Reigh with your existing credits, or try the payment process again if you'd like to add more credits.
          </div>

          <div className="space-y-2">
            <Button variant="retro" size="retro-sm" onClick={handleRetryPayment} className="w-full">
              <CreditCard className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            
            <Button variant="retro-secondary" size="retro-sm" onClick={handleContinue} className="w-full">
              Continue to Tools
            </Button>
            
            <Button variant="ghost" onClick={handleGoHome} className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentCancelPage; 