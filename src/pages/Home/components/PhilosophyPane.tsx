import React, { useRef, useEffect, useState } from 'react';
import { GlassSidePane } from './GlassSidePane';
import { cn } from '@/lib/utils';

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

// Placeholder for dummy images/videos
const PLACEHOLDER = '/placeholder.svg';

// Skeleton component for loading states
const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse bg-muted/50 rounded", className)} />
);

// Helper to get thumbnail path for an image
const getThumbPath = (src: string): string => {
  if (src.startsWith('/introduction-images/')) {
    const name = src.split('/').pop()!;
    const ext = name.split('.').pop();
    const base = name.replace(`.${ext}`, '');
    return `/thumbs/${base}-thumb.${ext}`;
  }
  if (src.startsWith('/916-')) {
    return `/thumbs/${src.slice(1).replace('.jpg', '-thumb.jpg')}`;
  }
  if (src.startsWith('/h') && src.includes('-crop.webp')) {
    return `/thumbs/${src.slice(1).replace('.webp', '-thumb.webp')}`;
  }
  if (src.startsWith('/lora-') && src.endsWith('.webp')) {
    return `/thumbs/${src.slice(1).replace('.webp', '-thumb.webp')}`;
  }
  if (src.endsWith('-poster.jpg')) {
    return `/thumbs/${src.slice(1).replace('.jpg', '-thumb.jpg')}`;
  }
  if (src.startsWith('/example-image')) {
    return `/thumbs/${src.slice(1).replace('.jpg', '-thumb.jpg')}`;
  }
  return src; // No thumb available, use original
};

// Dummy data for the different sections
const travelExamples = [
  {
    id: '2-images',
    label: '2 Images',
    images: [PLACEHOLDER, PLACEHOLDER],
    video: PLACEHOLDER,
    poster: PLACEHOLDER,
  },
  {
    id: '4-images',
    label: '4 Images',
    images: ['/916-1.jpg', '/916-2.jpg', '/916-3.jpg', '/916-4.jpg'],
    video: '/916-output.mp4',
    poster: '/916-output-poster.jpg',
  },
  {
    id: '7-images',
    label: '7 Images',
    images: ['/h1-crop.webp', '/h2-crop.webp', '/h3-crop.webp', '/h4-crop.webp', '/h5-crop.webp', '/h6-crop.webp', '/h7-crop.webp'],
    video: '/h-output.mp4',
    poster: '/h-output-poster.jpg',
  },
];

const loraOptions = [
  { id: 'slow-motion-explode', label: 'slow-motion-explode', video: '/slow-motion-explode.mp4', poster: '/slow-motion-explode-poster.jpg' },
  { id: 'animatediff', label: 'animatediff', video: '/animatediff.mp4', poster: '/animatediff-poster.jpg' },
  { id: 'water-morphing', label: 'water-morphing', video: '/water-morphing.mp4', poster: '/water-morphing-poster.jpg' },
  { id: 'steampunk-willy', label: 'steampunk-willy', video: '/steampunk-willy.mp4', poster: '/steampunk-willy-poster.jpg' },
];

const referenceTypes = ['Style', 'Character', 'Scene'] as const;

const imageLoraOptions = [
  { id: 'upscale', label: 'Upscale', description: 'Enhance resolution' },
  { id: 'style-transfer', label: 'Style Transfer', description: 'Apply artistic styles' },
  { id: 'inpaint', label: 'Inpaint', description: 'Edit specific areas' },
  { id: 'outpaint', label: 'Outpaint', description: 'Extend the canvas' },
  { id: 'relight', label: 'Relight', description: 'Change lighting' },
];

