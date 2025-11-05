import React, { useState } from 'react';
import { Coins, CreditCard, History, Gift, DollarSign, Activity, Filter, ChevronLeft, ChevronRight, Download, Settings } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { useCredits } from '@/shared/hooks/useCredits';
import { useAutoTopup } from '@/shared/hooks/useAutoTopup';
import { useTaskLog } from '@/shared/hooks/useTaskLog';
import { formatDistanceToNow } from 'date-fns';
import { UpdatingTimeCell } from '@/shared/components/UpdatingTimeCell';
import { SliderWithValue } from '@/shared/components/ui/slider-with-value';

interface CreditsManagementProps {
  initialTab?: 'purchase' | 'history' | 'task-log';
}

const CreditsManagement: React.FC<CreditsManagementProps> = ({ initialTab = 'purchase' }) => {
  const {
    balance,
    isLoadingBalance,
    isCreatingCheckout,
    createCheckout,
    formatCurrency,
    useCreditLedger,
  } = useCredits();

  const {
    preferences: autoTopupPreferences,
    isLoadingPreferences: isLoadingAutoTopup,
    updatePreferences: updateAutoTopup,
    isUpdatingPreferences: isUpdatingAutoTopup,
  } = useAutoTopup();

  // Task Log state
  const [taskLogPage, setTaskLogPage] = useState(1);
  const [taskLogFilters, setTaskLogFilters] = useState({
    costFilter: 'all' as 'all' | 'free' | 'paid',
    status: ['Complete'] as string[], // Default to showing only completed tasks
    taskTypes: [] as string[],
    projectIds: [] as string[],
  });
  const [isDownloading, setIsDownloading] = useState(false);

  const { data: taskLogData, isLoading: isLoadingTaskLog } = useTaskLog(20, taskLogPage, taskLogFilters);

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

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [purchaseAmount, setPurchaseAmount] = useState(50); // Default to $50
  const { data: ledgerData, isLoading: isLoadingLedger } = useCreditLedger();

  // Auto-top-up state - use preferences from hook but allow local overrides for unsaved changes
  // Initialize state more carefully - handle the loading state properly
  const [localAutoTopupEnabled, setLocalAutoTopupEnabled] = useState(true); // Default to true
  const [localAutoTopupThreshold, setLocalAutoTopupThreshold] = useState(10); // Default to $10
  const [hasInitialized, setHasInitialized] = useState(false);

  // Update local state when preferences load for the first time
  React.useEffect(() => {
    if (autoTopupPreferences && !hasInitialized) {
      setLocalAutoTopupEnabled(autoTopupPreferences.enabled);
      setLocalAutoTopupThreshold(autoTopupPreferences.threshold || 10);
      
      // If user has a saved auto-top-up amount, use that as the purchase amount
      if (autoTopupPreferences.amount && autoTopupPreferences.amount !== 50) {
        setPurchaseAmount(autoTopupPreferences.amount);
      }
      
      setHasInitialized(true);
    }
  }, [autoTopupPreferences, hasInitialized]);

  // Helper functions for filters
  const updateFilter = (filterType: keyof typeof taskLogFilters, value: any) => {
    setTaskLogFilters(prev => ({ ...prev, [filterType]: value }));
    setTaskLogPage(1); // Reset to first page when filtering
  };

  const toggleArrayFilter = (filterType: 'status' | 'taskTypes' | 'projectIds', value: string) => {
    setTaskLogFilters(prev => {
      const currentArray = prev[filterType];
      const newArray = currentArray.includes(value)
        ? currentArray.filter(item => item !== value)
        : [...currentArray, value];
      return { ...prev, [filterType]: newArray };
    });
    setTaskLogPage(1);
  };

  const clearFilters = () => {
    setTaskLogFilters({
      costFilter: 'all',
      status: ['Complete'], // Reset to default completed filter
      taskTypes: [],
      projectIds: [],
    });
    setTaskLogPage(1);
  };

  const getFilterCount = () => {
    let count = 0;
    if (taskLogFilters.costFilter !== 'all') count++;
    if (taskLogFilters.status.length > 0) count++;
    if (taskLogFilters.taskTypes.length > 0) count++;
    if (taskLogFilters.projectIds.length > 0) count++;
    return count;
  };

  const formatTaskType = (taskType: string) => {
    // Special case for travel_orchestrator
    if (taskType === 'travel_orchestrator') {
      return 'Travel Between Images';
    }
    
    return taskType.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  // Update auto-top-up threshold when purchase amount changes (only for truly new users, not when restoring saved preferences)
  React.useEffect(() => {
    // Only auto-update threshold if:
    // 1. We've finished initialization 
    // 2. User doesn't have saved preferences (threshold is default 10)
    // 3. Purchase amount changes
    if (hasInitialized && autoTopupPreferences && autoTopupPreferences.threshold === 10 && purchaseAmount !== 50) {
      const defaultThreshold = Math.max(1, Math.floor(purchaseAmount / 5));
      setLocalAutoTopupThreshold(defaultThreshold);
    }
  }, [purchaseAmount, hasInitialized, autoTopupPreferences]);

  // Handle auto-top-up preference changes
  const handleAutoTopupToggle = (enabled: boolean) => {
    setLocalAutoTopupEnabled(enabled);
    
    // Immediately save preference changes
    const saveData = {
      enabled,
      amount: purchaseAmount, // Use the purchase amount from the slider above
      threshold: localAutoTopupThreshold,
    };
    updateAutoTopup(saveData);
  };

  const handleAutoTopupThresholdChange = (threshold: number) => {
    setLocalAutoTopupThreshold(threshold);
    // Save immediately
    updateAutoTopup({
      enabled: localAutoTopupEnabled,
      amount: purchaseAmount, // Use the purchase amount from the slider above
      threshold,
    });
  };

  // Handle purchase amount changes - update auto-top-up amount if enabled
  const handlePurchaseAmountChange = (amount: number) => {
    setPurchaseAmount(amount);
    
    // If auto-top-up is enabled, update both amount and threshold
    if (localAutoTopupEnabled) {
      // Auto-calculate new threshold as 1/5 of purchase amount (minimum 1)
      const newThreshold = Math.max(1, Math.floor(amount / 5));
      
      // Update local state immediately for UI responsiveness
      setLocalAutoTopupThreshold(newThreshold);
      
      // Save both amount and new threshold
      updateAutoTopup({
        enabled: localAutoTopupEnabled,
        amount: amount,
        threshold: newThreshold,
      });
    }
  };

  // Auto-top-up state computation - use local state for immediate UI responsiveness
  const autoTopupState = React.useMemo(() => {
    if (!autoTopupPreferences) return 'loading';
    
    const { setupCompleted } = autoTopupPreferences;
    // Use localAutoTopupEnabled for immediate state transitions
    const enabled = localAutoTopupEnabled;
    
    // Debug logging (keeping for now)
    if (enabled && setupCompleted) return 'active';
    if (!enabled && setupCompleted) return 'setup-but-disabled';
    if (enabled && !setupCompleted) return 'enabled-but-not-setup';
    return 'not-setup';
  }, [autoTopupPreferences, localAutoTopupEnabled]);

  // Get the auto-top-up summary message
  const getAutoTopupSummary = () => {
    if (!autoTopupPreferences) return '';
    
    switch (autoTopupState) {
      case 'active':
        return `You've enabled and activated auto-top-up. We'll automatically charge your card ${formatDollarAmount(purchaseAmount)} when your balance drops below ${formatDollarAmount(localAutoTopupThreshold)}.`;
      
      case 'setup-but-disabled':
        return `You have auto-top-up set up but it's currently *deactivated*. To activate it, toggle the setting above on.`;
      
      case 'enabled-but-not-setup':
        return `You've enabled auto-top-up, but it's not set up. To set it up, click the button below to make your first transaction.`;
      
      case 'not-setup':
        return `Auto-top-up summary: We'll automatically charge your card ${formatDollarAmount(purchaseAmount)} when your balance drops below ${formatDollarAmount(localAutoTopupThreshold)}.`;
      
      case 'loading':
        return 'Loading auto-top-up preferences...';
      
      default:
        return `Debug: Unknown state "${autoTopupState}"`;
    }
  };

  const handlePurchase = () => {
    if (purchaseAmount > 0) {
      if (localAutoTopupEnabled && autoTopupState === 'enabled-but-not-setup') {
        // Setting up auto-top-up for the first time
        createCheckout({
          amount: purchaseAmount,
          autoTopupEnabled: true,
          autoTopupAmount: purchaseAmount, // Use the purchase amount, not a separate value
          autoTopupThreshold: localAutoTopupThreshold,
        });
      } else {
        // Regular purchase without auto-top-up setup
        createCheckout({ amount: purchaseAmount });
      }
    }
  };

  // Download all filtered task records as CSV
  const handleDownloadTaskLog = async () => {
    setIsDownloading(true);
    try {
      // Import useTaskLog hook's query function directly
      const { supabase } = await import('@/integrations/supabase/client');
      
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Authentication required');
      }

      // Get user's projects
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .eq('user_id', user.id);

      if (!projects || projects.length === 0) {
        return;
      }

      const projectIds = projects.map(p => p.id);
      const projectLookup = Object.fromEntries(projects.map(p => [p.id, p.name]));

      // Build query with current filters (no pagination)
      let query = supabase
        .from('tasks')
        .select('*')
        .in('project_id', projectIds);

      if (taskLogFilters.status && taskLogFilters.status.length > 0) {
        query = query.in('status', taskLogFilters.status);
      }
      if (taskLogFilters.taskTypes && taskLogFilters.taskTypes.length > 0) {
        query = query.in('task_type', taskLogFilters.taskTypes);
      }
      if (taskLogFilters.projectIds && taskLogFilters.projectIds.length > 0) {
        query = query.in('project_id', taskLogFilters.projectIds);
      }

      const { data: tasksData, error: tasksError } = await query
        .order('created_at', { ascending: false });

      if (tasksError) {
        throw new Error(`Failed to fetch tasks: ${tasksError.message}`);
      }

      // Get cost information for all tasks
      const taskIds = tasksData?.map(task => task.id) || [];
      let costsData: any[] = [];
      
      if (taskIds.length > 0) {
        const { data: costs } = await supabase
          .from('credits_ledger')
          .select('task_id, amount, created_at')
          .in('task_id', taskIds)
          .eq('type', 'spend');

        costsData = costs || [];
      }

      // Combine tasks with cost information
      let tasks = (tasksData || []).map(task => {
        const costEntry = costsData.find(cost => cost.task_id === task.id);
        let duration: number | undefined;
        
        if (task.generation_started_at && task.generation_processed_at) {
          const start = new Date(task.generation_started_at);
          const end = new Date(task.generation_processed_at);
          duration = Math.ceil((end.getTime() - start.getTime()) / 1000);
        }

        return {
          date: new Date(task.created_at).toLocaleDateString(),
          taskType: formatTaskType(task.task_type),
          project: projectLookup[task.project_id] || 'Unknown Project',
          status: task.status,
          duration: duration ? `${duration}s` : '',
          cost: costEntry ? `$${Math.abs(costEntry.amount).toFixed(3)}` : 'Free',
        };
      });

      // Apply cost filter (client-side)
      if (taskLogFilters.costFilter === 'free') {
        tasks = tasks.filter(task => task.cost === 'Free');
      } else if (taskLogFilters.costFilter === 'paid') {
        tasks = tasks.filter(task => task.cost !== 'Free');
      }

      // Convert to CSV
      const headers = ['Date', 'Task Type', 'Project', 'Status', 'Duration', 'Cost'];
      const csvContent = [
        headers.join(','),
        ...tasks.map(task => [
          task.date,
          `"${task.taskType}"`,
          `"${task.project}"`,
          task.status,
          task.duration,
          task.cost
        ].join(','))
      ].join('\n');

      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `task-log-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Error downloading task log:', error);
      // Could add toast error here if needed
    } finally {
      setIsDownloading(false);
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
          <div className="flex items-center gap-3">
            <Coins className="h-6 w-6 text-gray-600" />
            <div className="flex items-baseline gap-3">
              <h3 className="text-lg font-light text-gray-900">Remaining Credit</h3>
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
          </div>
        </div>

        <div className="px-1">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="-mx-1 sm:mx-0">
          <TabsList className="grid w-full grid-cols-3 bg-gray-100 border border-gray-200 h-auto p-3 sm:h-10 sm:p-1 mb-3 px-1 rounded-none sm:px-1 sm:rounded-md">
            <TabsTrigger 
              value="purchase"
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-0.5 py-2 sm:py-1.5 px-2 sm:px-3 text-xs sm:text-sm"
            >
              <CreditCard className="w-4 h-4" />
              <span className="text-center leading-tight">
                <span className="sm:hidden">Add<br />Credits</span>
                <span className="hidden sm:inline">Add Credits</span>
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="history"
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-0.5 py-2 sm:py-1.5 px-2 sm:px-3 text-xs sm:text-sm"
            >
              <History className="w-4 h-4" />
              <span className="text-center leading-tight">
                <span className="sm:hidden">Transaction<br />History</span>
                <span className="hidden sm:inline">Transaction History</span>
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="task-log"
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-0.5 py-2 sm:py-1.5 px-2 sm:px-3 text-xs sm:text-sm"
            >
              <Activity className="w-4 h-4" />
              <span className="text-center leading-tight">
                <span className="sm:hidden">Task<br />Log</span>
                <span className="hidden sm:inline">Task Log</span>
              </span>
            </TabsTrigger>
          </TabsList>
          </div>

          <TabsContent value="purchase" className="flex-1 pb-2 pt-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:[&::-webkit-scrollbar]:block sm:[-ms-overflow-style:auto] sm:[scrollbar-width:auto]">
            <div className="space-y-4 px-1">
              {/* Main content area with 3/5 - 2/5 split on desktop, stacked on mobile */}
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                {/* Left column: Top-up amount (3/5 width on desktop) */}
                <div className="w-full md:w-3/5 space-y-1.5">
                  <div className="text-left mt-2">
                    <label className="text-lg font-light text-gray-900">
                      Top-up amount:
                    </label>
                  </div>
                
                  <div className="space-y-4">
                    <div className="text-left">
                      <div className="text-3xl font-bold text-gray-900">
                        {formatDollarAmount(purchaseAmount)}
                      </div>
                    </div>
                    
                    <div className="-mx-1 px-0">
                      <Slider
                        value={[purchaseAmount]}
                        onValueChange={(value) => handlePurchaseAmountChange(value[0])}
                        min={0}
                        max={100}
                        step={5}
                        className="w-full"
                      />
                      <div className="flex justify-between text-sm text-gray-500 mt-2 px-1">
                        <span>$0</span>
                        <span>$100</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right column: Auto-top-up section (2/5 width on desktop) */}
                <div className="w-full md:w-2/5 space-y-4 md:pt-0 md:border-t-0 border-t border-gray-200 pt-4 md:border-l md:border-gray-200 md:pl-6">
                  <div>
                    {/* Auto-top-up toggle */}
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="auto-topup"
                        checked={localAutoTopupEnabled}
                        onCheckedChange={(checked) => handleAutoTopupToggle(checked === true)}
                        disabled={isUpdatingAutoTopup}
                      />
                      <label htmlFor="auto-topup" className="text-sm font-light cursor-pointer flex items-center space-x-2">
                        <Settings className="w-4 h-4 text-gray-500" />
                        <span>Enable auto-top-up</span>
                      </label>
                    </div>

                    {/* Auto-top-up threshold setting - show when enabled or when setup is complete */}
                    {(localAutoTopupEnabled || autoTopupPreferences?.setupCompleted) && (
                      <div className="space-y-3 mt-4 mb-4">
                        <SliderWithValue
                          label="Trigger when balance drops below:"
                          value={localAutoTopupThreshold}
                          onChange={handleAutoTopupThresholdChange}
                          min={1}
                          max={Math.max(1, purchaseAmount - 1)}
                          step={1}
                          variant="secondary"
                          formatValue={(value) => `$${value}`}
                          disabled={isUpdatingAutoTopup}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Auto-top-up info section - below both columns */}
              {localAutoTopupEnabled && (
                <div className={`rounded-lg p-3 w-full ${
                  autoTopupState === 'active' ? 'bg-green-50 border border-green-200' :
                  autoTopupState === 'setup-but-disabled' ? 'bg-yellow-50 border border-yellow-200' :
                  autoTopupState === 'enabled-but-not-setup' ? 'bg-blue-50 border border-blue-200' :
                  'bg-gray-50 border border-gray-200'
                }`}>
                  <p className={`text-sm ${
                    autoTopupState === 'active' ? 'text-green-800' :
                    autoTopupState === 'setup-but-disabled' ? 'text-yellow-800' :
                    autoTopupState === 'enabled-but-not-setup' ? 'text-blue-800' :
                    'text-gray-700'
                  }`}>
                    {autoTopupState === 'enabled-but-not-setup' ? (
                      <>
                        You've enabled auto-top-up, but it's not set up. To auto-top-up <strong>{formatDollarAmount(purchaseAmount)}</strong> when the balance drops below <strong>{formatDollarAmount(localAutoTopupThreshold)}</strong>, click the button below.
                      </>
                    ) : (
                      getAutoTopupSummary()
                    )}
                  </p>
                </div>
              )}

              <Button
                onClick={handlePurchase}
                disabled={isCreatingCheckout || purchaseAmount === 0}
                className="w-full"
              >
                {(() => {
                  // Show set-up button when enabled but not setup
                  const showSetupButton = localAutoTopupEnabled && autoTopupState === 'enabled-but-not-setup';
                  
                  if (isCreatingCheckout) {
                    return (
                      <div className="animate-spin">
                        <DollarSign className="w-4 h-4" />
                      </div>
                    );
                  }
                  
                  if (purchaseAmount === 0) {
                    return "Select an amount to add";
                  }
                  
                  if (showSetupButton) {
                    return (
                      <>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Add {formatDollarAmount(purchaseAmount)} and set-up auto-top-up
                      </>
                    );
                  }
                  
                  return (
                    <>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Add {formatDollarAmount(purchaseAmount)}
                    </>
                  );
                })()}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="history" className="flex-1 pb-2 pt-0 space-y-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:[&::-webkit-scrollbar]:block sm:[-ms-overflow-style:auto] sm:[scrollbar-width:auto] px-1">
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {isLoadingLedger ? (
                <div className="p-8 text-center">
                  <div className="animate-pulse">
                    <History className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">Loading transaction history...</p>
                  </div>
                </div>
              ) : (ledgerData?.entries?.filter(tx => tx.type !== 'spend').length || 0) === 0 ? (
                <div className="p-8 text-center">
                  <Gift className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No transactions yet</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Add budget to start using Reigh's AI features
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20 sm:w-auto">Date</TableHead>
                      <TableHead className="w-16 sm:w-auto">Type</TableHead>
                      <TableHead className="w-20 sm:w-auto">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerData?.entries?.filter(tx => tx.type !== 'spend').map((tx, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-xs sm:text-sm w-20 sm:w-auto">
                          <UpdatingTimeCell date={tx.created_at} />
                        </TableCell>
                        <TableCell className="w-16 sm:w-auto">
                          <Badge
                            variant={tx.type === 'purchase' ? 'default' : 'secondary'}
                            className="text-xs px-2 py-1"
                          >
                            {formatTransactionType(tx.type)}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`font-light text-xs sm:text-sm w-20 sm:w-auto ${
                            tx.amount > 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {tx.amount > 0 ? `+${formatCurrency(tx.amount)}` : formatCurrency(tx.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="task-log" className="flex-1 pb-2 pt-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:[&::-webkit-scrollbar]:block sm:[-ms-overflow-style:auto] sm:[scrollbar-width:auto] px-1">
            {/* Mobile notice */}
            <div className="sm:hidden p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
              <p className="text-sm text-blue-700">More details are available on desktop</p>
            </div>
            
            {/* Filters Bar */}
            <div className="p-4 bg-gray-50 rounded-lg border space-y-3 sm:space-y-0 mt-1 mb-6">
              <div className="flex items-center gap-2 sm:hidden">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-light text-gray-700">Filter by:</span>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <div className="hidden sm:flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-light text-gray-700">Filter by:</span>
                </div>

              {/* Cost Filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    Cost
                    {taskLogFilters.costFilter !== 'all' && (
                      <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                        1
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 mx-2" align="start">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h4 className="font-light text-sm">Filter by Cost</h4>
                      {taskLogFilters.costFilter !== 'all' && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => updateFilter('costFilter', 'all')}
                          className="h-6 px-2 text-xs"
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="cost-all"
                          name="cost-filter"
                          checked={taskLogFilters.costFilter === 'all'}
                          onChange={() => updateFilter('costFilter', 'all')}
                          className="w-4 h-4"
                        />
                        <label htmlFor="cost-all" className="text-sm cursor-pointer font-light">
                          All Costs
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="cost-free"
                          name="cost-filter"
                          checked={taskLogFilters.costFilter === 'free'}
                          onChange={() => updateFilter('costFilter', 'free')}
                          className="w-4 h-4"
                        />
                        <label htmlFor="cost-free" className="text-sm cursor-pointer">
                          Free Tasks
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="cost-paid"
                          name="cost-filter"
                          checked={taskLogFilters.costFilter === 'paid'}
                          onChange={() => updateFilter('costFilter', 'paid')}
                          className="w-4 h-4"
                        />
                        <label htmlFor="cost-paid" className="text-sm cursor-pointer">
                          Paid Tasks
                        </label>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Status Filter */}
              {taskLogData?.availableFilters?.statuses?.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8">
                      Status
                      {taskLogFilters.status.length > 0 && (
                        <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                          {taskLogFilters.status.length}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 mx-2" align="start">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <h4 className="font-light text-sm">Filter by Status</h4>
                        {taskLogFilters.status.length > 0 && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => updateFilter('status', [])}
                            className="h-6 px-2 text-xs"
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 pb-1 border-b">
                        <Checkbox
                          id="status-all"
                          checked={taskLogFilters.status.length === 0}
                          onCheckedChange={() => updateFilter('status', [])}
                        />
                        <label htmlFor="status-all" className="text-sm cursor-pointer font-light">
                          All Statuses ({taskLogData.availableFilters.statuses.length})
                        </label>
                      </div>
                      {taskLogData.availableFilters.statuses.map((status) => (
                        <div key={status} className="flex items-center space-x-2">
                          <Checkbox
                            id={`status-${status}`}
                            checked={taskLogFilters.status.includes(status)}
                            onCheckedChange={() => toggleArrayFilter('status', status)}
                          />
                          <label htmlFor={`status-${status}`} className="text-sm cursor-pointer">
                            {status}
                          </label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Task Type Filter */}
              {taskLogData?.availableFilters?.taskTypes?.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8">
                      Task Type
                      {taskLogFilters.taskTypes.length > 0 && (
                        <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                          {taskLogFilters.taskTypes.length}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 mx-2" align="start">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <h4 className="font-light text-sm">Filter by Task Type</h4>
                        {taskLogFilters.taskTypes.length > 0 && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => updateFilter('taskTypes', [])}
                            className="h-6 px-2 text-xs"
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 pb-1 border-b">
                        <Checkbox
                          id="taskType-all"
                          checked={taskLogFilters.taskTypes.length === 0}
                          onCheckedChange={() => updateFilter('taskTypes', [])}
                        />
                        <label htmlFor="taskType-all" className="text-sm cursor-pointer font-light">
                          All Types ({taskLogData.availableFilters.taskTypes.length})
                        </label>
                      </div>
                      {taskLogData.availableFilters.taskTypes.map((taskType) => (
                        <div key={taskType} className="flex items-center space-x-2">
                          <Checkbox
                            id={`taskType-${taskType}`}
                            checked={taskLogFilters.taskTypes.includes(taskType)}
                            onCheckedChange={() => toggleArrayFilter('taskTypes', taskType)}
                          />
                          <label htmlFor={`taskType-${taskType}`} className="text-sm cursor-pointer">
                            {formatTaskType(taskType)}
                          </label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Project Filter */}
              {taskLogData?.availableFilters?.projects?.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8">
                      Project
                      {taskLogFilters.projectIds.length > 0 && (
                        <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                          {taskLogFilters.projectIds.length}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 mx-2" align="start">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <h4 className="font-light text-sm">Filter by Project</h4>
                        {taskLogFilters.projectIds.length > 0 && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => updateFilter('projectIds', [])}
                            className="h-6 px-2 text-xs"
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 pb-1 border-b">
                        <Checkbox
                          id="project-all"
                          checked={taskLogFilters.projectIds.length === 0}
                          onCheckedChange={() => updateFilter('projectIds', [])}
                        />
                        <label htmlFor="project-all" className="text-sm cursor-pointer font-light">
                          All Projects ({taskLogData.availableFilters.projects.length})
                        </label>
                      </div>
                      {taskLogData.availableFilters.projects.map((project) => (
                        <div key={project.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`project-${project.id}`}
                            checked={taskLogFilters.projectIds.includes(project.id)}
                            onCheckedChange={() => toggleArrayFilter('projectIds', project.id)}
                          />
                          <label htmlFor={`project-${project.id}`} className="text-sm cursor-pointer truncate">
                            {project.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

                {/* Clear Filters */}
                {getFilterCount() > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-gray-500">
                    Clear ({getFilterCount()})
                  </Button>
                )}
              </div>
            </div>

            {/* Download Button Section */}
            <div className="flex justify-end items-center gap-2 mb-4">
              <span className="text-sm text-gray-500">
                {taskLogData?.pagination.total || 0} task{(taskLogData?.pagination.total || 0) !== 1 ? 's' : ''}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDownloadTaskLog}
                disabled={isDownloading || !taskLogData?.tasks?.length}
                className="h-8"
              >
                {isDownloading ? (
                  <div className="animate-spin">
                    <Download className="w-4 h-4" />
                  </div>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-1" />
                    Download CSV
                  </>
                )}
              </Button>
            </div>

            {/* Helper text when no filters are active */}
            {getFilterCount() === 0 && taskLogData?.availableFilters && (
              <div className="text-center py-2">
                <p className="text-sm text-gray-600">
                  💡 <strong>Tip:</strong> Use the filters above to analyze tasks by{' '}
                  {taskLogData.availableFilters.projects.length > 1 && 'project, '}
                  {taskLogData.availableFilters.taskTypes.length > 1 && 'task type, '}
                  {taskLogData.availableFilters.statuses.length > 1 && 'status, '}
                  and cost
                </p>
              </div>
            )}

            {/* Task Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {isLoadingTaskLog ? (
                <div className="p-8 text-center">
                  <div className="animate-pulse">
                    <Activity className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">Loading task log...</p>
                  </div>
                </div>
              ) : (taskLogData?.tasks?.length || 0) === 0 ? (
                <div className="p-8 text-center">
                  <Activity className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">
                    {getFilterCount() > 0 ? 'No tasks match your filters' : 'No tasks yet'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {getFilterCount() > 0 ? 
                      'Try adjusting your filters to see more results' :
                      'Create some AI generations to see your task history'
                    }
                  </p>
                  {getFilterCount() > 0 && (
                    <Button variant="outline" size="sm" onClick={clearFilters} className="mt-2">
                      Clear Filters
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20 sm:w-auto">Date</TableHead>
                        <TableHead className="w-24 sm:w-auto">Task Type</TableHead>
                        <TableHead className="hidden sm:table-cell">Project</TableHead>
                        <TableHead className="hidden sm:table-cell">Status</TableHead>
                        <TableHead className="hidden sm:table-cell">Duration</TableHead>
                        <TableHead className="w-16 sm:w-auto">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {taskLogData?.tasks?.map((task) => (
                        <TableRow key={task.id}>
                          <TableCell className="text-xs sm:text-sm w-20 sm:w-auto">
                            <UpdatingTimeCell date={task.createdAt} />
                          </TableCell>
                          <TableCell className="w-24 sm:w-auto">
                            <Badge variant="outline" className="capitalize py-1 px-2 text-xs whitespace-nowrap">
                              {formatTaskType(task.taskType)}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-gray-600 max-w-[120px] truncate">
                            {task.projectName || 'Unknown Project'}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge
                              variant={
                                task.status === 'Complete' ? 'default' : 
                                task.status === 'Failed' ? 'destructive' : 
                                'secondary'
                              }
                            >
                              {task.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-gray-600">
                            {task.duration ? `${task.duration}s` : '-'}
                          </TableCell>
                          <TableCell 
                            className={`font-light text-xs sm:text-sm w-16 sm:w-auto ${
                              task.cost ? 'text-red-600' : 'text-gray-400'
                            }`}
                          >
                            {task.cost ? `$${parseFloat(task.cost.toString()).toFixed(3)}` : 'Free'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>

                  {/* Pagination */}
                  {taskLogData?.pagination && taskLogData.pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
                      <div className="text-sm text-gray-600">
                        Page {taskLogData.pagination.currentPage} of {taskLogData.pagination.totalPages}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTaskLogPage(p => Math.max(1, p - 1))}
                          disabled={taskLogPage === 1}
                          className="h-8"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTaskLogPage(p => p + 1)}
                          disabled={!taskLogData.pagination.hasMore}
                          className="h-8"
                        >
                          Next
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
        </div>
    </div>
  );
};

export default CreditsManagement; 