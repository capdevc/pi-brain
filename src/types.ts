export interface OtaEntryInput {
  turnNumber: number;
  timestamp: string;
  model: string;
  thought: string;
  thinking: string;
  actions: string[];
  observations: string[];
}

export interface GccContextParams {
  level?: string;
  branch?: string;
  commit?: string;
  segment?: string;
}
