export type ContentStatus = 'Pending' | 'Writing' | 'Imaging' | 'Done' | 'Error';

export interface ContentRow {
  date: string;          // ISO date string YYYY-MM-DD
  topic: string;
  linkedinPost: string;
  mediumArticle: string;
  igScript: string;
  ytScript: string;
  devtoArticle: string;
  status: ContentStatus;
  linkedinImage: string; // relative path e.g. /images/2024-01-01-linkedin.png
  mediumImage: string;
  igImage: string;
  lastUpdated: string;   // ISO datetime
  updatedBy: string;     // which agent wrote last
}

export interface PipelineStatus {
  running: boolean;
  currentStep: string;
  lastRun: string | null;
  lastError: string | null;
}

export interface ApiKeyHealth {
  groq: boolean;
  gemini: boolean;
}

export interface StatusResponse {
  pipeline: PipelineStatus;
  keys: ApiKeyHealth;
  nextRun: string;
}
