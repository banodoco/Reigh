import React, { useState } from 'react';
import { Coins, CreditCard, History, Gift, DollarSign } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Slider } from '@/shared/components/ui/slider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { useCredits } from '@/shared/hooks/useCredits';
import { formatDistanceToNow } from 'date-fns';

const CreditsManagement: React.FC = () => {
  const {
    balance,
    isLoadingBalance,
    isCreatingCheckout,
    createCheckout,
    formatCurrency,
    useCreditLedger,
  } = useCredits();

  // Local formatter for transaction type labels
  const formatTransactionType = (type: string) => {
    switch (type) {
      case 'purchase':
        return 'Purchase';
      case 'spend':
        return 'Spend';
      default:
        return type;
    }
  };

  const [activeTab, setActiveTab] = useState('purchase');
  const [purchaseAmount, setPurchaseAmount] = useState(50); // Default to $50
  const { data: ledgerData, isLoading: isLoadingLedger } = useCreditLedger();

  const handlePurchase = () => {
    if (purchaseAmount > 0) {
      createCheckout(purchaseAmount);
    }
  };

  // Format dollar amount properly (not as cents)
  const formatDollarAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="space-y-4">
        {/* Balance Overview - Simplified */}
        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Remaining Budget</h3>
              <div className="text-2xl font-bold text-gray-900">
                {isLoadingBalance ? (
                  <div className="animate-pulse">
                    <div className="h-8 w-16 bg-gray-200 rounded"></div>
                  </div>
                ) : (
                  formatCurrency(balance?.balance || 0)
                )}
              </div>
            </div>
            <div className="text-right text-sm text-gray-600">
              {/* Placeholder aggregates – replace with real values when available */}
              <div>Total Purchased: {formatCurrency(0)}</div>
              <div>Total Spent: {formatCurrency(0)}</div>
              {false && (
                <div>Total Refunded: {formatCurrency(0)}</div>
              )}
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 bg-gray-100 border border-gray-200">
            <TabsTrigger 
              value="purchase"
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Add Credits
            </TabsTrigger>
            <TabsTrigger 
              value="history"
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <History className="w-4 h-4 mr-2" />
              Transaction History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="purchase" className="flex-1">
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="text-center">
                  <label className="text-lg font-semibold text-gray-900">
                    How much would you like to add?
                  </label>
                </div>
                
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-gray-900">
                      {formatDollarAmount(purchaseAmount)}
                    </div>
                  </div>
                  
                  <div className="px-4">
                    <Slider
                      value={[purchaseAmount]}
                      onValueChange={(value) => setPurchaseAmount(value[0])}
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                    <div className="flex justify-between text-sm text-gray-500 mt-2">
                      <span>$0</span>
                      <span>$100</span>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={handlePurchase}
                disabled={isCreatingCheckout || purchaseAmount === 0}
                className="w-full"
              >
                {isCreatingCheckout ? (
                  <div className="animate-spin">
                    <DollarSign className="w-4 h-4" />
                  </div>
                ) : purchaseAmount === 0 ? (
                  "Select an amount to add"
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Add {formatDollarAmount(purchaseAmount)}
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="history" className="flex-1 space-y-4">
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {isLoadingLedger ? (
                <div className="p-8 text-center">
                  <div className="animate-pulse">
                    <History className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">Loading transaction history...</p>
                  </div>
                </div>
              ) : (ledgerData?.entries?.length || 0) === 0 ? (
                <div className="p-8 text-center">
                  <Gift className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No transactions yet</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Add budget to start using Reigh's AI features
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerData?.entries?.map((tx, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={tx.type === 'purchase' ? 'default' : 'secondary'}
                          >
                            {formatTransactionType(tx.type)}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`font-semibold ${
                            tx.amount > 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {tx.amount > 0 ? `+${formatCurrency(tx.amount)}` : formatCurrency(tx.amount)}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {tx.description || formatTransactionType?.(tx.type) || tx.type}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </Tabs>
    </div>
  );
};

export default CreditsManagement; 