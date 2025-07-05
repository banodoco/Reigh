import React, { useState } from 'react';
import { Coins, CreditCard, History, Gift, Sparkles, Star } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
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
    packages,
    isLoadingBalance,
    isLoadingPackages,
    isCreatingCheckout,
    createCheckout,
    formatCurrency,
    formatTransactionType,
    useCreditLedger,
  } = useCredits();

  const [activeTab, setActiveTab] = useState('purchase');
  const { data: ledgerData, isLoading: isLoadingLedger } = useCreditLedger();

  const handlePurchase = (packageId: string) => {
    createCheckout(packageId);
  };

  const getPackageRecommendation = (packageId: string) => {
    switch (packageId) {
      case 'starter':
        return 'Perfect for trying out Reigh';
      case 'professional':
        return 'Most popular choice';
      case 'enterprise':
        return 'Best value for power users';
      default:
        return '';
    }
  };

  const getPackageBadge = (packageId: string) => {
    switch (packageId) {
      case 'professional':
        return <Badge className="bg-wes-coral text-white">Popular</Badge>;
      case 'enterprise':
        return <Badge className="bg-wes-vintage-gold text-white">Best Value</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
        {/* Balance Overview */}
        <div className="wes-vintage-card p-4 wes-stamp bg-gradient-to-r from-wes-vintage-gold/10 to-wes-yellow/10 border-2 border-wes-vintage-gold/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-crimson text-lg font-semibold text-primary">Current Balance</h3>
              <div className="text-2xl font-bold text-wes-vintage-gold font-playfair">
                {isLoadingBalance ? (
                  <div className="animate-pulse">
                    <div className="h-8 w-16 bg-wes-vintage-gold/20 rounded"></div>
                  </div>
                ) : (
                  `${balance?.currentBalance || 0} credits`
                )}
              </div>
            </div>
            <div className="text-right text-sm text-muted-foreground font-inter">
              <div>Total Purchased: {balance?.totalPurchased || 0}</div>
              <div>Total Spent: {balance?.totalSpent || 0}</div>
              {(balance?.totalRefunded || 0) > 0 && (
                <div>Total Refunded: {balance?.totalRefunded || 0}</div>
              )}
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 wes-vintage-card border-2 border-wes-vintage-gold/30">
            <TabsTrigger
              value="purchase"
              className="font-inter data-[state=active]:bg-wes-vintage-gold/20 data-[state=active]:text-primary"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Purchase Credits
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="font-inter data-[state=active]:bg-wes-vintage-gold/20 data-[state=active]:text-primary"
            >
              <History className="w-4 h-4 mr-2" />
              Transaction History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="purchase" className="flex-1 space-y-4">
            <div className="text-center">
              <h3 className="font-crimson text-xl font-semibold text-primary mb-2">
                Choose a Credit Package
              </h3>
              <p className="text-muted-foreground font-inter">
                Credits are used for AI-powered image and video generation tasks.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {isLoadingPackages ? (
                <div className="col-span-3 text-center">
                  <div className="animate-vintage-pulse">
                    <Sparkles className="w-8 h-8 text-wes-vintage-gold mx-auto mb-2" />
                    <p className="font-inter text-muted-foreground">Loading packages...</p>
                  </div>
                </div>
              ) : (
                packages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="wes-vintage-card p-6 wes-ornate-frame border-3 border-wes-vintage-gold/30 hover:border-wes-vintage-gold/50 transition-all duration-300 relative group"
                  >
                    {getPackageBadge(pkg.id) && (
                      <div className="absolute -top-2 -right-2">
                        {getPackageBadge(pkg.id)}
                      </div>
                    )}
                    
                    <div className="text-center space-y-3">
                      <h4 className="font-crimson text-lg font-semibold text-primary capitalize">
                        {pkg.id}
                      </h4>
                      
                      <div>
                        <div className="text-3xl font-bold text-wes-vintage-gold font-playfair">
                          {pkg.credits}
                        </div>
                        <div className="text-sm text-muted-foreground font-inter">credits</div>
                      </div>
                      
                      <div>
                        <div className="text-xl font-semibold text-primary font-crimson">
                          {formatCurrency(pkg.amount)}
                        </div>
                        <div className="text-sm text-muted-foreground font-inter">
                          {formatCurrency(pkg.pricePerCredit)} per credit
                        </div>
                      </div>
                      
                      <p className="text-sm text-muted-foreground font-inter">
                        {getPackageRecommendation(pkg.id)}
                      </p>
                      
                      <Button
                        onClick={() => handlePurchase(pkg.id)}
                        disabled={isCreatingCheckout}
                        className="w-full wes-button bg-gradient-to-br from-wes-vintage-gold to-wes-yellow hover:from-wes-vintage-gold-dark hover:to-wes-yellow-dark text-white font-inter"
                      >
                        {isCreatingCheckout ? (
                          <div className="animate-spin">
                            <Sparkles className="w-4 h-4" />
                          </div>
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4 mr-2" />
                            Purchase
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="flex-1 space-y-4">
            <div className="text-center">
              <h3 className="font-crimson text-xl font-semibold text-primary mb-2">
                Transaction History
              </h3>
              <p className="text-muted-foreground font-inter">
                View all your credit transactions and usage.
              </p>
            </div>

            <div className="wes-vintage-card border-2 border-wes-vintage-gold/30 rounded-lg overflow-hidden">
              {isLoadingLedger ? (
                <div className="p-8 text-center">
                  <div className="animate-vintage-pulse">
                    <History className="w-8 h-8 text-wes-vintage-gold mx-auto mb-2" />
                    <p className="font-inter text-muted-foreground">Loading transaction history...</p>
                  </div>
                </div>
              ) : ledgerData?.transactions.length === 0 ? (
                <div className="p-8 text-center">
                  <Gift className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="font-inter text-muted-foreground">No transactions yet</p>
                  <p className="text-sm text-muted-foreground font-inter mt-1">
                    Purchase credits to start using Reigh's AI features
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-wes-vintage-gold/20">
                      <TableHead className="font-inter text-primary">Date</TableHead>
                      <TableHead className="font-inter text-primary">Type</TableHead>
                      <TableHead className="font-inter text-primary">Amount</TableHead>
                      <TableHead className="font-inter text-primary">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerData?.transactions.map((tx, index) => (
                      <TableRow key={index} className="border-wes-vintage-gold/20">
                        <TableCell className="font-inter">
                          {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              tx.type === 'stripe'
                                ? 'default'
                                : tx.type === 'refund'
                                ? 'destructive'
                                : 'secondary'
                            }
                            className="font-inter"
                          >
                            {formatTransactionType(tx.type)}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`font-inter font-semibold ${
                            tx.amount > 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                        </TableCell>
                        <TableCell className="font-inter text-sm text-muted-foreground">
                          {tx.metadata?.description || formatTransactionType(tx.type)}
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