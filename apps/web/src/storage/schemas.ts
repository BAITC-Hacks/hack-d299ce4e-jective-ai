import { z } from 'zod';
import type { Proposal, Task, TaskDraft, Team } from '../types';

const strings = z.array(z.string());
const id = z.string().min(1);
const fact = z.string().nullable();
const score = z.number().finite().min(0).max(100);

export const draftSchema: z.ZodType<TaskDraft> = z.object({
  id, rawDescription: z.string(), industry: z.string().optional(),
  questions: z.array(z.object({ id, field: z.string(), question: z.string(), whyNeeded: z.string() })),
  answers: z.record(z.string()), createdAt: z.string(),
});

export const taskSchema: z.ZodType<Task> = z.object({
  id, title: fact, context: fact, need: fact, users: fact, data: fact,
  constraints: fact, expectedResult: fact, successCriteria: fact,
  businessContact: fact, interactionFormat: fact, industry: z.string().optional(),
  missingInformation: strings, status: z.enum(['draft', 'published']),
  rating: z.object({
    total: score, level: z.enum(['draft', 'working', 'ready', 'priority']),
    categories: z.array(z.object({
      id, label: z.string(), score, maxScore: score, reason: z.string(), missing: strings,
      suggestion: z.string().optional(), potentialGain: score.optional(),
    })),
    missingInformation: strings, potentialScore: score,
  }),
  proposalIds: strings, createdAt: z.string(), updatedAt: z.string(),
});

export const teamSchema: z.ZodType<Team> = z.object({ id, name: z.string(), skills: strings, interests: strings });

export const proposalSchema: z.ZodType<Proposal> = z.object({
  id, taskId: id, teamId: id, teamName: z.string(), solutionIdea: z.string(),
  plan: z.string(), estimatedTime: z.string(), prototypeUrl: z.string().optional(),
  status: z.enum(['pending', 'accepted', 'rejected']), createdAt: z.string(),
});
