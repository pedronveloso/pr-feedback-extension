export interface FileFeedbackEntry {
  filePath: string;
  comments: string[];
}

export interface FeedbackExtractionResult {
  entries: FileFeedbackEntry[];
  warnings: string[];
}
