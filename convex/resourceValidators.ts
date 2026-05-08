import { v } from 'convex/values';

export const resourceStatusValidator = v.union(
  v.literal('draft'),
  v.literal('published'),
  v.literal('archived'),
);

export const facetTypeValidator = v.union(
  v.literal('community'),
  v.literal('industry'),
  v.literal('location'),
  v.literal('topic'),
  v.literal('stage'),
);

export const submissionStatusValidator = v.union(
  v.literal('pending'),
  v.literal('needs_changes'),
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('merged'),
);

/** Full submission document as returned by `ctx.db` (for admin list responses). */
export const resourceSubmissionDocValidator = v.object({
  _id: v.id('resourceSubmissions'),
  _creationTime: v.number(),
  title: v.string(),
  description: v.string(),
  url: v.string(),
  submitterName: v.string(),
  submitterEmail: v.string(),
  organization: v.optional(v.string()),
  suggestedCommunities: v.array(v.string()),
  suggestedIndustries: v.array(v.string()),
  suggestedLocations: v.array(v.string()),
  suggestedTopics: v.array(v.string()),
  notes: v.optional(v.string()),
  status: submissionStatusValidator,
  moderatorNote: v.optional(v.string()),
  mergedIntoResourceId: v.optional(v.id('resources')),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const adminAccessDeniedReasonValidator = v.union(
  v.literal('signed_out'),
  v.literal('missing_email_in_token'),
  v.literal('not_configured'),
  v.literal('not_in_allowlist'),
);
