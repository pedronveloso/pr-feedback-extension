export interface FeedbackComment {
  body: string;
  startLine: number | null;
  endLine: number | null;
}

export interface LineRange {
  startLine: number | null;
  endLine: number | null;
}

export interface FileFeedbackEntry {
  filePath: string;
  comments: FeedbackComment[];
}

export interface FeedbackExtractionResult {
  entries: FileFeedbackEntry[];
  warnings: string[];
}
