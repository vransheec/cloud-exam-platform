/**
 * Batch Translate Handler
 *
 * One-time (and idempotent) Lambda that pre-translates every question and
 * alternative in non-SOA/DEA courses into Spanish, storing results in the
 * `_es` fields on the respective DynamoDB records.
 *
 * Feature: exam-spanish-translation
 * Validates: Property 10 (Batch idempotence), Property 11 (Post-batch completeness)
 *
 * Invocation:
 *   aws lambda invoke --function-name BatchTranslateFunction \
 *     --payload '{}' out.json
 *
 * Optional payload:
 *   { "courseCode": "CLF" }        // translate a single course
 *   { "dryRun": true }              // count + plan only, no Translate calls
 */

import { env } from '../config/env';
import { scanItems, queryItems } from '../config/database';
import { Question, Alternative } from '../models/types';
import {
  ENGLISH_ONLY_COURSES,
  translateField,
  TranslatableField,
} from '../services/translationService';

export interface BatchTranslateEvent {
  courseCode?: string;
  dryRun?: boolean;
}

export interface BatchTranslateResult {
  translated: number;
  skipped: number;
  failed: number;
  charactersSent: number;
  totalQuestionsProcessed: number;
  totalAlternativesProcessed: number;
  coursesProcessed: string[];
  failures: Array<{
    recordId: string;
    fieldName: string;
    error: string;
  }>;
  startedAt: string;
  completedAt: string;
  dryRun: boolean;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

/** Sleep for the given number of ms. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap `translateField` with a retry loop for transient errors.
 * Because `translateField` never throws, we observe failure as `null` return.
 * For retry we inspect the previous log lines (not accessible here), so we
 * implement retry as: if `null` was returned and the call produced a
 * potentially-transient error, retry up to MAX_RETRIES times.
 */
async function translateFieldWithRetry(args: {
  recordId: string;
  tableName: string;
  fieldName: TranslatableField;
  sourceText: string;
  courseCode: string;
}): Promise<string | null> {
  let attempt = 0;
  let result: string | null = null;

  // translateField returns null for SOA/DEA short-circuit, cache misses that
  // failed, or empty input. We retry `null` results only when the source was
  // non-empty and the course is translatable — otherwise we accept null.
  while (attempt <= MAX_RETRIES) {
    result = await translateField(args);
    if (result !== null) return result;

    // Decide whether to retry. We cannot distinguish transient from
    // permanent without instrumentation; retry only when the input was
    // translatable (non-empty source, not SOA/DEA).
    if (!args.sourceText || args.sourceText.trim() === '') return null;
    if (ENGLISH_ONLY_COURSES.has(args.courseCode)) return null;

    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS_MS[attempt];
      console.log(
        JSON.stringify({
          level: 'info',
          msg: 'batch_translate_retry',
          recordId: args.recordId,
          fieldName: args.fieldName,
          attempt: attempt + 1,
          delayMs: delay,
        })
      );
      await sleep(delay);
    }
    attempt++;
  }
  return null;
}

/**
 * Main batch translate handler.
 */
