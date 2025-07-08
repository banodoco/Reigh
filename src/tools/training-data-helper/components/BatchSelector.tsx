import React, { useState } from 'react';
import { Plus, FolderOpen } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { TrainingDataBatch } from '../hooks/useTrainingData';

interface BatchSelectorProps {
  batches: TrainingDataBatch[];
  selectedBatchId: string | null;
  onSelectBatch: (batchId: string) => void;
  onCreateBatch: (name: string, description?: string) => Promise<string>;
}

export function BatchSelector({ batches, selectedBatchId, onSelectBatch, onCreateBatch }: BatchSelectorProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchDescription, setNewBatchDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateBatch = async () => {
    if (!newBatchName.trim()) return;
    
    setIsCreating(true);
    try {
      await onCreateBatch(newBatchName.trim(), newBatchDescription.trim() || undefined);
      setNewBatchName('');
      setNewBatchDescription('');
      setIsCreateDialogOpen(false);
    } catch (error) {
      console.error('Error creating batch:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Training Data Batch
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Select value={selectedBatchId || ''} onValueChange={onSelectBatch}>
              <SelectTrigger>
                <SelectValue placeholder="Select a batch..." />
              </SelectTrigger>
              <SelectContent>
                {batches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id}>
                    {batch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center gap-1">
                <Plus className="h-4 w-4" />
                New Batch
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Batch</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="batch-name">Batch Name</Label>
                  <Input
                    id="batch-name"
                    value={newBatchName}
                    onChange={(e) => setNewBatchName(e.target.value)}
                    placeholder="Enter batch name..."
                  />
                </div>
                
                <div>
                  <Label htmlFor="batch-description">Description (optional)</Label>
                  <Textarea
                    id="batch-description"
                    value={newBatchDescription}
                    onChange={(e) => setNewBatchDescription(e.target.value)}
                    placeholder="Describe this batch..."
                    rows={3}
                  />
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                    disabled={isCreating}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateBatch}
                    disabled={!newBatchName.trim() || isCreating}
                  >
                    {isCreating ? 'Creating...' : 'Create Batch'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        {selectedBatch && (
          <div className="mt-3 p-3 bg-muted rounded-lg">
            <h4 className="font-medium text-sm">{selectedBatch.name}</h4>
            {selectedBatch.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {selectedBatch.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Created: {new Date(selectedBatch.createdAt).toLocaleString()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 