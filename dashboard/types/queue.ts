// types/queue.ts — Shared type definitions for queue items

export type ItemStatus    = "pending" | "approved" | "rejected";
export type Provider      = "aws" | "azure" | "gcp" | "generic";
export type Category      = "cloud" | "devops" | "microservices" | "data" | "security" | "cicd";
export type IntentSegment = "casual" | "engaged" | "high_intent" | "champion";

// ── AI Decision Engine ────────────────────────────────────────────────────────

export type DecisionAction =
  | "none"
  | "educational_email"
  | "upgrade_email"
  | "champion_outreach"
  | "team_collaboration_followup"
  | "returning_user_nurture"
  | "free_limit_conversion"
  | "high_intent_followup";

export type DecisionPriority = "low" | "medium" | "high";

export interface DiagramSpec {
  title:    string;
  nodes:    string[];
  edges:    [string, string][];
  provider: Provider;
  category: Category;
  style:    "flow" | "sequence" | "deployment";
}

export interface GalleryMetadata {
  gallery_title:       string;
  gallery_description: string;
  tags:                string[];
  category:            Category;
  provider:            Provider;
}

export interface SocialPosts {
  linkedin: string;
  twitter:  string;
  devto:    string;
}

export interface ConversionSuggestion {
  title:       string;
  description: string;
}

export interface UserContext {
  role:         string;
  company_type: string;
}

export interface QueueItem {
  id:                     string;
  keyword:                string;
  status:                 ItemStatus;
  timestamp:              string;
  description:            string;
  spec:                   DiagramSpec;
  diagram_html_path:      string;
  gallery_metadata:       GalleryMetadata;
  social_posts:           SocialPosts;
  conversion_suggestions?: ConversionSuggestion[];
  user_context?:          UserContext;
  /** Anonymous localStorage user ID of the diagram creator */
  creator_user_id?:       string;
  /** Intent score at the moment the item was saved */
  intent_score?:          number;
  /** Intent segment at the moment the item was saved */
  intent_segment?:        IntentSegment;
  /** AI Decision Engine — recommended next action */
  decision_action?:       DecisionAction;
  /** AI Decision Engine — action priority */
  decision_priority?:     DecisionPriority;
  /** AI Decision Engine — human-readable reason for the recommendation */
  decision_reason?:       string;
  /** AI Decision Engine — confidence score 0–1 */
  decision_confidence?:   number;
}
