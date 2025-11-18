import React from 'react';
import { X, ArrowRight } from 'lucide-react';

interface ExamplesPaneProps {
  isOpen: boolean;
  onClose: () => void;
  navigate: (path: string) => void;
}

export const ExamplesPane: React.FC<ExamplesPaneProps> = ({
  isOpen,
  onClose,
  navigate,
}) => {
  const examplesContentRef = React.useRef<HTMLDivElement | null>(null);

  const imagePairIndices = [1, 2];
  const multiSquareIndices = [1, 2, 3, 4];
  const motionExamples = [
    { id: 1, label: 'Vortex Motion' },
    { id: 2, label: 'Pulsing Effect' },
    { id: 3, label: 'Melting Transition' },
    { id: 4, label: 'Particle Explosion' },
  ];

  return (
    <div
      className={`fixed left-0 bottom-0 w-full h-1/2 max-h-[50vh] bg-white shadow-2xl z-[60] transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div ref={examplesContentRef} className="p-4 sm:p-8 h-full overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 sm:top-4 sm:right-4 p-2 sm:p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors duration-200 z-10"
        >
          <X className="w-5 h-5 sm:w-4 sm:h-4 text-gray-600" />
        </button>

        <div className="mb-8 text-center space-y-3">
          <h2 className="font-theme text-2xl sm:text-3xl font-theme-heading text-primary">Reigh is a tool made just for travelling between images</h2>
          <div className="w-16 h-1 bg-gradient-to-r from-wes-vintage-gold to-wes-coral rounded-full mx-auto animate-pulse-breathe"></div>
        </div>

        <div className="space-y-12 pb-4">
          {/* Section 1 */}
          <div className="space-y-4">
            <div className="flex flex-wrap justify-center items-center gap-4">
              {imagePairIndices.map(i => (
                <div key={i} className="bg-muted/20 border rounded-lg w-40 sm:w-56 aspect-video flex items-center justify-center text-xs text-muted-foreground">
                  16:9 Image {i}
                </div>
              ))}
              <ArrowRight className="w-6 h-6 text-wes-vintage-gold" />
              <div className="bg-muted/20 border rounded-lg w-40 sm:w-56 aspect-video flex items-center justify-center text-xs text-muted-foreground">
                16:9 Output
              </div>
            </div>
          </div>

          {/* Section 2 */}
          <div className="space-y-4">
            <h3 className="font-theme-light text-primary text-lg text-center">You can travel between batches of images of any size – with seamless transitions</h3>
            <div className="flex flex-wrap justify-center items-center gap-3">
              {multiSquareIndices.map(i => (
                <div key={i} className="bg-muted/20 border rounded-lg w-24 sm:w-28 aspect-square flex items-center justify-center text-xs text-muted-foreground">
                  Square {i}
                </div>
              ))}
              <ArrowRight className="w-5 h-5 text-wes-vintage-gold" />
              <div className="bg-muted/20 border rounded-lg w-24 sm:w-28 aspect-square flex items-center justify-center text-xs text-muted-foreground">
                Square Output
              </div>
            </div>
          </div>

          {/* Section 3 */}
          <div className="space-y-4">
            <h3 className="font-theme-light text-primary text-lg text-center">You can use LoRAs to achieve all kinds of weird and interesting motion</h3>
            <div className="flex flex-wrap justify-center items-center gap-4">
              {motionExamples.map(example => (
                <div key={example.id} className="relative w-40 sm:w-56">
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-muted/60 backdrop-blur-sm px-4 py-0.5 text-xs font-theme-light text-muted-foreground rounded-full border border-muted whitespace-nowrap text-center">
                    {example.label}
                  </div>
                  <div className="bg-muted/20 border rounded-lg aspect-video flex items-center justify-center text-xs text-muted-foreground">
                    16:9 Example {example.id}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Closing line + Join Us Button */}
          <div className="text-center space-y-8 mb-6">
            <p className="text-base md:text-lg font-theme-light text-primary m-0 max-w-2xl mx-auto">We believe that there's endless potential in this approach waiting to be unlocked&nbsp;&mdash; and that a tool and community focusing exclusively on it can unleash its promise.</p>
            
            <div className="w-12 h-px bg-muted/30 mx-auto"></div>
            
            <div className="flex items-center space-x-2 justify-center">
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
      </div>
    </div>
  );
};

