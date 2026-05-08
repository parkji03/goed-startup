import { v } from 'convex/values';
import { internal } from './_generated/api';
import { mutation, query } from './_generated/server';
import { checkAdminGate, requireAdmin } from './lib/adminAuth';
import {
  adminAccessDeniedReasonValidator,
  resourceSubmissionDocValidator,
} from './resourceValidators';

export const submit = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert('resourceSubmissions', {
      title: args.title.trim(),
      description: args.description.trim(),
      url: args.url.trim(),
      submitterName: args.submitterName.trim(),
      submitterEmail: args.submitterEmail.trim().toLowerCase(),
      organization: args.organization?.trim(),
      suggestedCommunities: args.suggestedCommunities,
      suggestedIndustries: args.suggestedIndustries,
      suggestedLocations: args.suggestedLocations,
      suggestedTopics: args.suggestedTopics,
      notes: args.notes?.trim(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('resourceSubmissionEvents', {
      submissionId: id,
      action: 'created',
      detail: 'public_submit',
      createdAt: now,
    });
    return { submissionId: id };
  },
});

export const listPendingForAdmin = query({
  args: {},
  returns: v.union(
    v.object({
      access: v.literal('allowed'),
      submissions: v.array(resourceSubmissionDocValidator),
    }),
    v.object({
      access: v.literal('denied'),
      reason: adminAccessDeniedReasonValidator,
    }),
  ),
  handler: async (ctx) => {
    const gate = await checkAdminGate(ctx);
    if (!gate.ok) {
      return { access: 'denied' as const, reason: gate.reason };
    }
    const submissions = await ctx.db
      .query('resourceSubmissions')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .order('desc')
      .take(100);
    return { access: 'allowed' as const, submissions };
  },
});

export const approve = mutation({
  args: { submissionId: v.id('resourceSubmissions') },
  handler: async (ctx, { submissionId }) => {
    const admin = await requireAdmin(ctx);
    const sub = await ctx.db.get(submissionId);
    if (!sub) throw new Error('Submission not found');
    if (sub.status !== 'pending' && sub.status !== 'needs_changes') {
      throw new Error('Submission is not approvable');
    }

    const sourceId = `submission-${submissionId}`;
    const communitiesRaw = sub.suggestedCommunities.join('|');
    const industriesRaw = sub.suggestedIndustries.join('|');
    const locationsRaw = sub.suggestedLocations.join('|');
    const topicsRaw = sub.suggestedTopics.join('|');

    await ctx.runMutation(internal.resourceInternal.upsertResource, {
      row: {
        sourceId,
        title: sub.title,
        description: sub.description,
        url: sub.url,
        contactEmail: sub.submitterEmail,
        communitiesRaw,
        industriesRaw,
        locationsRaw,
        topicsRaw,
        status: 'published',
        submissionId,
      },
    });

    const now = Date.now();
    await ctx.db.patch(submissionId, {
      status: 'approved',
      updatedAt: now,
    });
    await ctx.db.insert('resourceSubmissionEvents', {
      submissionId,
      actorTokenIdentifier: admin.tokenIdentifier,
      action: 'approved',
      createdAt: now,
    });
  },
});

export const reject = mutation({
  args: {
    submissionId: v.id('resourceSubmissions'),
    reason: v.string(),
  },
  handler: async (ctx, { submissionId, reason }) => {
    const admin = await requireAdmin(ctx);
    const sub = await ctx.db.get(submissionId);
    if (!sub) throw new Error('Submission not found');
    const trimmed = reason.trim();
    if (!trimmed) throw new Error('Rejection reason is required.');
    const now = Date.now();
    await ctx.db.patch(submissionId, {
      status: 'rejected',
      moderatorNote: trimmed,
      updatedAt: now,
    });
    await ctx.db.insert('resourceSubmissionEvents', {
      submissionId,
      actorTokenIdentifier: admin.tokenIdentifier,
      action: 'rejected',
      detail: trimmed,
      createdAt: now,
    });
  },
});

export const requestChanges = mutation({
  args: {
    submissionId: v.id('resourceSubmissions'),
    note: v.string(),
  },
  handler: async (ctx, { submissionId, note }) => {
    const admin = await requireAdmin(ctx);
    const sub = await ctx.db.get(submissionId);
    if (!sub) throw new Error('Submission not found');
    const now = Date.now();
    await ctx.db.patch(submissionId, {
      status: 'needs_changes',
      moderatorNote: note,
      updatedAt: now,
    });
    await ctx.db.insert('resourceSubmissionEvents', {
      submissionId,
      actorTokenIdentifier: admin.tokenIdentifier,
      action: 'needs_changes',
      detail: note,
      createdAt: now,
    });
  },
});
