import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Gift, Sparkles } from 'lucide-react';

interface WelcomeBonusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WelcomeBonusModal: React.FC<WelcomeBonusModalProps> = ({
  isOpen,
  onClose,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
            <Gift className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <DialogTitle className="text-2xl font-bold text-center">
            Welcome to Reigh! 🎉
          </DialogTitle>
        </DialogHeader>
        
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-2 text-lg">
            <Sparkles className="w-5 h-5 text-yellow-500" />
            <span className="font-semibold">We've added $5 to your account to help test our cloud service!</span>
            <Sparkles className="w-5 h-5 text-yellow-500" />
          </div>
          
          <p className="text-muted-foreground">
            Your credits are ready to use. If anything isn't working for you, please let me know in <a href="https://discord.gg/D5K2c6kfhy" className="underline">the Discord</a>!
          </p>
          {/* <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">
              💡 <strong>Tip:</strong> Credits are used for AI generation tasks. Check your balance anytime in Settings.
            </p>
          </div> */}
        </div>
        
        <div className="flex justify-center pt-4">
          <Button onClick={onClose} className="w-full sm:w-auto">
            Get Started
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 