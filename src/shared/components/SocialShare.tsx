import React from 'react';
import { Share2, Twitter, Facebook, Copy } from 'lucide-react';
import { toast } from '@/shared/components/ui/use-toast';

interface SocialShareProps {
  url?: string;
  title?: string;
  text?: string;
}

const SocialShare: React.FC<SocialShareProps> = ({
  url = typeof window !== 'undefined' ? window.location.href : '',
  title = 'Reigh',
  text = 'Check out Reigh – a tool and community for exploring the emerging artform of image-guided video.',
}) => {
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ description: 'Link copied to clipboard.' });
    } catch {
      toast({ description: 'Unable to copy link.' });
    }
  };

  const shareToFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, '_blank', 'noopener,noreferrer');
  };

  const shareToTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`, '_blank', 'noopener,noreferrer');
  };

  const webShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        /* user cancelled share */
      }
    } else {
      handleCopy();
    }
  };

  const buttonClass =
    'p-3 bg-white/80 backdrop-blur-sm rounded-full border-2 hover:shadow-wes-hover transition-colors';

  return (
    <div className="mt-12 flex items-center justify-center space-x-4">
      <button
        onClick={webShare}
        aria-label="Share"
        className={`${buttonClass} border-wes-mint/40 hover:border-wes-mint/60`}
      >
        <Share2 className="w-5 h-5 text-wes-mint" />
      </button>
      <button
        onClick={shareToTwitter}
        aria-label="Share on Twitter"
        className={`${buttonClass} border-wes-coral/40 hover:border-wes-coral/60`}
      >
        <Twitter className="w-5 h-5 text-wes-coral" />
      </button>
      <button
        onClick={shareToFacebook}
        aria-label="Share on Facebook"
        className={`${buttonClass} border-wes-vintage-gold/40 hover:border-wes-vintage-gold/60`}
      >
        <Facebook className="w-5 h-5 text-wes-vintage-gold" />
      </button>
      <button
        onClick={handleCopy}
        aria-label="Copy link"
        className={`${buttonClass} border-wes-vintage-gold/40 hover:border-wes-vintage-gold/60`}
      >
        <Copy className="w-5 h-5 text-wes-vintage-gold" />
      </button>
    </div>
  );
};

export default SocialShare; 