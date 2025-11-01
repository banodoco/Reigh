import React from 'react';
import { Github, MessageCircle, Plus } from 'lucide-react';

export const SocialIcons: React.FC = () => {
  return (
    <div className="flex justify-center py-4">
      <div className="flex flex-col items-center space-y-3">
        {/* GitHub and Discord icons side by side */}
        <div className="flex items-center space-x-3">
          <a
            href="http://github.com/peteromallet/reigh"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-white/50 backdrop-blur-sm rounded-full border border-wes-vintage-gold/20 hover:border-wes-vintage-gold/40 transition-all duration-300 hover:bg-white/70 group opacity-80 hover:opacity-100 shadow-md"
          >
            <Github className="w-4 h-4 text-wes-vintage-gold/80 group-hover:text-wes-vintage-gold transition-colors duration-300" />
          </a>
          <a
            href="https://discord.gg/D5K2c6kfhy"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-white/50 backdrop-blur-sm rounded-full border border-wes-vintage-gold/20 hover:border-wes-vintage-gold/40 transition-all duration-300 hover:bg-white/70 group opacity-80 hover:opacity-100 shadow-md"
          >
            <MessageCircle className="w-4 h-4 text-wes-vintage-gold/80 group-hover:text-wes-vintage-gold transition-colors duration-300" />
          </a>
        </div>
        
        {/* Placeholder icon beneath them */}
        <div className="p-1.5 bg-white/20 backdrop-blur-sm rounded-full border border-wes-vintage-gold/5 opacity-30">
          <Plus className="w-2.5 h-2.5 text-wes-vintage-gold/40" />
        </div>
      </div>
    </div>
  );
};

