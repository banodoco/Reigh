import { Link, useRouteError } from 'react-router-dom';
import { Home, Compass, Sparkles } from 'lucide-react';

export default function NotFoundPage() {
  const error = useRouteError() as any; // Basic error handling
  console.error(error);

  return (
    <div className="min-h-screen wes-texture relative overflow-hidden flex items-center justify-center">
      {/* Background decorative elements */}
      <div className="absolute inset-0 bg-gradient-to-br from-wes-cream via-white to-wes-dusty-blue/20 opacity-70"></div>
      <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-wes-pink/10 rounded-full blur-3xl animate-wes-float"></div>
      <div className="absolute bottom-1/4 right-1/4 w-40 h-40 bg-wes-yellow/10 rounded-full blur-3xl animate-wes-float" style={{ animationDelay: '2s' }}></div>
      
      <div className="wes-symmetry relative z-10 max-w-2xl mx-auto px-4 animate-wes-appear">
        <div className="wes-card p-12">
          {/* Error Icon */}
          <div className="mb-8">
            <div className="w-24 h-24 bg-gradient-to-br from-wes-burgundy to-primary rounded-3xl flex items-center justify-center shadow-wes mx-auto">
              <Compass className="w-12 h-12 text-wes-cream" />
            </div>
          </div>

          {/* Error Message */}
          <div className="mb-8">
            <h1 className="font-crimson text-6xl font-semibold text-primary mb-4 tracking-wide">
              404
            </h1>
            <h2 className="font-crimson text-3xl font-semibold text-primary mb-4">
              Page Not Found
            </h2>
            <div className="w-24 h-1 bg-wes-pink rounded-full mx-auto mb-6"></div>
            
            <p className="font-inter text-lg text-muted-foreground leading-relaxed mb-4">
              It seems you've wandered into uncharted artistic territory. 
              The page you're looking for has taken a different creative path.
            </p>
            
            {error?.statusText || error?.message ? (
              <div className="bg-wes-yellow/20 border border-wes-yellow/30 rounded-lg p-4 mb-6">
                <p className="font-inter text-sm text-muted-foreground">
                  <span className="font-medium">Technical details:</span> {error.statusText || error.message}
                </p>
              </div>
            ) : null}
          </div>

          {/* Navigation Options */}
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
            <Link 
              to="/" 
              className="group flex items-center space-x-3 wes-button px-8 py-4 text-primary-foreground rounded-xl transition-all duration-300 hover:scale-105"
            >
              <Home className="h-5 w-5 group-hover:rotate-12 transition-transform duration-300" />
              <span className="font-inter font-medium tracking-wide">Return Home</span>
            </Link>
            
            <div className="flex items-center space-x-2 text-muted-foreground">
              <div className="w-2 h-2 bg-wes-dusty-blue rounded-full animate-pulse"></div>
              <span className="font-inter text-sm tracking-widest uppercase">or</span>
              <div className="w-2 h-2 bg-wes-mint rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>
            
            <button 
              onClick={() => window.history.back()}
              className="group flex items-center space-x-3 px-6 py-3 border-2 border-primary/20 rounded-xl bg-white/80 hover:bg-accent/30 transition-all duration-300 hover:scale-105"
            >
              <Sparkles className="h-4 w-4 text-primary group-hover:animate-spin" />
              <span className="font-inter font-medium text-primary tracking-wide">Go Back</span>
            </button>
          </div>

          {/* Decorative Elements */}
          <div className="mt-12 flex items-center justify-center">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-px bg-gradient-to-r from-transparent to-wes-pink/50"></div>
              <div className="w-2 h-2 bg-wes-yellow rounded-full"></div>
              <div className="w-8 h-px bg-wes-pink/50"></div>
              <div className="w-2 h-2 bg-wes-mint rounded-full"></div>
              <div className="w-16 h-px bg-gradient-to-l from-transparent to-wes-pink/50"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 