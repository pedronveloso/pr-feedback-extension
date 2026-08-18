export interface FeedbackComment {
  body: string;
  startLine: number | null;
  endLine: number | null;
  reviewer: string | null;
}

export interface LineRange {
  startLine: number | null;
  endLine: number | null;
}

export interface FileFeedbackEntry {
  filePath: string;
  comments: FeedbackComment[];
}

export interface ReviewerSummary {
  reviewer: string;
  body: string;
  pageOrder: number;
}

export interface FeedbackExtractionResult {
  entries: FileFeedbackEntry[];
  claudeReview: string | null;
  reviewerSummaries: ReviewerSummary[];
  warnings: string[];
}

const feedbackCommentPageOrder = new WeakMap<FeedbackComment, number>();

export function setFeedbackCommentPageOrder(comment: FeedbackComment, order: number): void {
  feedbackCommentPageOrder.set(comment, order);
}

export function getFeedbackCommentPageOrder(comment: FeedbackComment): number | undefined {
  return feedbackCommentPageOrder.get(comment);
}
