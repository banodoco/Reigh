import React from 'react';
import { Card } from '@/shared/components/ui/card';
import { Separator } from '@/shared/components/ui/separator';

export const EmptyState = React.memo(() => (
  <Card className="p-4 sm:p-6">
    <div className="flex flex-col space-y-2 sm:space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base sm:text-lg font-light flex items-center gap-2">
          Output Videos &nbsp;(0)
        </h3>
      </div>

      <Separator className="my-2" />

      <div className="text-center text-muted-foreground pb-8 pt-12">
        <p>No video outputs yet. Generate some videos to see them here.</p>
      </div>
    </div>
  </Card>
));