const MotionComparison = () => {
  const [sliderPos, setSliderPos] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [fadeOpacity, setFadeOpacity] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoInputRef = useRef<HTMLVideoElement>(null);
  const videoOutputRef = useRef<HTMLVideoElement>(null);

  const handleTimeUpdate = () => {
    const video = videoOutputRef.current;
    if (!video) return;
    
    const timeRemaining = video.duration - video.currentTime;
    if (timeRemaining <= 5) {
      // Fade from 0 to 1 over 5 seconds
      setFadeOpacity(1 - (timeRemaining / 5));
    } else {
      setFadeOpacity(0);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || !isPlaying) return;
    setIsAnimating(false); // Stop animation when user drags
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!containerRef.current || !isPlaying) return;
    setIsAnimating(false); // Stop animation when user drags
    const rect = containerRef.current.getBoundingClientRect();
    const touchX = e.touches[0].clientX;
    const x = Math.max(0, Math.min(touchX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  };
  
  const togglePlay = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const nextIsPlaying = !isPlaying;
    setIsPlaying(nextIsPlaying);
    
    if (nextIsPlaying) {
      setIsAnimating(true);
      setSliderPos(20); // Start showing 80% of the result
      videoInputRef.current?.play().catch(() => {});
      videoOutputRef.current?.play().catch(() => {});
      // Sync durations by slowing down input if needed
      if (videoInputRef.current && videoOutputRef.current) {
         // Assuming output is the "master" duration or we want to match them
         // If we want to slow down input to match output:
         if (videoOutputRef.current.duration && videoInputRef.current.duration) {
             const ratio = videoInputRef.current.duration / videoOutputRef.current.duration;
             // If input is shorter (ratio < 1), we'd need to slow it down to match output duration? 
             // "slow down the motion input video so it matches the other one precisely"
             // usually implies input is faster or shorter duration but same content.
             // If they are same content but input is 2s and output is 4s, input is 2x fast.
             // We want input to take 4s. So playbackRate = 0.5.
             videoInputRef.current.playbackRate = ratio; 
         }
      }
    } else {
      setIsAnimating(true);
      videoInputRef.current?.pause();
      videoOutputRef.current?.pause();
      setSliderPos(50);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full aspect-[4/3] rounded-lg overflow-hidden cursor-col-resize group select-none border border-muted/50 touch-none"
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      onClick={togglePlay}
      onMouseLeave={() => !isPlaying && setSliderPos(50)}
    >
      {/* Output Video (Right / Background) */}
      <video 
        ref={videoOutputRef}
        src="/motion-output.mp4"
        className="absolute inset-0 w-full h-full object-cover"
        loop
        muted={isMuted}
        playsInline
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onSeeked={() => setFadeOpacity(0)}
      />
      {/* Output poster overlay - thumbnail first, then full */}
      <img 
        src={getThumbPath('/motion-output-poster.jpg')}
        alt=""
        className={cn("absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300", isPlaying && "opacity-0")}
      />

      {/* Input Video (Left / Foreground) - Clipped */}
      <div 
        className={cn("absolute inset-0 overflow-hidden", isAnimating && "transition-[clip-path] duration-500 ease-out")}
        style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
      >
        <video 
          ref={videoInputRef}
          src="/motion-input.mp4"
          className="absolute inset-0 w-full h-full object-cover"
          loop
          muted={isMuted}
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            // Initial sync attempt if both ready
             const video = e.currentTarget;
             if (videoOutputRef.current?.duration) {
                video.playbackRate = video.duration / videoOutputRef.current.duration;
             }
          }}
        />
        {/* Input poster overlay - thumbnail first */}
        <img 
          src={getThumbPath('/motion-input-poster.jpg')}
          alt=""
          className={cn("absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300", isPlaying && "opacity-0")}
        />
      </div>

      {/* Slider Handle - Only visible when playing */}
      {isPlaying && (
        <div 
          className={cn("absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] pointer-events-none z-10", isAnimating && "transition-[left] duration-500 ease-out")}
          style={{ left: `${sliderPos}%` }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/50 shadow-lg">
            <svg className="w-4 h-4 text-white drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 12h8m-8 0l4-4m-4 4l4 4" />
            </svg>
          </div>
        </div>
      )}
      
      {/* Labels */}
      <div className={`absolute top-3 left-3 px-2 py-1 bg-black/50 backdrop-blur-md rounded-md text-[10px] uppercase tracking-wider text-white/90 font-bold transition-opacity duration-300 pointer-events-none z-20 ${sliderPos < 15 ? 'opacity-0' : 'opacity-100'}`}>
        Reference
      </div>
      <div className={`absolute top-3 right-3 px-2 py-1 bg-black/50 backdrop-blur-md rounded-md text-[10px] uppercase tracking-wider text-white/90 font-bold transition-opacity duration-300 pointer-events-none z-20 ${sliderPos > 85 ? 'opacity-0' : 'opacity-100'}`}>
        Result
      </div>

      {/* Play Button Overlay */}
      <div 
        className={`absolute inset-0 flex items-center justify-center z-30 transition-all duration-300 ${isPlaying ? 'opacity-0 pointer-events-none' : 'opacity-100 bg-black/20'}`}
      >
        <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/40 shadow-xl text-white transform transition-transform group-hover:scale-110">
          <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>

      {/* Mute Button - Bottom Right */}
      <button 
        onClick={toggleMute}
        className="absolute bottom-3 right-3 p-2 bg-black/50 backdrop-blur-md rounded-full text-white/90 hover:bg-black/70 transition-colors z-40"
      >
        {isMuted ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
        )}
      </button>

      {/* Fade to black overlay */}
      <div 
        className="absolute inset-0 bg-black pointer-events-none z-50"
        style={{ opacity: fadeOpacity }}
      />
    </div>
  );
};

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
  const travelVideoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null]);
  const loraVideosRef = useRef<(HTMLVideoElement | null)[]>([]);
  const loraVideosReadyRef = useRef<boolean[]>([false, false, false, false]);
  const loraVideosSyncedStartRef = useRef(false);
  
  // State for interactive sections
  const [selectedTravelExample, setSelectedTravelExample] = useState(0);
  const [selectedLora, setSelectedLora] = useState(0);
  const [selectedReferenceType, setSelectedReferenceType] = useState<typeof referenceTypes[number]>('Style');
  const [selectedReferenceImage, setSelectedReferenceImage] = useState(0);
  const [selectedImageLora, setSelectedImageLora] = useState(0);
  const [loraPlaying, setLoraPlaying] = useState(false);
  const [travelVideoEnded, setTravelVideoEnded] = useState<Set<number>>(new Set([0, 1, 2])); // All start with play button visible
  const [travelVideoPlayed, setTravelVideoPlayed] = useState<Set<number>>(new Set()); // Track which have played at least once
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [loadedVideos, setLoadedVideos] = useState<Set<string>>(new Set());
  const loadedImagesRef = useRef<Set<string>>(new Set());

  const handleImageLoad = (src: string) => {
    if (!loadedImagesRef.current.has(src)) {
      loadedImagesRef.current.add(src);
      setLoadedImages(prev => new Set(prev).add(src));
    }
  };

  // Handle cached images that don't fire onLoad on mobile
  const handleImageRef = (img: HTMLImageElement | null, src: string) => {
    if (img && img.complete && img.naturalWidth > 0 && !loadedImagesRef.current.has(src)) {
      handleImageLoad(src);
    }
  };

  const handleVideoLoad = (src: string) => {
    setLoadedVideos(prev => new Set(prev).add(src));
  };

  const playTravelVideo = (idx: number) => {
    const video = travelVideoRefs.current[idx];
    if (video) {
      video.currentTime = 0;
      // Wait for video to actually start playing before hiding poster
      const onPlaying = () => {
        setTravelVideoEnded(prev => {
          const next = new Set(prev);
          next.delete(idx);
          return next;
        });
        setTravelVideoPlayed(prev => new Set(prev).add(idx));
        video.removeEventListener('playing', onPlaying);
      };
      video.addEventListener('playing', onPlaying);
      video.play().catch(() => {
        video.removeEventListener('playing', onPlaying);
      });
    }
  };

  const handleTravelVideoEnded = (idx: number) => {
    setTravelVideoEnded(prev => new Set(prev).add(idx));
  };

  const toggleLoraPlay = () => {
    if (loraPlaying) {
      // Pause
      setLoraPlaying(false);
      loraVideosRef.current.forEach(v => {
        if (v) v.pause();
      });
    } else {
      // Play - wait for video to actually start playing before hiding button
      const video = loraVideosRef.current[0];
      if (video) {
        video.currentTime = 0;
        const onPlaying = () => {
          setLoraPlaying(true);
          video.removeEventListener('playing', onPlaying);
        };
        video.addEventListener('playing', onPlaying);
        video.play().catch(() => {
          video.removeEventListener('playing', onPlaying);
        });
      }
    }
  };

  // Stop LoRA videos when closed
  useEffect(() => {
    if (!isOpen) {
      setLoraPlaying(false);
      loraVideosRef.current.forEach(v => {
        if (v) {
          v.pause();
          v.currentTime = 0;
        }
      });
    }
  }, [isOpen]);

  // Play travel video when pane finishes opening
  useEffect(() => {
    if (isOpen && !isOpening) {
      // Play the currently selected travel video
      playTravelVideo(selectedTravelExample);
    } else if (!isOpen && !isClosing) {
      // Stop all travel videos when closed
      travelVideoRefs.current.forEach(v => {
        if (v) {
          v.pause();
          v.currentTime = 0;
        }
      });
      // Reset all play buttons to visible and show posters again
      setTravelVideoEnded(new Set([0, 1, 2]));
      setTravelVideoPlayed(new Set());
    }
  }, [isOpen, isOpening, isClosing]);

  // Play video when switching tabs
  useEffect(() => {
    if (isOpen && !isOpening) {
      playTravelVideo(selectedTravelExample);
    }
  }, [selectedTravelExample]);

  return (
    <GlassSidePane isOpen={isOpen} onClose={onClose} side="right" zIndex={60}>
      {/* Header */}
      <div className="mt-8 sm:mt-10 mb-6 relative z-10">
        <h2 className="text-2xl sm:text-3xl font-theme-heading text-primary leading-tight mb-5">
          reigh is a tool made just for travelling between images
        </h2>
        <div className="w-20 h-1.5 bg-gradient-to-r from-wes-vintage-gold to-wes-vintage-gold/50 rounded-full animate-pulse-breathe opacity-90"></div>
      </div>

      <div className="space-y-8 pb-4 text-left text-foreground/70">
        {/* Intro text */}
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">
            There are many tools that aim to be a 'one-stop-shop' for creating with AI - a kind of 'Amazon for art'. 
          </p>
          <p className="text-sm leading-relaxed">
            <span className="font-theme-heading">Reigh</span> is not one of them.
          </p>
          <p className="text-sm leading-relaxed">
            It's a tool <span className="text-wes-vintage-gold">just for travelling between images</span>:
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 1: Basic Image Travel Demo
            - Selector below visualization, full width, each option 1/3
            - Fixed pixel sizes matching original layout
            - All images square:
              - 2 images: stacked vertically
              - 3 images: L-shape (2 stacked left, 1 top-right)
              - 4 images: 2x2 grid
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-2 !mt-4 mb-4">
          {/* Main travel visualization - fixed height container */}
          <div className="flex gap-4 items-center justify-center h-[210px] sm:h-[264px]">
            {/* Left side: Input images with dynamic layout */}
            {(() => {
              const images = selectedTravelExample === 0 
                ? [currentExample.image1, currentExample.image2]
                : travelExamples[selectedTravelExample].images;
              const imageCount = images.length;
              
              // 2 images: stacked vertically
              if (imageCount === 2) {
                return (
                  <div className="flex flex-col gap-2">
                    {images.map((img, idx) => {
                      const imgSrc = selectedTravelExample === 0 ? img : PLACEHOLDER;
                      return (
                        <div key={idx} className="w-20 h-20 sm:w-32 sm:h-32 flex-shrink-0 relative">
                          {!loadedImages.has(imgSrc) && <Skeleton className="absolute inset-0 rounded-lg" />}
                          <img 
                            ref={(img) => handleImageRef(img, imgSrc)}
                            src={imgSrc}
                            alt={`Input image ${idx + 1}`}
                            className={cn("w-full h-full object-cover border rounded-lg transition-opacity duration-300", !loadedImages.has(imgSrc) && "opacity-0")}
                            onLoad={() => handleImageLoad(imgSrc)}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              }
              
              // 7 images: row of images at top, video below
              if (imageCount === 7) {
                const example = travelExamples[selectedTravelExample];
                return (
                  <div className="flex flex-col gap-2 items-center justify-end h-full">
                    {/* 7 input images in a row */}
                    <div className="flex gap-1">
                      {images.map((img, idx) => (
                        <div key={idx} className="w-[40px] h-[30px] sm:w-[56px] sm:h-[42px] flex-shrink-0 overflow-hidden rounded border relative">
                          {/* Thumbnail loads first */}
                          <img 
                            src={getThumbPath(img)}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          {/* Full image fades in on top when loaded */}
                          <img 
                            ref={(imgEl) => handleImageRef(imgEl, img)}
                            src={img}
                            alt={`Input image ${idx + 1}`}
                            className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", !loadedImages.has(img) && "opacity-0")}
                            onLoad={() => handleImageLoad(img)}
                          />
                        </div>
                      ))}
                    </div>
                    {/* 4:3 output video */}
                    <div 
                      className="w-[240px] h-[172px] sm:w-[296px] sm:h-[212px] flex-shrink-0 relative overflow-hidden rounded-lg border"
                      style={{ transform: 'translateZ(0)', willChange: 'transform' }}
                    >
                      <video 
                        ref={(el) => { travelVideoRefs.current[2] = el; }}
                        src={example.video}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                        onEnded={() => handleTravelVideoEnded(2)}
                      />
                      {/* Poster overlay - only show before first play */}
                      <img
                        src={getThumbPath(example.poster)}
                        alt=""
                        className={cn(
                          "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
                          (!travelVideoEnded.has(2) || travelVideoPlayed.has(2)) && "opacity-0"
                        )}
                      />
                      <img
                        ref={(imgEl) => handleImageRef(imgEl, example.poster)}
                        src={example.poster}
                        alt=""
                        onLoad={() => handleImageLoad(example.poster)}
                        className={cn(
                          "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
                          (!travelVideoEnded.has(2) || travelVideoPlayed.has(2) || !loadedImages.has(example.poster)) && "opacity-0"
                        )}
                      />
                      {/* Play button overlay */}
                      <button
                        onClick={() => playTravelVideo(2)}
                        className={cn(
                          "absolute inset-0 bg-black/40 flex items-center justify-center text-white hover:bg-black/50 transition-all duration-300",
                          travelVideoEnded.has(2) ? "opacity-100" : "opacity-0 pointer-events-none"
                        )}
                      >
                        <svg className="w-8 h-8 sm:w-12 sm:h-12" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              }
              
              // 4 images: 2x2 grid on left, 9:16 output on right
              if (imageCount === 4) {
                const example = travelExamples[selectedTravelExample];
                return (
                  <div className="flex gap-2 items-center">
                    {/* 4 input images in 2x2 grid, 9:16 aspect */}
                    <div className="grid grid-cols-2 gap-1">
                      {images.map((img, idx) => (
                        <div key={idx} className="w-[42px] h-[75px] sm:w-[73px] sm:h-[130px] flex-shrink-0 overflow-hidden rounded-lg border relative">
                          {/* Thumbnail loads first */}
                          <img 
                            src={getThumbPath(img)}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          {/* Full image fades in on top when loaded */}
                          <img 
                            ref={(imgEl) => handleImageRef(imgEl, img)}
                            src={img}
                            alt={`Input image ${idx + 1}`}
                            className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", !loadedImages.has(img) && "opacity-0")}
                            onLoad={() => handleImageLoad(img)}
                          />
                        </div>
                      ))}
                    </div>
                    {/* 9:16 output video */}
                    <div 
                      className="w-[117px] h-[208px] sm:w-[148px] sm:h-[264px] flex-shrink-0 relative overflow-hidden rounded-lg border"
                      style={{ transform: 'translateZ(0)', willChange: 'transform' }}
                    >
                      <video 
                        ref={(el) => { travelVideoRefs.current[1] = el; }}
                        src={example.video}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                        onEnded={() => handleTravelVideoEnded(1)}
                      />
                      {/* Poster overlay - only show before first play */}
                      <img
                        src={getThumbPath(example.poster)}
                        alt=""
                        className={cn(
                          "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
                          (!travelVideoEnded.has(1) || travelVideoPlayed.has(1)) && "opacity-0"
                        )}
                      />
                      <img
                        ref={(imgEl) => handleImageRef(imgEl, example.poster)}
                        src={example.poster}
                        alt=""
                        onLoad={() => handleImageLoad(example.poster)}
                        className={cn(
                          "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
                          (!travelVideoEnded.has(1) || travelVideoPlayed.has(1) || !loadedImages.has(example.poster)) && "opacity-0"
                        )}
                      />
                      {/* Play button overlay */}
                      <button
                        onClick={() => playTravelVideo(1)}
                        className={cn(
                          "absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center text-white hover:bg-black/50 transition-all duration-300",
                          travelVideoEnded.has(1) ? "opacity-100" : "opacity-0 pointer-events-none"
                        )}
                      >
                        <svg className="w-8 h-8 sm:w-12 sm:h-12" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              }
              
              return null;
            })()}
            
            {/* Right side: Output video - fixed size (hidden for 4-image and 7-image layouts which have their own) */}
            {selectedTravelExample === 0 && (
            <div 
              className="w-[168px] h-[168px] sm:w-[264px] sm:h-[264px] flex-shrink-0 relative overflow-hidden rounded-lg border"
              style={{ transform: 'translateZ(0)', willChange: 'transform' }}
            >
              <video 
                key={selectedExampleStyle}
                ref={(video) => {
                  philosophyVideoRef.current = video;
                  travelVideoRefs.current[0] = video;
                }}
                src={currentExample.video}
                muted
                playsInline
                preload="auto"
                crossOrigin="anonymous"
                disableRemotePlayback
                onEnded={() => handleTravelVideoEnded(0)}
                className="w-full h-full object-cover"
              />
              {/* Poster overlay - only show before first play */}
              <img
                src={getThumbPath(currentExample.image1)}
                alt=""
                className={cn(
                  "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
                  (!travelVideoEnded.has(0) || travelVideoPlayed.has(0)) && "opacity-0"
                )}
              />
              <img
                ref={(imgEl) => handleImageRef(imgEl, currentExample.image1)}
                src={currentExample.image1}
                alt=""
                onLoad={() => handleImageLoad(currentExample.image1)}
                className={cn(
                  "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
                  (!travelVideoEnded.has(0) || travelVideoPlayed.has(0) || !loadedImages.has(currentExample.image1)) && "opacity-0"
                )}
              />
              {/* Play button overlay */}
              <button
                onClick={() => playTravelVideo(0)}
                className={cn(
                  "absolute inset-0 bg-black/40 flex items-center justify-center text-white hover:bg-black/50 transition-all duration-300",
                  travelVideoEnded.has(0) ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
              >
                <svg className="w-8 h-8 sm:w-12 sm:h-12" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </button>
            </div>
            )}
          </div>

          {/* Example selector with thumbnail previews - below visualization, full width */}
          <div className="grid grid-cols-3 gap-2 w-full pt-4">
            {travelExamples.map((example, idx) => {
              // Get thumbnail images for the selector
              const thumbImages = idx === 0 
                ? [currentExample.image1, currentExample.image2] 
                : example.images;
              
              return (
                <button
                  key={example.id}
                  onClick={() => setSelectedTravelExample(idx)}
                  className={cn(
                    "p-2 rounded-lg transition-all duration-200 flex items-center justify-center",
                    selectedTravelExample === idx
                      ? "bg-primary/20 ring-2 ring-primary/50"
                      : "bg-muted/30 hover:bg-muted/50"
                  )}
                >
                  {/* Mini preview grid matching the layout */}
                  {example.images.length === 7 ? (
                    // 7 images: 1 2 3 4 / 5 6 7 (centered)
                    <div className="flex flex-col gap-0.5">
                      <div className="flex gap-0.5">
                        {thumbImages.slice(0, 4).map((img, imgIdx) => (
                          <div key={imgIdx} className="w-6 h-[18px] bg-muted/50 rounded-sm overflow-hidden relative">
                            {!loadedImages.has(img) && <Skeleton className="absolute inset-0" />}
                            <img src={img} alt="" className={cn("w-full h-full object-cover", !loadedImages.has(img) && "opacity-0")} onLoad={() => handleImageLoad(img)} />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-0.5 justify-center">
                        {thumbImages.slice(4, 7).map((img, imgIdx) => (
                          <div key={imgIdx + 4} className="w-6 h-[18px] bg-muted/50 rounded-sm overflow-hidden relative">
                            {!loadedImages.has(img) && <Skeleton className="absolute inset-0" />}
                            <img src={img} alt="" className={cn("w-full h-full object-cover", !loadedImages.has(img) && "opacity-0")} onLoad={() => handleImageLoad(img)} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className={cn(
                      "gap-1",
                      example.images.length === 2 && "flex flex-row",
                      example.images.length === 4 && "flex flex-row"
                    )}>
                      {thumbImages.map((img, imgIdx) => (
                        <div 
                          key={imgIdx} 
                          className={cn(
                            "bg-muted/50 rounded-sm overflow-hidden relative",
                            example.images.length === 2 && "w-6 h-6 aspect-square",
                            example.images.length === 4 && "w-4 h-7"
                          )}
                        >
                          {!loadedImages.has(img) && <Skeleton className="absolute inset-0" />}
                          <img 
                            src={img}
                            alt=""
                            className={cn("w-full h-full object-cover", !loadedImages.has(img) && "opacity-0")}
                            onLoad={() => handleImageLoad(img)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 2: Reference Videos for Motion Control
            - 3 columns, all 4:3 aspect ratio, same height, full width
            - Image grid: 4 cols × 3 rows (12 images) = 4:3 aspect ratio
            - Videos: 4:3 aspect ratio
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">
            You can use <span className="text-wes-vintage-gold">reference videos to steer the motion</span> - here's an example of how images and video references combine:
          </p>
          
          <div className="flex gap-3 w-full">
            <div className="space-y-1 flex-[2]">
              <span className="text-xs text-muted-foreground/70">Input Images</span>
              <div className="aspect-square grid grid-cols-4 grid-rows-4 gap-1">
                {Array.from({ length: 16 }).map((_, idx) => {
                  const imgNum = String(idx + 1).padStart(3, '0');
                  const imgSrc = `/introduction-images/${imgNum}.${idx === 13 ? 'png' : 'jpg'}`;
                  return (
                    <div key={idx} className="aspect-square bg-muted/30 rounded border border-muted/50 overflow-hidden relative">
                      {/* Thumbnail loads first */}
                      <img 
                        src={getThumbPath(imgSrc)}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      {/* Full image fades in on top when loaded */}
                      <img 
                        ref={(imgEl) => handleImageRef(imgEl, imgSrc)}
                        src={imgSrc} 
                        alt={`Input ${idx + 1}`}
                        className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", !loadedImages.has(imgSrc) && "opacity-0")}
                        onLoad={() => handleImageLoad(imgSrc)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="space-y-1 flex-[3]">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground/70">Motion & Output</span>
              </div>
              <MotionComparison />
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 3: LoRA Selector for Motion Styles
            - Starting/ending images left, 2x2 video grid right
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">
            You can also use community-trained LoRAs to <span className="text-wes-vintage-gold">give the motion a distinctive style</span>:
          </p>
          
          <div className="flex gap-4 items-center">
            {/* Left: Starting and ending images stacked */}
            <div className="flex flex-col gap-2">
              {/* Starting image - label above */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] italic text-muted-foreground/60">starting</span>
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border border-muted/50 relative">
                  {/* Thumbnail loads first */}
                  <img 
                    src={getThumbPath('/lora-3.webp')}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {/* Full image fades in on top when loaded */}
                  <img 
                    ref={(imgEl) => handleImageRef(imgEl, '/lora-3.webp')}
                    src="/lora-3.webp"
                    alt="starting image"
                    className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", !loadedImages.has('/lora-3.webp') && "opacity-0")}
                    onLoad={() => handleImageLoad('/lora-3.webp')}
                  />
                </div>
              </div>
              {/* Ending image - label below */}
              <div className="flex flex-col items-center gap-1">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border border-muted/50 relative">
                  {/* Thumbnail loads first */}
                  <img 
                    src={getThumbPath('/lora-4.webp')}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {/* Full image fades in on top when loaded */}
                  <img 
                    ref={(imgEl) => handleImageRef(imgEl, '/lora-4.webp')}
                    src="/lora-4.webp"
                    alt="ending image"
                    className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", !loadedImages.has('/lora-4.webp') && "opacity-0")}
                    onLoad={() => handleImageLoad('/lora-4.webp')}
                  />
                </div>
                <span className="text-[10px] italic text-muted-foreground/60">ending</span>
              </div>
            </div>
            
            {/* Right: 2x2 grid of videos with labels */}
            <div className="flex-1 relative min-w-0">
              <div className="aspect-square bg-muted/30 rounded-lg border border-muted/50 overflow-hidden relative">
                {!loadedVideos.has('/lora-grid-pingpong.mp4') && <Skeleton className="absolute inset-0 z-0" />}
                <video
                  ref={(el) => { if (el) loraVideosRef.current[0] = el; }}
                  src="/lora-grid-pingpong.mp4"
                  muted
                  playsInline
                  preload="auto"
                  onCanPlay={() => handleVideoLoad('/lora-grid-pingpong.mp4')}
                  onEnded={() => {
                    // Reset to start so poster fades in over matching frame
                    const video = loraVideosRef.current[0];
                    if (video) video.currentTime = 0;
                    setLoraPlaying(false);
                  }}
                  className="w-full h-full object-cover"
                />
                {/* Poster overlay - thumbnail loads first, full poster fades in */}
                <img 
                  src={getThumbPath('/lora-grid-combined-poster.jpg')}
                  alt=""
                  className={cn(
                    "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
                    loraPlaying ? "opacity-0" : "opacity-100"
                  )}
                />
                <img 
                  ref={(imgEl) => handleImageRef(imgEl, '/lora-grid-combined-poster.jpg')}
                  src="/lora-grid-combined-poster.jpg"
                  alt=""
                  onLoad={() => handleImageLoad('/lora-grid-combined-poster.jpg')}
                  className={cn(
                    "absolute inset-0 w-full h-full object-cover transition-opacity duration-300 pointer-events-none",
                    loraPlaying || !loadedImages.has('/lora-grid-combined-poster.jpg') ? "opacity-0" : "opacity-100"
                  )}
                />
                
                {/* Labels overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Top Left - Label Bottom Right */}
                  <div className="absolute top-0 left-0 w-1/2 h-1/2">
                    <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-tl z-10 w-20 h-8 flex items-center justify-center text-center leading-tight">
                      slow motion explode
                    </span>
                  </div>
                  
                  {/* Top Right - Label Bottom Left */}
                  <div className="absolute top-0 right-0 w-1/2 h-1/2">
                    <span className="absolute bottom-0 left-0 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-tr z-10 w-20 h-8 flex items-center justify-center text-center leading-tight">
                      animatediff
                    </span>
                  </div>
                  
                  {/* Bottom Left - Label Top Right */}
                  <div className="absolute bottom-0 left-0 w-1/2 h-1/2">
                    <span className="absolute top-0 right-0 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-bl z-10 w-20 h-8 flex items-center justify-center text-center leading-tight">
                      water morphing
                    </span>
                  </div>
                  
                  {/* Bottom Right - Label Top Left */}
                  <div className="absolute bottom-0 right-0 w-1/2 h-1/2">
                    <span className="absolute top-0 left-0 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-br z-10 w-20 h-8 flex items-center justify-center text-center leading-tight">
                      steampunk willy
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Play button overlay */}
              {!loraPlaying && (
                <button
                  onClick={toggleLoraPlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 rounded-lg transition-all duration-300 z-20 group"
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm border border-white/50 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 4: Image Generation with References (TEMPORARILY DISABLED)
            SECTION 5: Image Editing LoRAs (TEMPORARILY DISABLED)
        ═══════════════════════════════════════════════════════════════════ */}
        {false && (
          <>
            {/* Section 4 content */}
            <div className="space-y-3">
              <p className="text-sm leading-relaxed">
                To give you the right starting images, you can <span className="text-wes-vintage-gold">generate them using references</span> for style, subject and scene:
              </p>
              
              <div className="flex gap-3">
                <div className="flex flex-col justify-center space-y-1">
                  <span className="text-xs text-muted-foreground/70">Reference</span>
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedReferenceImage(idx)}
                        className={cn(
                          "w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border-2 transition-all duration-200",
                          selectedReferenceImage === idx
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-transparent hover:border-muted"
                        )}
                      >
                        <img 
                          src={PLACEHOLDER} 
                          alt={`Reference option ${idx + 1}`}
                          className="w-full h-full object-cover bg-muted/30"
                        />
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="flex-1 flex flex-col justify-center space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground/70">Reference Type</span>
                    <div className="grid grid-cols-3 gap-2">
                      {referenceTypes.map((type) => (
                        <button
                          key={type}
                          onClick={() => setSelectedReferenceType(type)}
                          className={cn(
                            "px-2 py-3 text-xs rounded-md transition-all duration-200 text-center",
                            selectedReferenceType === type
                              ? "bg-primary/20 text-primary border border-primary/30"
                              : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent"
                          )}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground/70">Generated Images</span>
                    <div className="grid grid-cols-3 gap-2">
                      {Array.from({ length: 6 }).map((_, idx) => (
                        <div key={idx} className="aspect-square bg-muted/30 rounded-lg border border-muted/50">
                          <img 
                            src={PLACEHOLDER} 
                            alt={`Generated ${idx + 1}`}
                            className="w-full h-full object-cover rounded-lg"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 5 content */}
            <div className="space-y-3">
              <p className="text-sm leading-relaxed">
                And you can <span className="text-wes-vintage-gold">edit images with LoRAs built for specific tasks</span>:
              </p>
              
              <div className="flex gap-3 items-stretch">
                <div className="flex-1 flex flex-col justify-center space-y-1">
                  <span className="text-xs text-muted-foreground/70 text-center">Input</span>
                  <div className="aspect-square bg-muted/30 rounded-lg border border-muted/50">
                    <img 
                      src={PLACEHOLDER} 
                      alt="Input for editing"
                      className="w-full h-full object-cover rounded-lg"
                    />
                  </div>
                </div>
                
                <div className="flex flex-col justify-center gap-1.5 w-28 sm:w-32">
                  <span className="text-xs text-muted-foreground/70 text-center">Edit LoRA</span>
                  <div className="flex flex-col gap-1">
                    {imageLoraOptions.map((lora, idx) => (
                      <button
                        key={lora.id}
                        onClick={() => setSelectedImageLora(idx)}
                        className={cn(
                          "px-2 py-1.5 text-xs rounded-md transition-all duration-200 text-center",
                          selectedImageLora === idx
                            ? "bg-primary/20 text-primary border border-primary/30"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent"
                        )}
                      >
                        {lora.label}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="flex-1 flex flex-col justify-center space-y-1">
                  <span className="text-xs text-muted-foreground/70 text-center">Output</span>
                  <div className="aspect-square bg-muted/30 rounded-lg border border-muted/50">
                    <img 
                      src={PLACEHOLDER} 
                      alt="Edited output"
                      className="w-full h-full object-cover rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            CLOSING SECTION
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">
            We believe that there's a world of creativity that's waiting to be discovered in the AI-driven journey between images and <span className="text-wes-vintage-gold"><span className="font-theme-heading">Reigh</span> is a tool just for exploring this artform.</span> By endless improving it and implementing ideas and work from the community, we hope to make it extremely good.
          </p>
          <p className="text-sm leading-relaxed">
            And everything is open source - meaning <span className="text-wes-vintage-gold">you can run it for free on your computer</span>! If you're interested in joining, you're very welcome.
          </p>
          <p className="font-serif text-lg italic transform -rotate-1 mt-4">POM</p>
        </div>

        <div className="flex items-center space-x-2 pb-4">
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
    </GlassSidePane>
  );
};
