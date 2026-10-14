import { z } from 'zod';
import { tripSchema, budgetVndSchema, TRIP_LIMITS } from './schemas.js';
import { idSchema } from './schemas.js';
import { summarizeBudget } from './itinerary.js';

export const GEMINI_MODEL = 'gemini-3.5-flash-lite' as const;
export const AI_LABEL = 'Lịch trình do AI đề xuất — hãy kiểm tra giờ mở cửa, thời gian di chuyển và giá trước khi đi.';
const money = z.number().int().min(0).max(TRIP_LIMITS.maxTotalCostVnd);
export const budgetSummarySchema = z.strictObject({
  days: z.array(z.strictObject({ dayId: idSchema, knownCostVnd: money, unknownCostCount: z.number().int().min(0).max(12) })).min(1).max(5),
  knownCostVnd: money, unknownCostCount: z.number().int().min(0).max(60), isComplete: z.boolean(),
  budgetVnd: budgetVndSchema, remainingVnd: z.number().int().min(-TRIP_LIMITS.maxTotalCostVnd).max(TRIP_LIMITS.maxBudgetVnd).nullable(),
  overBudgetVnd: money.nullable(),
});
export const aiItineraryResponseSchema = z.strictObject({
  apiVersion: z.literal('1'), kind: z.literal('ai'), provider: z.literal('gemini'), model: z.literal(GEMINI_MODEL),
  policyVersion: z.literal(1), label: z.literal(AI_LABEL), trip: tripSchema,
  budget: budgetSummarySchema, warnings: z.array(z.string().min(1).max(200)).min(1).max(8),
}).superRefine((value, ctx) => {
  const trip = tripSchema.safeParse(value.trip);
  if (trip.success && JSON.stringify(value.budget) !== JSON.stringify(summarizeBudget(trip.data))) ctx.addIssue({ code: 'custom', path: ['budget'], message: 'Budget phải tính lại từ Trip' });
});
export type AiItineraryResponse = z.infer<typeof aiItineraryResponseSchema>;
