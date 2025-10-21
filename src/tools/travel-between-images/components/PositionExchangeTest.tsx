import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card';
import { useEnhancedShotPositions } from '@/shared/hooks/useEnhancedShotPositions';
import { toast } from 'sonner';

interface PositionExchangeTestProps {
  shotId: string;
}

/**
 * Test component for verifying position exchange functionality
 */
const PositionExchangeTest: React.FC<PositionExchangeTestProps> = ({ shotId }) => {
  const [genIdA, setGenIdA] = useState('');
  const [genIdB, setGenIdB] = useState('');
  const [testGenId, setTestGenId] = useState('');
  const [newFrame, setNewFrame] = useState(120);

  const {
    shotGenerations,
    isLoading,
    exchangePositions,
    deleteItem,
    addItem,
    updateTimelineFrame,
    initializeTimelineFrames,
    loadPositions
  } = useEnhancedShotPositions(shotId);

  const handleExchange = async () => {
    if (!genIdA || !genIdB) {
      toast.error('Please enter both generation IDs');
      return;
    }

    try {
      await exchangePositions(genIdA, genIdB);
      setGenIdA('');
      setGenIdB('');
    } catch (error) {
      console.error('Exchange test failed:', error);
    }
  };

  const handleDelete = async () => {
    if (!testGenId) {
      toast.error('Please enter a generation ID');
      return;
    }

    try {
      await deleteItem(testGenId);
      setTestGenId('');
    } catch (error) {
      console.error('Delete test failed:', error);
    }
  };

  const handleUpdateFrame = async () => {
    if (!testGenId) {
      toast.error('Please enter a generation ID');
      return;
    }

    try {
      await updateTimelineFrame(testGenId, newFrame, { user_positioned: true });
    } catch (error) {
      console.error('Update frame test failed:', error);
    }
  };

  const handleInitialize = async () => {
    try {
      await initializeTimelineFrames(60);
    } catch (error) {
      console.error('Initialize test failed:', error);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div>Loading shot positions...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Position Exchange Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current State Display */}
        <div>
          <h4 className="font-medium mb-2">Current Positions:</h4>
          <div className="space-y-1 text-sm font-mono bg-muted p-2 rounded max-h-40 overflow-y-auto">
            {shotGenerations.map(sg => (
              <div key={sg.id}>
                {sg.generation_id.substring(0, 8)}: pos={Math.floor((sg.timeline_frame ?? 0) / 50)}, frame={sg.timeline_frame || 'null'}
              </div>
            ))}
          </div>
        </div>

        {/* Exchange Test */}
        <div className="space-y-2">
          <h4 className="font-medium">Exchange Positions:</h4>
          <div className="flex gap-2">
            <Input
              placeholder="Generation ID A"
              value={genIdA}
              onChange={(e) => setGenIdA(e.target.value)}
              className="font-mono text-xs"
            />
            <Input
              placeholder="Generation ID B"
              value={genIdB}
              onChange={(e) => setGenIdB(e.target.value)}
              className="font-mono text-xs"
            />
            <Button onClick={handleExchange} size="sm">
              Exchange
            </Button>
          </div>
        </div>

        {/* Delete Test */}
        <div className="space-y-2">
          <h4 className="font-medium">Delete Item:</h4>
          <div className="flex gap-2">
            <Input
              placeholder="Generation ID"
              value={testGenId}
              onChange={(e) => setTestGenId(e.target.value)}
              className="font-mono text-xs"
            />
            <Button onClick={handleDelete} size="sm" variant="destructive">
              Delete
            </Button>
          </div>
        </div>

        {/* Update Frame Test */}
        <div className="space-y-2">
          <h4 className="font-medium">Update Timeline Frame:</h4>
          <div className="flex gap-2">
            <Input
              placeholder="Generation ID"
              value={testGenId}
              onChange={(e) => setTestGenId(e.target.value)}
              className="font-mono text-xs"
            />
            <Input
              type="number"
              placeholder="New Frame"
              value={newFrame}
              onChange={(e) => setNewFrame(parseInt(e.target.value) || 0)}
              className="w-24"
            />
            <Button onClick={handleUpdateFrame} size="sm">
              Update Frame
            </Button>
          </div>
        </div>

        {/* Utility Actions */}
        <div className="flex gap-2 pt-2 border-t">
          <Button onClick={handleInitialize} size="sm" variant="outline">
            Initialize Timeline Frames
          </Button>
          <Button onClick={loadPositions} size="sm" variant="outline">
            Refresh
          </Button>
        </div>

        {/* Quick Copy Helper */}
        <div className="text-xs text-muted-foreground">
          <strong>Quick copy IDs:</strong> Click any ID above to copy to clipboard
          <div className="mt-1">
            {shotGenerations.slice(0, 3).map(sg => (
              <button
                key={sg.id}
                onClick={() => {
                  navigator.clipboard.writeText(sg.generation_id);
                }}
                className="mr-2 underline hover:no-underline"
              >
                {sg.generation_id.substring(0, 8)}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PositionExchangeTest;
