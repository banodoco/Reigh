import React, { useState, useRef, useEffect } from 'react';
import { Coins, CreditCard, History, Gift, DollarSign, Activity, Filter, ChevronLeft, ChevronRight, Download, Copy, Check } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Slider } from '@/shared/components/ui/slider';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
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
import { getTaskDisplayName } from '@/shared/lib/taskConfig';
import { formatDistanceToNow } from 'date-fns';
import { UpdatingTimeCell } from '@/shared/components/UpdatingTimeCell';

interface CreditsManagementProps {
  initialTab?: 'purchase' | 'history' | 'task-log';
  mode?: 'add-credits' | 'transactions' | 'all';
}

const CreditsManagement: React.FC<CreditsManagementProps> = ({ initialTab = 'history', mode = 'all' }) => {
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
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);

  const { data: taskLogData, isLoading: isLoadingTaskLog } = useTaskLog(20, taskLogPage, taskLogFilters);

  // Copy task ID to clipboard
  const handleCopyTaskId = (taskId: string) => {
    navigator.clipboard.writeText(taskId);
    setCopiedTaskId(taskId);
    setTimeout(() => setCopiedTaskId(null), 2000);
  };

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
      console.log('[AutoTopup:Init] Initializing auto-top-up state from preferences:', autoTopupPreferences);
      setLocalAutoTopupEnabled(autoTopupPreferences.enabled);
      setLocalAutoTopupThreshold(autoTopupPreferences.threshold || 10);
      
      // If user has a saved auto-top-up amount, use that as the purchase amount
      if (autoTopupPreferences.amount && autoTopupPreferences.amount !== 50) {
        console.log('[AutoTopup:Init] Setting purchase amount from saved auto-top-up amount:', autoTopupPreferences.amount);
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

  // Use centralized task config for display names (same as TasksPane)
  const formatTaskType = getTaskDisplayName;

  // Update auto-top-up threshold when purchase amount changes (only for truly new users, not when restoring saved preferences)
  React.useEffect(() => {
    // Only auto-update threshold if:
    // 1. We've finished initialization 
    // 2. User doesn't have saved preferences (threshold is default 10)
    // 3. Purchase amount changes
    if (hasInitialized && autoTopupPreferences && autoTopupPreferences.threshold === 10 && purchaseAmount !== 50) {
      const defaultThreshold = Math.max(1, Math.floor(purchaseAmount / 5));
      console.log('[AutoTopup:Threshold] Auto-updating threshold for new user:', { purchaseAmount, defaultThreshold });
      setLocalAutoTopupThreshold(defaultThreshold);
    }
  }, [purchaseAmount, hasInitialized, autoTopupPreferences]);

  // Handle auto-top-up preference changes
  const handleAutoTopupToggle = (enabled: boolean) => {
    console.log('[AutoTopup:Toggle] Checkbox clicked:', { enabled, currentLocal: localAutoTopupEnabled });
    setLocalAutoTopupEnabled(enabled);
    
    // Immediately save preference changes
    const saveData = {
      enabled,
      amount: purchaseAmount, // Use the purchase amount from the slider above
      threshold: localAutoTopupThreshold,
    };
    console.log('[AutoTopup:Save] Saving preferences:', saveData);
    updateAutoTopup(saveData);
  };

  // Debounce timer for threshold changes
  const thresholdDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleAutoTopupThresholdChange = (threshold: number) => {
    setLocalAutoTopupThreshold(threshold);
    
    // Debounce the save - only save after user stops changing for 500ms
    if (thresholdDebounceRef.current) {
      clearTimeout(thresholdDebounceRef.current);
    }
    thresholdDebounceRef.current = setTimeout(() => {
    updateAutoTopup({
      enabled: localAutoTopupEnabled,
        amount: purchaseAmount,
      threshold,
    });
    }, 500);
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (thresholdDebounceRef.current) {
        clearTimeout(thresholdDebounceRef.current);
      }
    };
  }, []);

  // Handle purchase amount changes - update auto-top-up amount if enabled
  const handlePurchaseAmountChange = (amount: number) => {
    setPurchaseAmount(amount);
    
    // If auto-top-up is enabled, update both amount and threshold
    if (localAutoTopupEnabled) {
      // Auto-calculate new threshold as 1/5 of purchase amount (minimum 1)
      const newThreshold = Math.max(1, Math.floor(amount / 5));
      
      console.log('[AutoTopup:Purchase] Updating auto-top-up amount and threshold:', { 
        amount, 
        newThreshold, 
        previousThreshold: localAutoTopupThreshold 
      });
      
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
    console.log('[AutoTopup:State] State computation:', {
      serverEnabled: autoTopupPreferences.enabled,
      localEnabled: enabled,
      setupCompleted,
      finalState: enabled && setupCompleted ? 'active' : 
                   !enabled && setupCompleted ? 'setup-but-disabled' : 
                   enabled && !setupCompleted ? 'enabled-but-not-setup' : 'not-setup'
    });
    
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
          id: task.id,
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
      const headers = ['ID', 'Date', 'Task Type', 'Project', 'Status', 'Duration', 'Cost'];
      const csvContent = [
        headers.join(','),
        ...tasks.map(task => [
          task.id,
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
    <div className="space-y-3">
        {/* Add Credits Section */}
        {(mode === 'all' || mode === 'add-credits') && (
        <div className="space-y-3">
          {/* Current Balance Container */}
          <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-lg border border-emerald-100 dark:border-emerald-800">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Current balance</span>
              <span className="text-lg font-semibold text-foreground ml-auto">
                {isLoadingBalance ? (
                  <span className="animate-pulse bg-muted rounded w-16 h-5 inline-block"></span>
                ) : (
                  formatCurrency(balance?.balance || 0)
                )}
              </span>
          </div>
                  </div>
                
          {/* Add Credits Container */}
          <div className="p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-800 space-y-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-500 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Add credits</span>
              <span className="text-lg font-semibold text-foreground ml-auto">{formatDollarAmount(purchaseAmount)}</span>
                    </div>
                    
            <div className="px-1">
                      <Slider
                        value={[purchaseAmount]}
                        onValueChange={(value) => handlePurchaseAmountChange(value[0])}
                        min={0}
                        max={100}
                        step={5}
                      />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>$0</span>
                        <span>$100</span>
                  </div>
                </div>

            {/* Auto top-up */}
            <div className="flex items-center text-sm pt-2 border-t border-blue-100 dark:border-blue-800">
              <div className="flex items-center gap-2">
                      <Checkbox
                        id="auto-topup"
                        checked={localAutoTopupEnabled}
                        onCheckedChange={(checked) => handleAutoTopupToggle(checked === true)}
                        disabled={isUpdatingAutoTopup}
                      />
                <label htmlFor="auto-topup" className="text-muted-foreground cursor-pointer">
                  Auto top-up when below
                      </label>
                <div className="flex items-center">
                  <span className="text-muted-foreground">$</span>
                  <input
                    type="number"
                          min={1}
                          max={Math.max(1, purchaseAmount - 1)}
                    value={localAutoTopupThreshold}
                    onChange={(e) => {
                      const val = Math.min(Math.max(1, Number(e.target.value)), purchaseAmount - 1);
                      handleAutoTopupThresholdChange(val);
                    }}
                    disabled={!localAutoTopupEnabled || isUpdatingAutoTopup}
                    className="w-12 px-1 py-0.5 text-sm text-center border border-border rounded disabled:opacity-50 disabled:bg-muted bg-background text-foreground"
                        />
                      </div>
                  </div>
              {localAutoTopupEnabled && autoTopupState === 'active' && (
                <span className="text-xs text-green-600 ml-auto">✓ Active</span>
              )}
                </div>

              <Button
                variant="retro"
                size="retro-sm"
                onClick={handlePurchase}
                disabled={isCreatingCheckout || purchaseAmount === 0}
                className="w-full"
              >
              {isCreatingCheckout ? (
                <DollarSign className="w-4 h-4 animate-spin" />
              ) : purchaseAmount === 0 ? (
                "Select an amount"
              ) : localAutoTopupEnabled && autoTopupState === 'enabled-but-not-setup' ? (
                <>Add {formatDollarAmount(purchaseAmount)} and set up auto-top-up</>
              ) : (
                <>Add {formatDollarAmount(purchaseAmount)}</>
              )}
            </Button>
                      </div>
        </div>
        )}

        {/* Transaction History Section */}
        {(mode === 'all' || mode === 'transactions') && (
        <div className={`px-1 ${mode === 'all' ? 'mt-6' : ''}`}>
          <div className="flex justify-center mb-3">
            <SegmentedControl
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as 'history' | 'task-log')}
              size="sm"
              className="w-full max-w-xs"
            >
              <SegmentedControlItem value="history">
                Transactions
              </SegmentedControlItem>
              <SegmentedControlItem value="task-log">
                Task Log
              </SegmentedControlItem>
            </SegmentedControl>
          </div>

          {activeTab === 'history' && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {isLoadingLedger ? (
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
                      {[1, 2, 3, 4, 5].map((i) => (
                        <TableRow key={i}>
                          <TableCell className="w-20 sm:w-auto">
                            <Skeleton className="h-4 w-20" />
                          </TableCell>
                          <TableCell className="w-16 sm:w-auto">
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </TableCell>
                          <TableCell className="w-20 sm:w-auto">
                            <Skeleton className="h-4 w-14" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
          )}

          {activeTab === 'task-log' && (
            <div>
            {/* Mobile notice */}
            <div className="sm:hidden p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
              <p className="text-sm text-blue-700">More details are available on desktop</p>
            </div>
            
            {/* Filters Bar */}
            <div className="p-4 bg-muted rounded-lg border border-border space-y-3 sm:space-y-0 mt-1 mb-6">
              <div className="flex items-center gap-2 sm:hidden">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-light text-foreground">Filter by:</span>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <div className="hidden sm:flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-light text-foreground">Filter by:</span>
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
                <div className="overflow-x-auto">
                  <Table className="table-fixed w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">ID</TableHead>
                        <TableHead className="w-16">Date</TableHead>
                        <TableHead className="w-28">Task Type</TableHead>
                        <TableHead className="hidden sm:table-cell w-20">Project</TableHead>
                        <TableHead className="hidden sm:table-cell w-20">Status</TableHead>
                        <TableHead className="hidden sm:table-cell w-16">Duration</TableHead>
                        <TableHead className="w-16">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                        <TableRow key={i}>
                          <TableCell className="p-2">
                            <Skeleton className="h-5 w-8" />
                          </TableCell>
                          <TableCell className="p-2">
                            <Skeleton className="h-4 w-16" />
                          </TableCell>
                          <TableCell className="p-2">
                            <Skeleton className="h-5 w-20 rounded-full" />
                          </TableCell>
                          <TableCell className="hidden sm:table-cell p-2">
                            <Skeleton className="h-4 w-24" />
                          </TableCell>
                          <TableCell className="hidden sm:table-cell p-2">
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </TableCell>
                          <TableCell className="hidden sm:table-cell p-2">
                            <Skeleton className="h-4 w-12" />
                          </TableCell>
                          <TableCell className="p-2">
                            <Skeleton className="h-4 w-10" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
                  <Table className="table-fixed w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">ID</TableHead>
                        <TableHead className="w-16">Date</TableHead>
                        <TableHead className="w-28">Task Type</TableHead>
                        <TableHead className="hidden sm:table-cell w-20">Project</TableHead>
                        <TableHead className="hidden sm:table-cell w-20">Status</TableHead>
                        <TableHead className="hidden sm:table-cell w-16">Duration</TableHead>
                        <TableHead className="w-16">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {taskLogData?.tasks?.map((task) => (
                        <TableRow key={task.id}>
                          <TableCell className="p-2">
                            <button
                              onClick={() => handleCopyTaskId(task.id)}
                              className={`flex items-center gap-1 px-1 py-0.5 text-[10px] rounded transition-colors border ${
                                copiedTaskId === task.id
                                  ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/50 border-green-300 dark:border-green-700'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted border-border hover:border-foreground/30'
                              }`}
                              title={`Copy task ID: ${task.id}`}
                            >
                              {copiedTaskId === task.id ? (
                                  <Check className="w-3 h-3" />
                              ) : (
                                  <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </TableCell>
                          <TableCell className="text-xs p-2">
                            <UpdatingTimeCell date={task.createdAt} />
                          </TableCell>
                          <TableCell className="p-2">
                            <Badge variant="outline" className="capitalize py-0.5 px-1.5 text-[10px] whitespace-nowrap">
                              {formatTaskType(task.taskType)}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-gray-600 truncate p-2">
                            {task.projectName || 'Unknown'}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell p-2">
                            <Badge
                              variant={
                                task.status === 'Complete' ? 'default' : 
                                task.status === 'Failed' ? 'destructive' : 
                                'secondary'
                              }
                              className="text-[10px] px-1.5 py-0.5"
                            >
                              {task.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-gray-600 p-2">
                            {task.duration ? `${task.duration}s` : '-'}
                          </TableCell>
                          <TableCell 
                            className={`font-light text-xs p-2 ${
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
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted">
                      <div className="text-sm text-muted-foreground">
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
        </div>
          )}
        </div>
        )}
    </div>
  );
};

export default CreditsManagement; 