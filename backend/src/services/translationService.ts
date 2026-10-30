/**
 * Translation Service
 *
 * Wraps Amazon Translate `TranslateText` calls with three invariants:
 *   1. SOA/DEA short-circuit — questions in these courses are NEVER translated.
 *   2. Cache read — if the `<fieldName>_es` attribute is already a non-empty
 *      string, return it immediately without calling Amazon Translate.
 *   3. Conditional write — use `attribute_not_exists OR empty` so concurrent
 *      callers collapse to at most one TranslateText API call per field.
 *
 * The service never throws; Translate errors are logged and the function
 * returns `null` so callers (on-demand enqueue and batch) can continue.
 *
 * Feature: exam-spanish-translation
 * Validates: Properties 4, 5, 6, 7, 9
 */

import {
  TranslateClient,
  TranslateTextCommand,
} from '@aws-sdk/client-translate';
import {
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoDb } from '../config/database';
import { env } from '../config/env';
import { Question, Alternative } from '../models/types';

/** Fields whose English text can be translated to Spanish. */
export type TranslatableField =
  | 'questionText'
  | 'explanation'
  | 'incorrectExplanation'
  | 'text'; // on alternatives

/** Courses that are only offered in English and MUST NOT be translated. */
export const ENGLISH_ONLY_COURSES = new Set(['SOA', 'DEA']);

/** Amazon Translate Custom Terminology resource name (matches import step). */
export const TERMINOLOGY_NAME = 'cloud-exam-terminology';

/** Arguments for translating a single field on a question or alternative. */
export interface TranslateFieldArgs {
  /** Primary-key value of the DynamoDB record (question.id or alternative.id). */
  recordId: string;

  /** DynamoDB table name (questions or alternatives). */
  tableName: string;

  /** English field name. The `_es` variant is derived automatically. */
  fieldName: TranslatableField;

  /** Raw English text to translate. */
  sourceText: string;

  /**
   * The course code of the parent question. For an alternative this is the
   * parent question's courseCode. Required for the SOA/DEA short-circuit.
   */
  courseCode: string;
}

// Shared AWS SDK clients.
const translateClient = new TranslateClient({ region: env.awsRegion });

/**
 * Derive the Spanish field name for a given English field.
 * E.g. "questionText" -> "questionText_es", "text" -> "text_es".
 */
function esFieldName(fieldName: TranslatableField): string {
  return `${fieldName}_es`;
}

/**
 * Translate a single field and cache the result in DynamoDB.
 *
 * Returns:
 *   - the translated (or cached) Spanish string on success
 *   - `null` when the request is short-circuited (SOA/DEA) or when
 *     Amazon Translate fails
 *
 * Never throws.
 *
 * Order of operations:
 *   1. SOA/DEA short-circuit            (Property 6, Req 7.6, 7.7)
 *   2. Cache read — return cached value (Property 4, Req 7.5, 12.1)
 *   3. TranslateText API call           (Property 9, Req 8.1)
 *   4. Conditional write to DynamoDB    (Property 5, Req 7.3, 12.2, 12.3)
 *   5. Error handler — log + return null (Req 7.4)
 */
