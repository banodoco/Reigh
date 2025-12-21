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

// Dummy data for the different sections
const travelExamples = [
  {
    id: '2-images',
    label: '2 Images',
    images: [PLACEHOLDER, PLACEHOLDER],
    video: PLACEHOLDER,
  },
  {
    id: '3-images',
    label: '3 Images',
    images: [PLACEHOLDER, PLACEHOLDER, PLACEHOLDER],
    video: PLACEHOLDER,
  },
  {
    id: '4-images',
    label: '4 Images',
    images: [PLACEHOLDER, PLACEHOLDER, PLACEHOLDER, PLACEHOLDER],
    video: PLACEHOLDER,
  },
];

const loraOptions = [
  { id: 'smooth-motion', label: 'Smooth Motion', video: PLACEHOLDER },
  { id: 'dramatic-zoom', label: 'Dramatic Zoom', video: PLACEHOLDER },
  { id: 'cinematic-pan', label: 'Cinematic Pan', video: PLACEHOLDER },
];

const referenceTypes = ['Style', 'Character', 'Scene'] as const;

const imageLoraOptions = [
  { id: 'upscale', label: 'Upscale', description: 'Enhance resolution' },
  { id: 'style-transfer', label: 'Style Transfer', description: 'Apply artistic styles' },
  { id: 'inpaint', label: 'Inpaint', description: 'Edit specific areas' },
  { id: 'outpaint', label: 'Outpaint', description: 'Extend the canvas' },
  { id: 'relight', label: 'Relight', description: 'Change lighting' },
];

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
  
  // State for interactive sections
  const [selectedTravelExample, setSelectedTravelExample] = useState(0);
  const [selectedLora, setSelectedLora] = useState(0);
  const [selectedReferenceType, setSelectedReferenceType] = useState<typeof referenceTypes[number]>('Style');
  const [selectedReferenceImage, setSelectedReferenceImage] = useState(0);
  const [selectedImageLora, setSelectedImageLora] = useState(0);

  // Play video when pane finishes opening, reset when fully closed
  useEffect(() => {
    if (isOpen && !isOpening && philosophyVideoRef.current) {
      philosophyVideoRef.current.currentTime = 0;
      philosophyVideoRef.current.play().catch(() => {});
    } else if (!isOpen && !isClosing && philosophyVideoRef.current) {
      philosophyVideoRef.current.pause();
      philosophyVideoRef.current.currentTime = 0;
      const playButton = philosophyVideoRef.current.nextElementSibling as HTMLElement | null;
      if (playButton) {
        playButton.style.display = 'none';
        playButton.style.opacity = '0';
      }
    }
  }, [isOpen, isOpening, isClosing]);

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
        <div className="space-y-2 mt-4 mb-4">
          {/* Main travel visualization */}
          <div className="flex gap-4 items-start justify-center">
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
                    {images.map((img, idx) => (
                      <div key={idx} className="w-20 h-20 sm:w-32 sm:h-32 flex-shrink-0">
                        <img 
                          src={selectedTravelExample === 0 ? img : PLACEHOLDER}
                          alt={`Input image ${idx + 1}`}
                          className="w-full h-full object-cover border rounded-lg"
                        />
                      </div>
                    ))}
                  </div>
                );
              }
              
              // 3 images: stacked vertically, 4:3 aspect ratio
              if (imageCount === 3) {
                return (
                  <div className="flex flex-col gap-2">
                    {images.map((img, idx) => (
                      <div key={idx} className="w-[69px] h-[52px] sm:w-[112px] sm:h-[84px] flex-shrink-0 overflow-hidden rounded-lg border">
                        <img 
                          src={PLACEHOLDER}
                          alt={`Input image ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                );
              }
              
              // 4 images: 2x2 grid on left, 9:16 output on right
              if (imageCount === 4) {
                return (
                  <div className="flex gap-2 items-center">
                    {/* 4 input images in 2x2 grid, 9:16 aspect */}
                    <div className="grid grid-cols-2 gap-1">
                      {images.map((img, idx) => (
                        <div key={idx} className="w-[56px] h-[100px] sm:w-[73px] sm:h-[130px] flex-shrink-0 overflow-hidden rounded-lg border">
                          <img 
                            src={PLACEHOLDER}
                            alt={`Input image ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                    {/* 9:16 output video */}
                    <div 
                      className="w-[150px] h-[267px] sm:w-[148px] sm:h-[264px] flex-shrink-0 relative overflow-hidden rounded-lg border"
                      style={{ transform: 'translateZ(0)', willChange: 'transform' }}
                    >
                      <video 
                        src={PLACEHOLDER}
                        poster={PLACEHOLDER}
                        muted
                        playsInline
                        preload="auto"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                );
              }
              
              return null;
            })()}
            
            {/* Right side: Output video - fixed size (hidden for 4-image layout which has its own) */}
            {selectedTravelExample !== 2 && (
            <div 
              className="w-[168px] h-[168px] sm:w-[264px] sm:h-[264px] flex-shrink-0 relative"
              style={{ transform: 'translateZ(0)', willChange: 'transform' }}
            >
              <video 
                key={selectedTravelExample === 0 ? selectedExampleStyle : travelExamples[selectedTravelExample].id}
                ref={(video) => {
                  if (selectedTravelExample === 0) {
                    philosophyVideoRef.current = video;
                  }
                  if (video && isOpen) {
                    const playButton = video.nextElementSibling as HTMLElement | null;
                    if (playButton) {
                      playButton.style.display = 'none';
                      playButton.style.opacity = '0';
                    }
                  }
                }}
                src={selectedTravelExample === 0 ? currentExample.video : PLACEHOLDER}
                poster={selectedTravelExample === 0 ? currentExample.image1 : PLACEHOLDER}
                muted
                playsInline
                preload="auto"
                crossOrigin="anonymous"
                disableRemotePlayback
                onCanPlay={(e) => {
                  const v = e.currentTarget as HTMLVideoElement;
                  if (v.paused && isOpen && !isOpening) v.play().catch(() => {});
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
                      if (blurAmount >= 2) clearInterval(blurInterval);
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
                  <div className={cn(
                    "gap-0.5",
                    example.images.length === 2 && "flex flex-row",
                    example.images.length === 3 && "flex flex-row",
                    example.images.length === 4 && "grid grid-cols-2"
                  )}>
                    {thumbImages.map((img, imgIdx) => (
                      <div 
                        key={imgIdx} 
                        className={cn(
                          "bg-muted/50 rounded-sm overflow-hidden",
                          example.images.length === 2 && "w-5 h-5 aspect-square",
                          example.images.length === 3 && "w-5 aspect-[4/3]",
                          example.images.length === 4 && "w-4 h-4"
                        )}
                      >
                        <img 
                          src={idx === 0 ? img : PLACEHOLDER}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
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
            You can use <span className="text-wes-vintage-gold">reference videos to steer the motion</span> — here's an example of how images and video references combine:
          </p>
          
          {/* All three columns are 4:3, same height, full width */}
          <div className="flex gap-3 w-full">
            {/* Column 1: 4×4 grid of input images (15 images + 1 empty) */}
            <div className="space-y-1 flex-[2]">
              <span className="text-xs text-muted-foreground/70">Input Images</span>
              <div className="aspect-square grid grid-cols-4 grid-rows-4 gap-1">
                {Array.from({ length: 15 }).map((_, idx) => (
                  <div key={idx} className="aspect-square bg-muted/30 rounded border border-muted/50 overflow-hidden">
                    <img 
                      src={PLACEHOLDER} 
                      alt={`Input ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
                {/* Empty 16th cell */}
                <div className="aspect-square" />
              </div>
            </div>
            
            {/* Column 2: Combined video showing motion reference + output (4:3) */}
            <div className="space-y-1 flex-[3]">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground/70">Motion Reference</span>
                <span className="text-xs text-muted-foreground/70">Output</span>
              </div>
              <div className="aspect-[4/3] bg-muted/30 rounded-lg border border-muted/50 overflow-hidden">
                <video 
                  src={PLACEHOLDER}
                  poster={PLACEHOLDER}
                  muted
                  loop
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 3: LoRA Selector for Motion Styles
            - 16:9 video with LoRA selector on the right
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">
            You can also use community-trained LoRAs to <span className="text-wes-vintage-gold">give the motion a distinctive style</span>:
          </p>
          
          <div className="flex gap-3">
            {/* LoRA selector (left, right-aligned, fixed width) */}
            <div className="flex flex-col items-end gap-2 w-28 sm:w-32">
              <span className="text-xs text-muted-foreground/70 pr-2">Motion LoRA</span>
              {loraOptions.map((lora, idx) => (
                <button
                  key={lora.id}
                  onClick={() => setSelectedLora(idx)}
                  className={cn(
                    "w-full px-2 py-2 text-xs rounded-md transition-all duration-200 text-right",
                    selectedLora === idx
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent"
                  )}
                >
                  {lora.label}
                </button>
              ))}
            </div>
            
            {/* Video display (16:9) */}
            <div className="flex-1">
              <div className="aspect-video bg-muted/30 rounded-lg border border-muted/50 overflow-hidden">
                <video 
                  key={loraOptions[selectedLora].id}
                  src={PLACEHOLDER}
                  poster={PLACEHOLDER}
                  muted
                  loop
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 4: Image Generation with References
            - Left: Reference images (vertical)
            - Top right: Reference Type selector (horizontal)
            - Bottom right: Generated images
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">
            To give you the right starting images, you can <span className="text-wes-vintage-gold">generate them using references</span> for style, subject and scene:
          </p>
          
          <div className="flex gap-3">
            {/* Left: Reference image selector (vertical, centered) */}
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
            
            {/* Right: Reference type (top) + Generated images (bottom) */}
            <div className="flex-1 flex flex-col justify-center space-y-3">
              {/* Top: Reference type selector (full width) */}
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
              
              {/* Bottom: Generated images grid */}
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

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 5: Image Editing LoRAs
            - Input image | LoRA selector | Output image
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">
            And you can <span className="text-wes-vintage-gold">edit images with LoRAs built for specific tasks</span>:
          </p>
          
          <div className="flex gap-3 items-stretch">
            {/* Input image */}
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
            
            {/* LoRA selector */}
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
            
            {/* Output image */}
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

        {/* ═══════════════════════════════════════════════════════════════════
            CLOSING SECTION
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-muted/50 to-transparent my-6"></div>

        <div className="space-y-3">
          <p className="text-sm leading-relaxed">
            We believe that there's a world of creativity that's waiting to be discovered in the AI-driven journey between images and <span className="text-wes-vintage-gold"><span className="font-theme-heading">Reigh</span> is a tool just for exploring this artform.</span> By endless improving it and implementing ideas and work from the community, we hope to make it extremely good.
          </p>
          <p className="text-sm leading-relaxed">
            And everything is open source - meaning <span className="text-wes-vintage-gold">you can run it for free on your computer</span>! If you're interested in joining, you're very welcome.
          </p>
          <p className="font-serif text-lg italic transform -rotate-1 mt-4">POM</p>
        </div>

        <div className="w-12 h-px bg-muted/30 mt-6"></div>

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
