export interface BrushStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  isErasing: boolean;
}

