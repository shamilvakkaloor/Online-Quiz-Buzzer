import { z } from 'zod';
export const uuid = z.uuid();
const name = z.string().trim().min(1).max(100);
const score = z
  .number()
  .min(-999999.99)
  .max(999999.99)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001,
    'Use at most two decimal places',
  );
const overrides = {
  positive_score: score.nullable().optional(),
  negative_score: score.nullable().optional(),
  zero_score: score.nullable().optional(),
};
export const joinSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .transform((v) => v.toUpperCase()),
    display_name: name.optional(),
    password: z.string().min(1).max(200).optional(),
  })
  .strict();
export const commandSchema = z
  .object({
    type: z.enum([
      'START_QUIZ',
      'FINISH_QUIZ',
      'START_QUESTION',
      'COMPLETE_QUESTION',
      'SKIP_QUESTION',
      'LOCK_BUZZER',
      'REOPEN_BUZZER',
      'PAUSE',
      'RESUME',
      'SET_DISPLAY_LIMIT',
      'SET_SHOW_OWN_POSITION',
      'TIMER_START',
      'TIMER_PAUSE',
      'TIMER_RESET',
      'REVEAL_LEADERBOARD',
      'HIDE_LEADERBOARD',
    ]),
    expected_version: z.number().int().min(1),
    payload: z
      .object({
        question_id: uuid.optional(),
        reason: z.string().max(200).optional(),
        value: z.union([z.number().int().min(0).max(50), z.boolean()]).optional(),
        duration_ms: z.number().int().min(1000).max(3600000).optional(),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.type === 'SET_DISPLAY_LIMIT' && typeof v.payload.value !== 'number')
      ctx.addIssue({ code: 'custom', message: 'A display limit is required' });
    if (v.type === 'SET_SHOW_OWN_POSITION' && typeof v.payload.value !== 'boolean')
      ctx.addIssue({ code: 'custom', message: 'A visibility value is required' });
    if (v.type === 'SKIP_QUESTION' && !v.payload.question_id)
      ctx.addIssue({ code: 'custom', message: 'Choose a question' });
  });
export const scoreSchema = z
  .object({
    question_id: uuid,
    participant_id: uuid,
    value: score,
    expected_revision: z.number().int().min(0),
    reason: z.string().trim().max(300).default('Score entry'),
  })
  .strict();
const base = { id: uuid.optional(), operation: z.enum(['save', 'delete']).default('save') };
const participant = z
  .object({
    display_name: name,
    identifier: name.optional(),
    type: z.enum(['PERSON', 'TEAM']).default('TEAM'),
  })
  .strict();
export const setupSchemas: Record<string, z.ZodType> = {
  rounds: z
    .object({
      ...base,
      name: name.optional(),
      uses_subrounds: z.boolean().optional(),
      ...overrides,
    })
    .strict(),
  subrounds: z
    .object({ ...base, name: name.optional(), round_id: uuid.optional(), ...overrides })
    .strict(),
  questions: z
    .object({
      ...base,
      round_id: uuid.optional(),
      subround_id: uuid.nullable().optional(),
      count: z.number().int().min(1).max(100).optional(),
      ...overrides,
    })
    .strict(),
  participants: z
    .object({
      ...base,
      operation: z.enum(['save', 'delete', 'rotate', 'revoke_code']).default('save'),
      display_name: name.optional(),
      identifier: name.optional(),
      type: z.enum(['PERSON', 'TEAM']).optional(),
      items: z.array(participant).min(1).max(50).optional(),
    })
    .strict(),
  settings: z
    .object({
      max_participants: z.number().int().min(1).max(50),
      max_buzzes_per_question: z.number().int().min(1).max(50),
      default_display_limit: z.number().int().min(0).max(50),
      show_own_position: z.boolean(),
      default_positive_score: score,
      default_negative_score: score,
      default_zero_score: score.nullable(),
      participant_mode: z.enum(['OPEN', 'PRE_REGISTERED']),
      identifier_style: name,
      auto_lock_after: z.number().int().min(1).max(50).nullable(),
      lock_on_timer_end: z.boolean(),
      default_timer_ms: z.number().int().min(1000).max(3600000).nullable(),
      audience_enabled: z.boolean(),
    })
    .strict(),
  access: z
    .object({
      kind: z.enum(['PARTICIPANT', 'SCOREKEEPER', 'AUDIENCE']),
      operation: z.enum(['save', 'rotate']).default('save'),
      active: z.boolean().optional(),
    })
    .strict(),
  members: z.object({ id: uuid }).strict(),
  takeovers: z.object({ id: uuid, operation: z.enum(['approve', 'reject']) }).strict(),
  rules: z
    .object({
      ...base,
      trigger: z.enum(['QUESTION', 'ROUND', 'EVENT']).optional(),
      target_id: uuid.nullable().optional(),
    })
    .strict(),
};
export const quizCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    quiz_code: z
      .string()
      .trim()
      .min(3)
      .max(20)
      .regex(/^[A-Za-z2-9]+$/)
      .transform((v) => v.toUpperCase()),
    password: z.string().min(10).max(200),
  })
  .strict();
export const credentialsSchema = z
  .object({
    password: z.string().min(10).max(200).optional(),
    quiz_code: z
      .string()
      .min(3)
      .max(20)
      .regex(/^[A-Za-z2-9]+$/)
      .transform((v) => v.toUpperCase())
      .optional(),
    revoke_all: z.boolean().default(false),
  })
  .strict();
