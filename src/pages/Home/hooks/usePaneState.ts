import React, { useState, useEffect } from 'react';
import { useIsMobile } from '@/shared/hooks/use-mobile';

interface UsePaneStateReturn {
  showCreativePartner: boolean;
  showPhilosophy: boolean;
  showExamples: boolean;
  isCreativePartnerButtonAnimating: boolean;
  isPhilosophyButtonAnimating: boolean;
  isExamplesButtonAnimating: boolean;
  isCreativePartnerPaneClosing: boolean;
  isPhilosophyPaneClosing: boolean;
  isExamplesPaneClosing: boolean;
  isCreativePartnerPaneOpening: boolean;
  isPhilosophyPaneOpening: boolean;
  isExamplesPaneOpening: boolean;
  handleOpenToolActivate: () => void;
  handleExploringActivate: () => void;
  handleEmergingActivate: () => void;
  closeAllPanes: () => void;
  handleCloseCreativePartner: () => void;
  handleClosePhilosophy: () => void;
  handleCloseExamples: () => void;
}

export const usePaneState = (): UsePaneStateReturn => {
  const [showCreativePartner, setShowCreativePartner] = useState(false);
  const [showPhilosophy, setShowPhilosophy] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  
  const [isPhilosophyButtonAnimating, setIsPhilosophyButtonAnimating] = useState(false);
  const [isCreativePartnerButtonAnimating, setIsCreativePartnerButtonAnimating] = useState(false);
  const [isExamplesButtonAnimating, setIsExamplesButtonAnimating] = useState(false);
  
  const [isPhilosophyPaneClosing, setIsPhilosophyPaneClosing] = useState(false);
  const [isCreativePartnerPaneClosing, setIsCreativePartnerPaneClosing] = useState(false);
  const [isExamplesPaneClosing, setIsExamplesPaneClosing] = useState(false);
  
  const [isPhilosophyPaneOpening, setIsPhilosophyPaneOpening] = useState(false);
  const [isCreativePartnerPaneOpening, setIsCreativePartnerPaneOpening] = useState(false);
  const [isExamplesPaneOpening, setIsExamplesPaneOpening] = useState(false);

  const handleOpenToolActivate = () => {
    setIsCreativePartnerButtonAnimating(true);
    setIsCreativePartnerPaneOpening(true);
    setShowPhilosophy(false);
    setShowExamples(false);
    setShowCreativePartner(true);
    setTimeout(() => {
      setIsCreativePartnerButtonAnimating(false);
      setIsCreativePartnerPaneOpening(false);
    }, 350);
  };

  const handleExploringActivate = () => {
    setIsExamplesButtonAnimating(true);
    setIsExamplesPaneOpening(true);
    setShowCreativePartner(false);
    setShowPhilosophy(false);
    setShowExamples(true);
    setTimeout(() => {
      setIsExamplesButtonAnimating(false);
      setIsExamplesPaneOpening(false);
    }, 350);
  };

  const handleEmergingActivate = () => {
    setIsPhilosophyButtonAnimating(true);
    setIsPhilosophyPaneOpening(true);
    setShowCreativePartner(false);
    setShowExamples(false);
    setShowPhilosophy(true);
    setTimeout(() => {
      setIsPhilosophyButtonAnimating(false);
      setIsPhilosophyPaneOpening(false);
    }, 350);
  };

  const closeAllPanes = () => {
    if (showPhilosophy) handleClosePhilosophy();
    if (showCreativePartner) handleCloseCreativePartner();
    if (showExamples) handleCloseExamples();
    
    // Reset opening states just in case
    setIsPhilosophyPaneOpening(false);
    setIsCreativePartnerPaneOpening(false);
    setIsExamplesPaneOpening(false);
  };

  const handleCloseCreativePartner = () => {
    setIsCreativePartnerPaneClosing(true);
    setTimeout(() => setIsCreativePartnerPaneClosing(false), 300);
    setIsCreativePartnerPaneOpening(false);
    setShowCreativePartner(false);
    setIsCreativePartnerButtonAnimating(false);
  };

  const handleClosePhilosophy = () => {
    setIsPhilosophyPaneClosing(true);
    setTimeout(() => setIsPhilosophyPaneClosing(false), 300);
    setIsPhilosophyPaneOpening(false);
    setShowPhilosophy(false);
    setIsPhilosophyButtonAnimating(false);
  };

  const handleCloseExamples = () => {
    setIsExamplesPaneClosing(true);
    setTimeout(() => setIsExamplesPaneClosing(false), 300);
    setIsExamplesPaneOpening(false);
    setShowExamples(false);
    setIsExamplesButtonAnimating(false);
  };

  return {
    showCreativePartner,
    showPhilosophy,
    showExamples,
    isCreativePartnerButtonAnimating,
    isPhilosophyButtonAnimating,
    isExamplesButtonAnimating,
    isCreativePartnerPaneClosing,
    isPhilosophyPaneClosing,
    isExamplesPaneClosing,
    isCreativePartnerPaneOpening,
    isPhilosophyPaneOpening,
    isExamplesPaneOpening,
    handleOpenToolActivate,
    handleExploringActivate,
    handleEmergingActivate,
    closeAllPanes,
    handleCloseCreativePartner,
    handleClosePhilosophy,
    handleCloseExamples,
  };
};