export async function handler(event: BatchTranslateEvent = {}): Promise<BatchTranslateResult> {
  const startedAt = new Date().toISOString();
  const dryRun = !!event.dryRun;

  const result: BatchTranslateResult = {
    translated: 0,
    skipped: 0,
    failed: 0,
    charactersSent: 0,
    totalQuestionsProcessed: 0,
    totalAlternativesProcessed: 0,
    coursesProcessed: [],
    failures: [],
    startedAt,
    completedAt: '',
    dryRun,
  };

  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'batch_translate_started',
      courseCode: event.courseCode ?? 'ALL',
      dryRun,
    })
  );

  // 1. Fetch all questions (by course filter or full scan).
  let questions: Question[];
  if (event.courseCode) {
    questions = await queryItems<Question>(
      env.questionsTable,
      'courseCode = :cc',
      { ':cc': event.courseCode },
      'courseCode-createdAt-index'
    );
  } else {
    questions = await scanItems<Question>(env.questionsTable);
  }

  // 2. Filter SOA/DEA out (Req 9.1, Property 6).
  const eligibleQuestions = questions.filter(
    (q) => !ENGLISH_ONLY_COURSES.has(q.courseCode)
  );

  const coursesSeen = new Set<string>();

  // 3. Process each eligible question and its alternatives.
  for (const question of eligibleQuestions) {
    coursesSeen.add(question.courseCode);
    result.totalQuestionsProcessed++;

    // Load alternatives for this question.
    let alternatives: Alternative[];
    try {
      alternatives = await queryItems<Alternative>(
        env.alternativesTable,
        'questionId = :qid',
        { ':qid': question.id },
        'questionId-order-index'
      );
    } catch (err) {
      result.failures.push({
        recordId: question.id,
        fieldName: 'alternatives:load',
        error: (err as Error).message,
      });
      result.failed++;
      continue;
    }
    result.totalAlternativesProcessed += alternatives.length;

    const jobs: Array<{
      recordId: string;
      tableName: string;
      fieldName: TranslatableField;
      sourceText: string;
      existingEs: string | null | undefined;
    }> = [
      {
        recordId: question.id,
        tableName: env.questionsTable,
        fieldName: 'questionText',
        sourceText: typeof question.questionText === 'string' ? question.questionText : '',
        existingEs: typeof question.questionText_es === 'string' ? question.questionText_es : null,
      },
      {
        recordId: question.id,
        tableName: env.questionsTable,
        fieldName: 'explanation',
        sourceText: typeof question.explanation === 'string' ? question.explanation : '',
        existingEs: typeof question.explanation_es === 'string' ? question.explanation_es : null,
      },
      {
        recordId: question.id,
        tableName: env.questionsTable,
        fieldName: 'incorrectExplanation',
        sourceText: typeof question.incorrectExplanation === 'string' ? question.incorrectExplanation : '',
        existingEs: typeof question.incorrectExplanation_es === 'string' ? question.incorrectExplanation_es : null,
      },
      ...alternatives.map((alt) => ({
        recordId: alt.id,
        tableName: env.alternativesTable,
        fieldName: 'text' as TranslatableField,
        sourceText: typeof alt.text === 'string' ? alt.text : '',
        existingEs: typeof alt.text_es === 'string' ? alt.text_es : null,
      })),
    ];

    for (const job of jobs) {
      // Skip empty-source fields.
      if (!job.sourceText || job.sourceText.trim() === '') {
        result.skipped++;
        continue;
      }

      // Skip already-cached fields (Req 9.4, Property 10 idempotence).
      if (typeof job.existingEs === 'string' && job.existingEs.trim() !== '') {
        result.skipped++;
        continue;
      }

      if (dryRun) {
        // Count what would be translated without calling Translate.
        result.translated++;
        result.charactersSent += job.sourceText.length;
        continue;
      }

      const translated = await translateFieldWithRetry({
        recordId: job.recordId,
        tableName: job.tableName,
        fieldName: job.fieldName,
        sourceText: job.sourceText,
        courseCode: question.courseCode,
      });

      if (translated === null) {
        result.failed++;
        result.failures.push({
          recordId: job.recordId,
          fieldName: job.fieldName,
          error: 'translation_failed_or_returned_null',
        });
      } else {
        result.translated++;
        result.charactersSent += job.sourceText.length;
      }
    }
  }

  result.coursesProcessed = Array.from(coursesSeen).sort();
  result.completedAt = new Date().toISOString();

  // Summary log (Req 9.5).
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'batch_translate_completed',
      translated: result.translated,
      skipped: result.skipped,
      failed: result.failed,
      charactersSent: result.charactersSent,
      totalQuestionsProcessed: result.totalQuestionsProcessed,
      totalAlternativesProcessed: result.totalAlternativesProcessed,
      coursesProcessed: result.coursesProcessed,
      dryRun,
      startedAt,
      completedAt: result.completedAt,
      failuresCount: result.failures.length,
    })
  );

  return result;
}

/** Explicit named export so it can be referenced as `dist/index.batchTranslate`. */
export const batchTranslate = handler;
