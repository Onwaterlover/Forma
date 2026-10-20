import { z } from "zod";
import { PATTERNS } from "@/engine/types";

// Validation for data arriving from the browser. Never trust client-built objects.

const plannedExercise = z.object({
  exerciseId: z.string().min(1).max(80),
  sets: z.number().int().min(1).max(10),
  repMin: z.number().int().min(0).max(100),
  repMax: z.number().int().min(0).max(100),
  seconds: z.number().int().min(1).max(7200).optional(),
  restSec: z.number().int().min(0).max(900),
  effort: z.enum(["leave_2_3", "leave_1_3", "leave_0_2", "last_set_failure_ok"]),
  progression: z.enum(["double", "reps_then_variant", "assist_reduce", "time"]),
  pattern: z.enum(PATTERNS),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  superset: z.number().int().min(0).max(99).optional(),
  note: z.string().max(300).optional(),
});

const message = z.object({ code: z.string().max(60), params: z.record(z.string(), z.union([z.string().max(500), z.number()])).optional() });

export const planSchema = z.object({
  engineVersion: z.string().max(20),
  split: z.string().max(60),
  sessions: z
    .array(
      z.object({
        key: z.string().min(1).max(4),
        template: z.string().max(40),
        name: z.string().max(60).optional(),
        day: z.number().int().min(0).max(6).nullable(),
        locationId: z.string().max(64),
        exercises: z.array(plannedExercise).max(20),
        estimatedMinutes: z.number().min(0).max(1000),
      }),
    )
    .max(7),
  weeklySets: z.record(z.string(), z.number()),
  tradeoffs: z.array(message).max(60),
  notes: z.array(message).max(60),
});

const set = z.object({
  id: z.string().max(100),
  type: z.enum(["warmup", "working", "drop", "failure"]),
  reps: z.number().int().min(0).max(1000).nullable(),
  weightKg: z.number().min(0).max(1000).nullable(),
  rir: z.number().min(0).max(10).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  durationS: z.number().int().min(0).max(36000).nullable(),
  completed: z.boolean(),
});

export const workoutSchema = z.object({
  id: z.uuid(),
  planId: z.string().max(64).nullable(),
  planVersion: z.number().int().nullable(),
  sessionKey: z.string().max(4).nullable(),
  name: z.string().min(1).max(80),
  locationId: z.string().max(64).nullable(),
  mode: z.enum(["simple", "detailed"]),
  status: z.enum(["in_progress", "completed", "abandoned"]),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  notes: z.string().max(2000).nullable(),
  clientUpdatedAt: z.iso.datetime(),
  exercises: z
    .array(
      z.object({
        id: z.string().max(120),
        exerciseId: z.string().min(1).max(80),
        name: z.string().min(1).max(120),
        loading: z.string().max(30),
        target: z
          .object({ sets: z.number(), repMin: z.number(), repMax: z.number(), seconds: z.number().optional(), restSec: z.number(), effort: z.string().max(40), priority: z.number().int().min(1).max(3).optional() })
          .nullable(),
        completed: z.boolean(),
        skipped: z.boolean(),
        notes: z.string().max(1000).nullable(),
        sets: z.array(set).max(30),
      }),
    )
    .max(30),
});