export async function translateField(
  args: TranslateFieldArgs
): Promise<string | null> {
  const { recordId, tableName, fieldName, sourceText, courseCode } = args;
  const esField = esFieldName(fieldName);

  // 1. SOA/DEA short-circuit — highest precedence, before any I/O.
  if (ENGLISH_ONLY_COURSES.has(courseCode)) {
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'translation_skipped_english_only',
        recordId,
        fieldName,
        courseCode,
      })
    );
    return null;
  }

  // Nothing to translate.
  if (!sourceText || sourceText.trim() === '') {
    return null;
  }

  // 2. Cache read — if the _es field is already non-empty, return it.
  try {
    const existing = await dynamoDb.send(
      new GetCommand({
        TableName: tableName,
        Key: { id: recordId },
        ProjectionExpression: '#f',
        ExpressionAttributeNames: { '#f': esField },
      })
    );
    const cached = existing.Item?.[esField];
    if (typeof cached === 'string' && cached.trim() !== '') {
      return cached;
    }
  } catch (error) {
    // Log and fall through — we'd rather attempt translation than fail loudly.
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'translation_cache_read_failed',
        recordId,
        fieldName,
        errorName: (error as Error).name,
        errorMessage: (error as Error).message,
      })
    );
  }

  // 3. TranslateText API call.
  let translatedText: string;
  try {
    const result = await translateClient.send(
      new TranslateTextCommand({
        SourceLanguageCode: 'en',
        TargetLanguageCode: 'es',
        TerminologyNames: [TERMINOLOGY_NAME],
        Text: sourceText,
      })
    );
    translatedText = result.TranslatedText ?? '';
    if (translatedText.trim() === '') {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'translation_empty_result',
          recordId,
          fieldName,
        })
      );
      return null;
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'translation_api_failed',
        recordId,
        fieldName,
        errorName: (error as Error).name,
        errorMessage: (error as Error).message,
      })
    );
    return null;
  }

  // 4. Conditional write — lose the race gracefully.
  try {
    await dynamoDb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: recordId },
        UpdateExpression: 'SET #f = :v',
        ConditionExpression: 'attribute_not_exists(#f) OR #f = :empty',
        ExpressionAttributeNames: { '#f': esField },
        ExpressionAttributeValues: {
          ':v': translatedText,
          ':empty': '',
        },
      })
    );
    return translatedText;
  } catch (error) {
    const errName = (error as Error).name;
    if (errName === 'ConditionalCheckFailedException') {
      // Another worker populated it first — return the stored value.
      console.log(
        JSON.stringify({
          level: 'info',
          msg: 'translation_conditional_check_lost',
          recordId,
          fieldName,
        })
      );
      try {
        const after = await dynamoDb.send(
          new GetCommand({
            TableName: tableName,
            Key: { id: recordId },
            ProjectionExpression: '#f',
            ExpressionAttributeNames: { '#f': esField },
          })
        );
        const winnerValue = after.Item?.[esField];
        if (typeof winnerValue === 'string' && winnerValue.trim() !== '') {
          return winnerValue;
        }
      } catch {
        // fall through
      }
      return null;
    }
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'translation_write_failed',
        recordId,
        fieldName,
        errorName: errName,
        errorMessage: (error as Error).message,
      })
    );
    return null;
  }
}

/** Result counters from translating one question. */
export interface TranslateQuestionResult {
  translated: number;
  skipped: number;
  failed: number;
  charactersSent: number;
}

/**
 * Translate every missing `_es` field on a question and its alternatives.
 *
 * Used by:
 *   - On-demand enqueue (fire-and-forget from Exam_Session_Service)
 *   - BatchTranslateFunction
 *
 * Reuses `translateField` so cache-read and conditional-write guards give
 * free idempotence: a second call on an already-translated question makes
 * zero TranslateText API calls.
 */
export async function translateQuestionIfNeeded(
  question: Question,
  alternatives: Alternative[]
): Promise<TranslateQuestionResult> {
  const result: TranslateQuestionResult = {
    translated: 0,
    skipped: 0,
    failed: 0,
    charactersSent: 0,
  };

  // Defensive: SOA/DEA bypass any iteration (Property 6).
  if (ENGLISH_ONLY_COURSES.has(question.courseCode)) {
    return result;
  }

  const fieldsToTranslate: Array<{
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
      sourceText: question.questionText,
      existingEs: question.questionText_es,
    },
    {
      recordId: question.id,
      tableName: env.questionsTable,
      fieldName: 'explanation',
      sourceText: question.explanation ?? '',
      existingEs: question.explanation_es,
    },
    {
      recordId: question.id,
      tableName: env.questionsTable,
      fieldName: 'incorrectExplanation',
      sourceText: question.incorrectExplanation ?? '',
      existingEs: question.incorrectExplanation_es,
    },
    ...alternatives.map((alt) => ({
      recordId: alt.id,
      tableName: env.alternativesTable,
      fieldName: 'text' as TranslatableField,
      sourceText: alt.text,
      existingEs: alt.text_es,
    })),
  ];

  for (const job of fieldsToTranslate) {
    // Skip empty-source fields (nothing to translate).
    if (!job.sourceText || job.sourceText.trim() === '') {
      result.skipped++;
      continue;
    }

    // Skip already-cached fields without even calling translateField
    // (avoids a DDB GetItem round-trip on the happy path for the batch).
    if (typeof job.existingEs === 'string' && job.existingEs.trim() !== '') {
      result.skipped++;
      continue;
    }

    const translated = await translateField({
      recordId: job.recordId,
      tableName: job.tableName,
      fieldName: job.fieldName,
      sourceText: job.sourceText,
      courseCode: question.courseCode,
    });

    if (translated === null) {
      result.failed++;
    } else {
      result.translated++;
      result.charactersSent += job.sourceText.length;
    }
  }

  return result;
}
