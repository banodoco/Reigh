export interface BrushStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  isErasing: boolean;
}

export interface QuickCreateSuccess {
  isSuccessful: boolean;
  shotId: string | null;
  shotName: string | null;
  isLoading?: boolean; // True when shot is created but still syncing/loading
}

export interface ShotOption {
  id: string;
  name: string;
}
