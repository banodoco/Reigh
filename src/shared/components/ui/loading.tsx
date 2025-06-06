import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/shared/lib/utils"
import { Camera, Film, Palette, Sparkles } from "lucide-react"

const loadingVariants = cva(
  "inline-flex items-center justify-center",
  {
    variants: {
      variant: {
        default: "animate-spin",
        wes: "wes-loading",
        "wes-film": "wes-film-loading",
        "wes-vintage": "wes-vintage-loading",
        "wes-ornate": "wes-ornate-loading",
      },
      size: {
        default: "h-6 w-6",
        sm: "h-4 w-4",
        lg: "h-8 w-8",
        xl: "h-12 w-12",
        "2xl": "h-16 w-16",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface LoadingProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof loadingVariants> {
  text?: string;
}

const Loading = React.forwardRef<HTMLDivElement, LoadingProps>(
  ({ className, variant, size, text, ...props }, ref) => {
    
    if (variant === "wes") {
      return (
        <div ref={ref} className={cn("wes-symmetry space-y-4", className)} {...props}>
          <div className="relative">
            <div className="w-16 h-16 bg-gradient-to-br from-wes-vintage-gold to-wes-coral rounded-full flex items-center justify-center shadow-wes-vintage animate-vintage-pulse">
              <Palette className="w-8 h-8 text-white animate-rotate-slow" />
            </div>
            <div className="absolute inset-0 border-3 border-wes-vintage-gold rounded-full animate-rotate-slow opacity-50"></div>
            <div className="absolute inset-2 border border-wes-coral rounded-full animate-rotate-slow" style={{ animationDirection: 'reverse' }}></div>
          </div>
          {text && (
            <p className="font-crimson text-lg text-primary animate-vintage-glow wes-typewriter">
              {text}
            </p>
          )}
        </div>
      )
    }

    if (variant === "wes-film") {
      return (
        <div ref={ref} className={cn("wes-symmetry space-y-6", className)} {...props}>
          <div className="relative wes-filmstrip">
            <div className="flex space-x-2">
              <div className="w-3 h-16 bg-gradient-to-b from-wes-burgundy to-primary rounded animate-slide-in-left"></div>
              <div className="w-3 h-16 bg-gradient-to-b from-wes-coral to-wes-salmon rounded animate-slide-in-left" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-3 h-16 bg-gradient-to-b from-wes-mint to-wes-sage rounded animate-slide-in-left" style={{ animationDelay: '0.4s' }}></div>
              <div className="w-3 h-16 bg-gradient-to-b from-wes-yellow to-wes-mustard rounded animate-slide-in-left" style={{ animationDelay: '0.6s' }}></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Film className="w-8 h-8 text-wes-vintage-gold animate-bounce-gentle" />
            </div>
          </div>
          {text && (
            <p className="font-inter text-sm text-muted-foreground tracking-widest uppercase animate-fade-in-up">
              {text}
            </p>
          )}
        </div>
      )
    }

    if (variant === "wes-vintage") {
      return (
        <div ref={ref} className={cn("wes-symmetry space-y-4", className)} {...props}>
          <div className="relative wes-viewfinder">
            <div className="w-20 h-20 bg-gradient-to-br from-wes-cream via-wes-pink to-wes-lavender rounded-full flex items-center justify-center shadow-wes-ornate">
              <div className="w-12 h-12 bg-gradient-to-br from-wes-vintage-gold to-wes-mustard rounded-full flex items-center justify-center animate-vintage-pulse">
                <Camera className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="absolute inset-0 wes-aperture"></div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-wes-vintage-gold rounded-full animate-vintage-pulse"></div>
            <div className="w-2 h-2 bg-wes-coral rounded-full animate-vintage-pulse" style={{ animationDelay: '0.5s' }}></div>
            <div className="w-2 h-2 bg-wes-mint rounded-full animate-vintage-pulse" style={{ animationDelay: '1s' }}></div>
          </div>
          {text && (
            <p className="font-crimson text-primary text-shadow-vintage animate-vintage-glow">
              {text}
            </p>
          )}
        </div>
      )
    }

    if (variant === "wes-ornate") {
      return (
        <div ref={ref} className={cn("wes-symmetry space-y-6 p-8 wes-vintage-card wes-ornate-frame", className)} {...props}>
          <div className="relative">
            <div className="w-24 h-24 wes-badge flex items-center justify-center">
              <Sparkles className="w-12 h-12 text-white animate-rotate-slow" />
            </div>
            <div className="absolute -inset-4 border-2 border-wes-vintage-gold rounded-full animate-rotate-slow opacity-30"></div>
            <div className="absolute -inset-8 border border-wes-coral rounded-full animate-rotate-slow opacity-20" style={{ animationDirection: 'reverse' }}></div>
          </div>
          <div className="wes-divider w-full max-w-xs mx-auto"></div>
          {text && (
            <p className="font-playfair text-xl text-primary font-bold text-shadow-vintage-glow animate-vintage-glow">
              {text}
            </p>
          )}
          <div className="flex items-center justify-center space-x-3">
            <div className="text-wes-vintage-gold text-sm animate-sway">❋</div>
            <div className="w-8 h-px bg-wes-vintage-gold animate-vintage-pulse"></div>
            <div className="text-wes-coral text-sm animate-sway" style={{ animationDelay: '1s' }}>◆</div>
            <div className="w-8 h-px bg-wes-vintage-gold animate-vintage-pulse"></div>
            <div className="text-wes-mint text-sm animate-sway" style={{ animationDelay: '2s' }}>✧</div>
          </div>
        </div>
      )
    }

    // Default spinner
    return (
      <div
        ref={ref}
        className={cn(loadingVariants({ variant, size, className }))}
        {...props}
      >
        <svg
          className="animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        {text && <span className="ml-2 text-sm">{text}</span>}
      </div>
    )
  }
)
Loading.displayName = "Loading"

// Specialized loading states for common use cases
const PageLoading = React.forwardRef<HTMLDivElement, Omit<LoadingProps, 'variant'>>(
  ({ className, text = "Loading your creative workspace...", ...props }, ref) => (
    <div className="min-h-screen flex items-center justify-center wes-texture">
      <Loading 
        ref={ref} 
        variant="wes-ornate" 
        text={text}
        className={cn("", className)} 
        {...props} 
      />
    </div>
  )
)
PageLoading.displayName = "PageLoading"

const InlineLoading = React.forwardRef<HTMLDivElement, Omit<LoadingProps, 'variant'>>(
  ({ className, text, ...props }, ref) => (
    <Loading 
      ref={ref} 
      variant="wes" 
      text={text}
      className={cn("py-4", className)} 
      {...props} 
    />
  )
)
InlineLoading.displayName = "InlineLoading"

const ModalLoading = React.forwardRef<HTMLDivElement, Omit<LoadingProps, 'variant'>>(
  ({ className, text = "Processing...", ...props }, ref) => (
    <div className="flex items-center justify-center p-8">
      <Loading 
        ref={ref} 
        variant="wes-vintage" 
        text={text}
        className={cn("", className)} 
        {...props} 
      />
    </div>
  )
)
ModalLoading.displayName = "ModalLoading"

export { 
  Loading, 
  PageLoading, 
  InlineLoading, 
  ModalLoading, 
  loadingVariants 
} 