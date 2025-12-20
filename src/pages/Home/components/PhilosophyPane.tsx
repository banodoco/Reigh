import React, { useRef, useEffect } from 'react';
import { GlassSidePane } from './GlassSidePane';

interface ExampleStyle {
  prompt: string;
  image1: string;
  image2: string;
  video: string;
}

interface PhilosophyPaneProps {
  isOpen: boolean;
  onClose: () => void;
  isClosing: boolean;
  isOpening: boolean;
  currentExample: ExampleStyle;
  navigate: (path: string) => void;
  selectedExampleStyle: string;
}

export const PhilosophyPane: React.FC<PhilosophyPaneProps> = ({
  isOpen,
  onClose,
  isClosing,
  isOpening,
  currentExample,
  navigate,
  selectedExampleStyle,
}) => {
  const philosophyVideoRef = useRef<HTMLVideoElement | null>(null);

  // Play video when pane finishes opening, reset when fully closed
  useEffect(() => {
    if (isOpen && !isOpening && philosophyVideoRef.current) {
      philosophyVideoRef.current.currentTime = 0;
      philosophyVideoRef.current.play().catch(() => {});
    } else if (!isOpen && !isClosing && philosophyVideoRef.current) {
      philosophyVideoRef.current.pause();
      philosophyVideoRef.current.currentTime = 0;
      // Also hide the play button overlay
      const playButton = philosophyVideoRef.current.nextElementSibling as HTMLElement | null;
      if (playButton) {
        playButton.style.display = 'none';
        playButton.style.opacity = '0';
      }
    }
  }, [isOpen, isOpening, isClosing]);

  return (
    <GlassSidePane isOpen={isOpen} onClose={onClose} side="right" zIndex={60}>
      <div className="mt-8 sm:mt-10 mb-6 relative z-10">
        <h2 className="text-2xl sm:text-3xl font-theme-heading text-primary leading-tight mb-5">reigh is a tool made just for travelling between images</h2>
        <div className="w-20 h-1.5 bg-gradient-to-r from-wes-vintage-gold to-wes-vintage-gold/50 rounded-full animate-pulse-breathe opacity-90"></div>
      </div>

      <div className="space-y-3 pb-4 text-left text-foreground/70">
        <p className="text-sm leading-relaxed">
          There are many tools that aim to be a 'one-stop-shop' for creating with AI - a kind of 'Amazon for art'. 
        </p>
        <p className="text-sm leading-relaxed">
        Reigh is not one of them.
        </p>
        <p className="text-sm leading-relaxed">
        It's a tool <em>just</em> for travelling between images:
        </p>
        
        <div className="space-y-2 mt-4 mb-4">
          <div className="flex gap-4 items-start">
            {/* Left side: Two stacked square images */}
            <div className="flex flex-col gap-2">
              <div className="w-20 h-20 sm:w-32 sm:h-32 flex-shrink-0">
                <img 
                  src={currentExample.image1} 
                  alt="Input image 1"
                  className="w-full h-full object-cover border rounded-lg"
                />
              </div>
              <div className="w-20 h-20 sm:w-32 sm:h-32 flex-shrink-0">
                <img 
                  src={currentExample.image2} 
                  alt="Input image 2"
                  className="w-full h-full object-cover border rounded-lg"
                />
              </div>
            </div>
            {/* Right side: Output video */}
            <div className="w-[168px] h-[168px] sm:w-[264px] sm:h-[264px] flex-shrink-0 relative" style={{ transform: 'translateZ(0)', willChange: 'transform' }}>
              <video 
                key={selectedExampleStyle}
                ref={(video) => {
                  philosophyVideoRef.current = video;
                  if (video && isOpen) {
                    const playButton = video.nextElementSibling as HTMLElement | null;
                    if (playButton) {
                      playButton.style.display = 'none';
                      playButton.style.opacity = '0';
                    }
                  }
                }}
                src={currentExample.video}
                poster={currentExample.image1}
                muted
                playsInline
                preload="auto"
                crossOrigin="anonymous"
                disableRemotePlayback
                onCanPlay={(e) => {
                  const v = e.currentTarget as HTMLVideoElement;
                  if (v.paused && isOpen && !isOpening) v.play().catch((err) => console.log('[VideoLoadSpeedIssue] play() failed on canplay', err));
                }}
                onPlay={(e) => {
                  const video = e.target as HTMLVideoElement;
                  const playButton = video.nextElementSibling as HTMLElement | null;
                  if (playButton) {
                    playButton.style.display = 'none';
                    playButton.style.opacity = '0';
                  }
                  video.style.opacity = '1';
                }}
                onLoadStart={(e) => {
                  const video = e.target as HTMLVideoElement;
                  video.style.opacity = '1';
                }}
                onEnded={(e) => {
                  const playButton = (e.target as HTMLElement).nextElementSibling as HTMLElement | null;
                  if (playButton) {
                    playButton.style.display = 'flex';
                    playButton.style.backdropFilter = 'blur(0px)';
                    playButton.style.opacity = '1';
                    
                    let blurAmount = 0;
                    const blurInterval = setInterval(() => {
                      blurAmount += 0.05;
                      playButton.style.backdropFilter = `blur(${blurAmount}px)`;
                      if (blurAmount >= 2) {
                        clearInterval(blurInterval);
                      }
                    }, 100);
                  }
                }}
                className="w-full h-full object-cover border rounded-lg transition-opacity duration-75"
              />
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const video = e.currentTarget.previousElementSibling as HTMLVideoElement | null;
                  if (video) {
                    video.currentTime = 0;
                    video.play();
                    e.currentTarget.style.opacity = '0';
                    setTimeout(() => {
                      e.currentTarget.style.display = 'none';
                    }, 300);
                  }
                }}
                className="absolute inset-0 bg-black/40 rounded-lg items-center justify-center text-white hover:bg-black/50 transition-all duration-500 opacity-0"
                style={{ display: 'none' }}
              >
                <svg className="w-8 h-8 sm:w-12 sm:h-12" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 mt-4 mb-4">
          <p className="text-sm leading-relaxed">
            Just as a songwriter might uncover infinite nuance to be found in six strings, we believe an entire artform lies waiting in the AI-driven journey between images - especially with the ability <strong>generate precise images based on references.</strong>
          </p>
        </div>

        <div className="space-y-3 mb-8">
          <div className="space-y-3">
            <p className="text-sm leading-relaxed mt-6">
              Reigh is a tool <strong>just</strong> for exploring this artform. By creating with it and endlessly refining every element, I want to make it extremely good, and build a community of people who want to explore it with me.
            </p>
            <p className="text-sm leading-relaxed">
              If you're interested in joining, you're very welcome! If we're successful, I hope that we can inspire a whole ecosystem of similar tools and communities focusing on discovering and creating their own artforms.
            </p>
            <p className="font-serif text-lg italic transform -rotate-1">POM</p>
          </div>

          <div className="w-12 h-px bg-muted/30"></div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => navigate('/tools')}
              className="text-muted-foreground hover:text-primary text-xs underline transition-colors duration-200"
            >
              Try the tool
            </button>
            <span className="text-muted-foreground/50">|</span>
            <a
              href="https://discord.gg/D5K2c6kfhy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary text-xs underline transition-colors duration-200"
            >
              Join the community
            </a>
          </div>
        </div>
      </div>
    </GlassSidePane>
  );
};
