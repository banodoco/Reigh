import * as React from "react"
import { useUserUIState } from "@/shared/hooks/useUserUIState"

type InputMode = "voice" | "text"

interface AIInputModeContextValue {
  mode: InputMode
  setMode: (mode: InputMode) => void
  toggleMode: () => void
  isLoading: boolean
}

const AIInputModeContext = React.createContext<AIInputModeContextValue | null>(null)

export function AIInputModeProvider({ children }: { children: React.ReactNode }) {
  const { value, update, isLoading } = useUserUIState('aiInputMode', { mode: 'voice' })
  
  const setMode = React.useCallback((mode: InputMode) => {
    update({ mode })
  }, [update])
  
  const toggleMode = React.useCallback(() => {
    update({ mode: value.mode === 'voice' ? 'text' : 'voice' })
  }, [update, value.mode])
  
  return (
    <AIInputModeContext.Provider value={{ 
      mode: value.mode, 
      setMode, 
      toggleMode,
      isLoading 
    }}>
      {children}
    </AIInputModeContext.Provider>
  )
}

export function useAIInputMode() {
  const context = React.useContext(AIInputModeContext)
  if (!context) {
    // Return default values if not wrapped in provider (graceful fallback)
    return {
      mode: 'voice' as InputMode,
      setMode: () => {},
      toggleMode: () => {},
      isLoading: false
    }
  }
  return context
}

