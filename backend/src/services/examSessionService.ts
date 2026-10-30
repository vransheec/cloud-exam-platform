/**
 * Exam Session Service
 * 
 * Handles CRUD operations for exam sessions.
 * Manages exam session lifecycle including creation, updates, and status tracking.
 */

import { ExamSession, Answer, ExamResult, SupportedLanguage, Question, Alternative } from '../models/types';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import {
  putItem,
  getItem,
  updateItem,
  queryItems,
  deleteItem,
  DatabaseError,
  ItemNotFoundError,
} from '../config/database';
import { validateCourseCode } from './courseService';
import { getQuestionsByCourse, QuestionWithAlternatives } from './questionService';
import {
  ENGLISH_ONLY_COURSES,
  translateField,
  TranslatableField,
} from './translationService';

/**
 * Per-field language resolution result for a single question's response payload.
 *
 * The `alternatives` map is keyed by alternative ID; each entry records whether
 * the `text` field was served in English or Spanish (or fell back to English
 * when the Spanish translation was missing).
 *
 * Feature: exam-spanish-translation
 * Validates: Property 2 (Language resolution and fallback)
 */
export interface FieldLanguages {
  questionText: SupportedLanguage;
  explanation?: SupportedLanguage;
  incorrectExplanation?: SupportedLanguage;
  alternatives: Record<string, { text: SupportedLanguage }>;
}

/**
 * A question + alternatives payload enriched with the per-field language map.
 * The response fields (`questionText`, `explanation`, `incorrectExplanation`,
 * alternative `text`) are already resolved to the student's selected language
 * with English fallback when the Spanish field is missing.
 */
export interface ResolvedQuestion {
  question: Question;
  alternatives: Alternative[];
  fieldLanguages: FieldLanguages;
}

/**
 * Resolve a single field against a target language.
 * Returns Spanish when language='es' AND the Spanish value is a non-empty
 * non-whitespace string; otherwise returns English.
 */
function resolveField(
  en: string | null | undefined,
  es: string | null | undefined,
  language: SupportedLanguage
): { value: string; lang: SupportedLanguage } {
  if (language === 'es' && typeof es === 'string' && es.trim() !== '') {
    return { value: es, lang: 'es' };
  }
  return { value: en ?? '', lang: 'en' };
}

/**
 * Resolve all translatable fields on a question + alternatives for the given
 * session language. The returned payload is safe to send to the frontend as-is:
 * the English `questionText`/`explanation`/etc. slots are overwritten with the
 * Spanish values (when available), and `fieldLanguages` tells the UI which
 * fields fell back to English so it can render the 🇺🇸 EN badge.
 *
 * English content in DynamoDB is NEVER modified by this function; the returned
 * Question/Alternative objects are new objects derived from the originals.
 *
 * Validates: Property 2 (Language resolution and fallback), Property 7
 * (English fields never modified by translation — this function does not write).
 */
export function resolveQuestionForLanguage(
  question: Question,
  alternatives: Alternative[],
  language: SupportedLanguage
): ResolvedQuestion {
  const qText = resolveField(question.questionText, question.questionText_es, language);
  const expl = resolveField(question.explanation ?? null, question.explanation_es, language);
  const incExpl = resolveField(
    question.incorrectExplanation ?? null,
    question.incorrectExplanation_es,
    language
  );

  const resolvedAlternatives: Alternative[] = alternatives.map((alt) => ({
    ...alt,
    text: resolveField(alt.text, alt.text_es, language).value,
  }));

  const altLanguages: Record<string, { text: SupportedLanguage }> = {};
  for (const alt of alternatives) {
    altLanguages[alt.id] = {
      text: resolveField(alt.text, alt.text_es, language).lang,
    };
  }

  return {
    question: {
      ...question,
      questionText: qText.value,
      explanation: expl.value || null,
      incorrectExplanation: incExpl.value || null,
    },
    alternatives: resolvedAlternatives,
    fieldLanguages: {
      questionText: qText.lang,
      explanation: expl.lang,
      incorrectExplanation: incExpl.lang,
      alternatives: altLanguages,
    },
  };
}

/**
 * Compute exactly the set of `_es` fields that are missing for a question and
 * its alternatives. Returns an empty array when:
 *   - `language` is not 'es'
 *   - the course is English-only (SOA/DEA)
 *   - all `_es` fields are already populated
 *
 * Used by `enqueueTranslation` to dispatch the minimum number of fire-and-forget
 * translation jobs.
 *
 * Validates: Property 3 (Enqueue set correctness)
 */
export function computeEnqueueJobs(
  question: Question,
  alternatives: Alternative[],
  language: SupportedLanguage
): Array<{
  recordId: string;
  tableName: string;
  fieldName: TranslatableField;
  sourceText: string;
}> {
  if (language !== 'es') return [];
  if (ENGLISH_ONLY_COURSES.has(question.courseCode)) return [];

  const jobs: Array<{
    recordId: string;
    tableName: string;
    fieldName: TranslatableField;
    sourceText: string;
  }> = [];

  const isMissing = (s: string | null | undefined) =>
    s === null || s === undefined || (typeof s === 'string' && s.trim() === '');

  if (!isMissing(question.questionText) && isMissing(question.questionText_es)) {
    jobs.push({
      recordId: question.id,
      tableName: env.questionsTable,
      fieldName: 'questionText',
      sourceText: question.questionText,
    });
  }
  if (!isMissing(question.explanation) && isMissing(question.explanation_es)) {
    jobs.push({
      recordId: question.id,
      tableName: env.questionsTable,
      fieldName: 'explanation',
      sourceText: question.explanation as string,
    });
  }
  if (
    !isMissing(question.incorrectExplanation) &&
    isMissing(question.incorrectExplanation_es)
  ) {
    jobs.push({
      recordId: question.id,
      tableName: env.questionsTable,
      fieldName: 'incorrectExplanation',
      sourceText: question.incorrectExplanation as string,
    });
  }

  for (const alt of alternatives) {
    if (!isMissing(alt.text) && isMissing(alt.text_es)) {
      jobs.push({
        recordId: alt.id,
        tableName: env.alternativesTable,
        fieldName: 'text',
        sourceText: alt.text,
      });
    }
  }

  return jobs;
}

/**
 * Fire-and-forget: enqueue translation for every missing `_es` field.
 * Uses `setImmediate` so the Lambda HTTP response is not blocked.
 */
function enqueueTranslation(
  question: Question,
  alternatives: Alternative[],
  language: SupportedLanguage
): void {
  const jobs = computeEnqueueJobs(question, alternatives, language);
  if (jobs.length === 0) return;

  setImmediate(async () => {
    for (const job of jobs) {
      try {
        await translateField({
          recordId: job.recordId,
          tableName: job.tableName,
          fieldName: job.fieldName,
          sourceText: job.sourceText,
          courseCode: question.courseCode,
        });
      } catch (err) {
        // translateField never throws; this is defense in depth.
        console.error('Unexpected error in enqueueTranslation:', (err as Error).message);
      }
    }
  });
}

/**
 * Start a new exam session
 * 
 * Checks for existing active session, loads questions for the course,
 * creates a new exam session record, and returns questions with alternatives.
 * Now supports limiting the number of questions based on course configuration.
 * 
 * @param studentId - The student's user ID
 * @param courseCode - The course code for the exam
 * @param language - Exam language ('en' default, or 'es' for Spanish)
 * @returns Object containing the session and questions with alternatives
 * @throws DatabaseError if course code is invalid, student has active session, or creation fails
 */
export async function startExam(
  studentId: string,
  courseCode: string,
  language: SupportedLanguage = 'en'
): Promise<{
  session: ExamSession;
  questions: QuestionWithAlternatives[];
  isTrial?: boolean;
  fieldLanguages?: Record<string, FieldLanguages>;
}> {
  // Validate language value (Req 3.4, Property 1).
  if (language !== 'en' && language !== 'es') {
    const err = new DatabaseError(`Invalid language: ${language}`);
    (err as any).httpStatus = 400;
    throw err;
  }

  // Enforce English-only courses (Req 2.3, 2.4, Property 1).
  if (language === 'es' && ENGLISH_ONLY_COURSES.has(courseCode)) {
    const err = new DatabaseError(
      'Este curso solo está disponible en inglés.'
    );
    (err as any).code = 'ENGLISH_ONLY_COURSE';
    (err as any).httpStatus = 400;
    throw err;
  }
  // Validate course code exists and get course details
  const courseExists = await validateCourseCode(courseCode);
  if (!courseExists) {
    throw new DatabaseError(`Invalid course code: ${courseCode}`);
  }
  
  // Get course details to check exam question count
  const { getCourse } = await import('./courseService');
  const course = await getCourse(courseCode);
  if (!course) {
    throw new DatabaseError(`Course not found: ${courseCode}`);
  }
  
  console.log(`Starting exam for student ${studentId}, course ${courseCode}`);
  
  // Clean up any old active sessions (older than 2 hours) before checking
  const cleanedUp = await cleanupOldActiveSessions(studentId);
  console.log(`Cleaned up ${cleanedUp} old active sessions`);
  
  // Check if student still has an active session after cleanup
  const activeSession = await getActiveSession(studentId);
  if (activeSession) {
    console.log(`Student ${studentId} still has active session ${activeSession.id} after cleanup`);
    console.log(`Active session details:`, {
      id: activeSession.id,
      startTime: activeSession.startTime,
      isActive: activeSession.isActive,
      status: activeSession.status,
      courseCode: activeSession.courseCode
    });
    
    // If the session is very recent (less than 5 minutes), allow it to be used
    const sessionStart = new Date(activeSession.startTime);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    if (sessionStart > fiveMinutesAgo && activeSession.status === 'in_progress') {
      console.log(`Recent active session found, allowing reuse`);
      // Return the existing session with questions (limited by course config)
      const allQuestions = await getQuestionsByCourse(activeSession.courseCode);
      
      // Get course to check examQuestionCount
      const sessionCourse = await getCourse(activeSession.courseCode);
      let examQuestions = allQuestions;
      if (sessionCourse && sessionCourse.examQuestionCount > 0 && sessionCourse.examQuestionCount < allQuestions.length) {
        // Note: For reused sessions, we can't guarantee the same random selection
        // This is a limitation - ideally we'd store the question IDs in the session
        examQuestions = allQuestions
          .sort(() => Math.random() - 0.5)
          .slice(0, sessionCourse.examQuestionCount);
      }
      
      return {
        session: activeSession,
        questions: examQuestions.map((q) => {
          const resolved = resolveQuestionForLanguage(q.question, q.alternatives, language);
          enqueueTranslation(q.question, q.alternatives, language);
          return { question: resolved.question, alternatives: resolved.alternatives };
        }),
      };
    } else {
      // Strict enforcement: Do not allow new sessions if any active session exists
      // This prevents multiple browser/device access
      throw new DatabaseError(
        `You have an active exam session. Please complete or cancel it before starting a new exam. ` +
        `If you believe this is an error, please contact your instructor. ` +
        `Session ID: ${activeSession.id.substring(0, 8)}...`
      );
    }
  }
  
  // Load all questions for the selected course
  const allQuestions = await getQuestionsByCourse(courseCode);
  
  if (allQuestions.length === 0) {
    throw new DatabaseError(`No questions available for course: ${courseCode}`);
  }
  
  // Check if this is a trial enrollment
  const { getEnrollments } = await import('./enrollmentService');
  const enrollments = await getEnrollments(studentId);
  const courseEnrollment = enrollments.find((e: any) => e.courseCode === courseCode);
  const isTrial = courseEnrollment?.enrollmentType === 'trial';
  
  // For trial: check max 2 attempts
  if (isTrial) {
    const { getExamHistory } = await import('./examSessionService');
    const history = await getExamHistory(studentId);
    const trialAttempts = history.filter((h: any) => h.courseCode === courseCode);
    if (trialAttempts.length >= 2) {
      throw new DatabaseError(
        'You have reached the maximum number of trial attempts (2). ' +
        'Contact us to purchase full access and unlock all questions.'
      );
    }
  }
  
  // Limit questions based on course configuration and trial status
  let examQuestions = allQuestions;
  console.log(`Course examQuestionCount: ${course.examQuestionCount}, Total questions: ${allQuestions.length}, isTrial: ${isTrial}`);
  
  if (isTrial) {
    // Trial: pick 10 questions from the first 15 in the bank (sorted by createdAt)
    const TRIAL_POOL_SIZE = 15;
    const TRIAL_QUESTION_COUNT = 10;
    const sortedQuestions = [...allQuestions].sort((a, b) => 
      String(a.question.createdAt || '').localeCompare(String(b.question.createdAt || ''))
    );
    const trialPool = sortedQuestions.slice(0, Math.min(TRIAL_POOL_SIZE, sortedQuestions.length));
    examQuestions = trialPool
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(TRIAL_QUESTION_COUNT, trialPool.length));
    console.log(`Trial mode: ${examQuestions.length} questions from pool of ${trialPool.length}`);
  } else if (course.examQuestionCount > 0 && course.examQuestionCount < allQuestions.length) {
    // Randomly select the specified number of questions
    examQuestions = allQuestions
      .sort(() => Math.random() - 0.5) // Shuffle array
      .slice(0, course.examQuestionCount); // Take first N questions
    console.log(`Limited to ${examQuestions.length} questions`);
  } else {
    console.log(`Using all ${allQuestions.length} questions (examQuestionCount: ${course.examQuestionCount})`);
  }
  
  // Create new exam session object
  const examSession: ExamSession = {
    id: uuidv4(),
    studentId,
    courseCode,
    startTime: new Date().toISOString(),
    endTime: null,
    isActive: 'true', // Store as string for DynamoDB GSI compatibility
    status: 'in_progress',
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    questionIds: examQuestions.map(q => q.question.id),
    language,
  };
  
  // Store exam session in database
  await putItem(env.examSessionsTable, examSession);

  // Resolve each question for the selected language and collect the fieldLanguages map.
  // For English sessions, this is a pass-through that still builds the map.
  const fieldLanguages: Record<string, FieldLanguages> = {};
  const resolvedQuestions: QuestionWithAlternatives[] = examQuestions.map((q) => {
    const resolved = resolveQuestionForLanguage(q.question, q.alternatives, language);
    fieldLanguages[q.question.id] = resolved.fieldLanguages;
    // Fire-and-forget translation for any missing Spanish fields (Req 7.1, 7.2).
    enqueueTranslation(q.question, q.alternatives, language);
    return { question: resolved.question, alternatives: resolved.alternatives };
  });

  return {
    session: examSession,
    questions: resolvedQuestions,
    isTrial,
    fieldLanguages,
  };
}

/**
 * Get an exam session by ID
 * 
 * @param sessionId - The exam session ID
 * @returns The exam session object or null if not found
 * @throws DatabaseError if retrieval fails
 */
export async function getExamSession(sessionId: string): Promise<ExamSession | null> {
  return await getItem<ExamSession>(env.examSessionsTable, { id: sessionId });
}

/**
 * Get the active exam session for a student
 * 
 * @param studentId - The student's user ID
 * @returns The active exam session or null if none exists
 * @throws DatabaseError if retrieval fails
 */
export async function getActiveSession(studentId: string): Promise<ExamSession | null> {
  // Query for active sessions for this student
  const sessions = await queryItems<ExamSession>(
    env.examSessionsTable,
    'studentId = :studentId',
    { ':studentId': studentId },
    'studentId-startTime-index' // Use the correct GSI name from database template
  );
  
  console.log(`getActiveSession: Found ${sessions.length} sessions for student ${studentId}`);
  
  // Filter for active sessions (handle both boolean and string values for backward compatibility)
  const activeSessions = sessions.filter((session) => {
    const isActive = session.isActive === 'true' || session.isActive === true;
    if (isActive) {
      console.log(`getActiveSession: Active session found:`, {
        id: session.id,
        startTime: session.startTime,
        isActive: session.isActive,
        status: session.status,
        courseCode: session.courseCode
      });
    }
    return isActive;
  });
  
  console.log(`getActiveSession: Found ${activeSessions.length} active sessions`);
  
  return activeSessions.length > 0 ? activeSessions[0] : null;
}

/**
 * Update session activity timestamp to detect multiple browser usage
 * 
 * @param sessionId - The exam session ID
 * @returns Updated session
 * @throws DatabaseError if session doesn't exist or update fails
 */
export async function updateSessionActivity(sessionId: string): Promise<ExamSession> {
  const session = await getExamSession(sessionId);
  if (!session) {
    throw new ItemNotFoundError('ExamSession', sessionId);
  }
  
  return await updateSession(sessionId, {
    lastActivity: new Date().toISOString(),
  });
}

/**
 * Submit an answer for a question in an exam session
 * 
 * Records the student's selected alternative(s) for a specific question.
 * Supports both single and multiple selection questions.
 * If an answer already exists for this question in the session, it updates it.
 * 
 * @param sessionId - The exam session ID
 * @param questionId - The question ID being answered
 * @param selectedAlternativeIds - Array of alternative IDs the student selected
 * @returns The created or updated answer object
 * @throws DatabaseError if session doesn't exist, is not active, or submission fails
 */
export async function submitAnswer(
  sessionId: string,
  questionId: string,
  selectedAlternativeIds: string[]
): Promise<Answer> {
  // Validate session exists and is active
  const session = await getExamSession(sessionId);
  if (!session) {
    throw new ItemNotFoundError('ExamSession', sessionId);
  }
  
  if (!(session.isActive === 'true' || session.isActive === true) || session.status !== 'in_progress') {
    throw new DatabaseError('Cannot submit answer to inactive or completed exam session');
  }
  
  // Update session activity to track usage
  await updateSessionActivity(sessionId);
  
  // Check if answer already exists for this question in this session
  const existingAnswers = await queryItems<Answer>(
    env.answersTable,
    'sessionId = :sessionId',
    { ':sessionId': sessionId },
    'sessionId-questionId-index'
  );
  
  const existingAnswer = existingAnswers.find((ans) => ans.questionId === questionId);
  
  // Get the question to check question type and validate alternatives
  const { getQuestion } = await import('./questionService');
  const questionData = await getQuestion(questionId);
  
  if (!questionData) {
    throw new ItemNotFoundError('Question', questionId);
  }
  
  // Validate selection count based on question type
  if (questionData.question.questionType === 'single' && selectedAlternativeIds.length > 1) {
    throw new DatabaseError('Single answer questions can only have one selection');
  }
  
  // For new question types (dropdown, truefalse, ordering), the answer is sent as JSON in the first element
  // Skip alternative validation for these types
  const isNewType = ['dropdown', 'truefalse', 'ordering'].includes(questionData.question.questionType);
  
  if (!isNewType) {
    // Validate selected alternatives belong to this question
    const validAlternativeIds = questionData.alternatives.map(alt => alt.id);
    const invalidSelections = selectedAlternativeIds.filter(id => !validAlternativeIds.includes(id));
    if (invalidSelections.length > 0) {
      throw new DatabaseError('Selected alternatives do not belong to this question');
    }
  }
  
  // Calculate if answer is correct
  const isCorrect = calculateAnswerCorrectness(questionData, selectedAlternativeIds);
  
  // For backward compatibility, store first selection as selectedAlternativeId
  const primarySelection = selectedAlternativeIds.length > 0 ? selectedAlternativeIds[0] : '';
  
  if (existingAnswer) {
    // Update existing answer
    const updatedAnswer = await updateItem<Answer>(
      env.answersTable,
      { id: existingAnswer.id },
      {
        selectedAlternativeId: primarySelection,
        selectedAlternativeIds: selectedAlternativeIds,
        isCorrect: isCorrect,
        answeredAt: new Date().toISOString(),
      }
    );
    return updatedAnswer;
  } else {
    // Create new answer
    const answer: Answer = {
      id: uuidv4(),
      sessionId,
      questionId,
      selectedAlternativeId: primarySelection,
      selectedAlternativeIds: selectedAlternativeIds,
      isCorrect: isCorrect,
      answeredAt: new Date().toISOString(),
    };
    
    await putItem(env.answersTable, answer);
    return answer;
  }
}

/**
 * Calculate if an answer is correct based on question type and selections
 * 
 * @param questionData - The question with alternatives
 * @param selectedAlternativeIds - Array of selected alternative IDs
 * @returns true if answer is correct, false otherwise
 */
function calculateAnswerCorrectness(
  questionData: QuestionWithAlternatives,
  selectedAlternativeIds: string[]
): boolean {
  const questionType = questionData.question.questionType;
  
  if (questionType === 'single') {
    const correctAlternatives = questionData.alternatives.filter(alt => alt.isCorrect);
    const correctAlternativeIds = correctAlternatives.map(alt => alt.id);
    return selectedAlternativeIds.length === 1 && 
           correctAlternativeIds.includes(selectedAlternativeIds[0]);
  } else if (questionType === 'multiple') {
    const correctAlternatives = questionData.alternatives.filter(alt => alt.isCorrect);
    const correctAlternativeIds = correctAlternatives.map(alt => alt.id);
    const selectedSet = new Set(selectedAlternativeIds);
    const correctSet = new Set(correctAlternativeIds);
    return selectedSet.size === correctSet.size && 
           [...selectedSet].every(id => correctSet.has(id));
  } else if (questionType === 'dropdown' || questionType === 'truefalse' || questionType === 'ordering') {
    // For new question types, the answer is stored as a JSON string in the first selectedAlternativeId
    // The frontend sends the answer as JSON; backend validates against extendedData
    try {
      const extData = questionData.question.extendedData;
      if (!extData) return false;
      
      const studentAnswer = selectedAlternativeIds.length > 0 ? JSON.parse(selectedAlternativeIds[0]) : null;
      if (!studentAnswer) return false;
      
      if (questionType === 'dropdown' && extData.dropdownStatements) {
        // studentAnswer is an array of selected options, one per statement
        return extData.dropdownStatements.every((stmt: any, i: number) => 
          studentAnswer[i] === stmt.correctOption
        );
      } else if (questionType === 'truefalse' && extData.trueFalseStatements) {
        // studentAnswer is an array of booleans
        return extData.trueFalseStatements.every((stmt: any, i: number) => 
          studentAnswer[i] === stmt.isTrue
        );
      } else if (questionType === 'ordering' && extData.orderingItems) {
        // studentAnswer is an array of item texts in the order the student placed them
        // Only items with correctPosition >= 0 should be selected, in the right order
        const correctItems = extData.orderingItems
          .filter((item: any) => item.correctPosition >= 0)
          .sort((a: any, b: any) => a.correctPosition - b.correctPosition)
          .map((item: any) => item.text);
        
        if (studentAnswer.length !== correctItems.length) return false;
        return correctItems.every((text: string, i: number) => studentAnswer[i] === text);
      }
    } catch {
      return false;
    }
    return false;
  }
  
  return false;
}

/**
 * Get all answers for an exam session
 * 
 * @param sessionId - The exam session ID
 * @returns Array of answers for the session
 * @throws DatabaseError if retrieval fails
 */
export async function getSessionAnswers(sessionId: string): Promise<Answer[]> {
  return await queryItems<Answer>(
    env.answersTable,
    'sessionId = :sessionId',
    { ':sessionId': sessionId },
    'sessionId-questionId-index'
  );
}

/**
 * Update an exam session
 * 
 * @param sessionId - The exam session ID to update
 * @param updates - Fields to update
 * @returns The updated exam session object
 * @throws ItemNotFoundError if session doesn't exist
 * @throws DatabaseError if update fails
 */
export async function updateSession(
  sessionId: string,
  updates: Partial<Omit<ExamSession, 'id' | 'createdAt'>>
): Promise<ExamSession> {
  // Check if session exists
  const existing = await getExamSession(sessionId);
  if (!existing) {
    throw new ItemNotFoundError('ExamSession', sessionId);
  }
  
  // Update session in database
  return await updateItem<ExamSession>(
    env.examSessionsTable,
    { id: sessionId },
    updates
  );
}

/**
 * Complete an exam session and calculate score
 * 
 * Calculates the score, marks the session as completed, returns all correct answers,
 * and stores the exam result with timestamp. Now uses course-specific passing percentage.
 * 
 * @param sessionId - The exam session ID to complete
 * @returns Object containing the exam result and all answers with correct answer info
 * @throws ItemNotFoundError if session doesn't exist
 * @throws DatabaseError if completion fails
 */
export async function completeExam(
  sessionId: string
): Promise<{
  result: ExamResult;
  answers: Array<{
    questionId: string;
    selectedAlternativeIds: string[];
    isCorrect: boolean;
    correctAlternativeIds: string[];
    explanation?: string | null;
    incorrectExplanation?: string | null;
    isUnscored: boolean;
  }>;
  isTrial?: boolean;
}> {
  // Get the session
  const session = await getExamSession(sessionId);
  if (!session) {
    throw new ItemNotFoundError('ExamSession', sessionId);
  }
  
  if (session.status !== 'in_progress') {
    throw new DatabaseError('Cannot complete exam that is not in progress');
  }
  
  // Get course details for passing percentage
  const { getCourse } = await import('./courseService');
  const course = await getCourse(session.courseCode);
  if (!course) {
    throw new DatabaseError(`Course not found: ${session.courseCode}`);
  }
  
  // Get all answers for this session
  const answers = await getSessionAnswers(sessionId);
  
  // Get questions for this exam session
  // Use questionIds from session if available (new sessions), otherwise fall back to course questions
  const allCourseQuestions = await getQuestionsByCourse(session.courseCode);
  let questions: QuestionWithAlternatives[];
  
  if (session.questionIds && session.questionIds.length > 0) {
    // New sessions: use only the questions that were assigned to this exam
    const questionIdSet = new Set(session.questionIds);
    questions = allCourseQuestions.filter(q => questionIdSet.has(q.question.id));
    console.log(`Using ${questions.length} questions from session questionIds (out of ${allCourseQuestions.length} in bank)`);
  } else {
    // Legacy sessions without questionIds: fall back to using answered questions + course config
    // Use examQuestionCount from course to determine the correct total
    if (course.examQuestionCount > 0 && course.examQuestionCount < allCourseQuestions.length) {
      // The exam was limited - only count the questions the student actually saw
      // We can infer this from the number of answers (answered + unanswered = examQuestionCount)
      questions = allCourseQuestions;
      // Override the total to use examQuestionCount
      console.log(`Legacy session: using examQuestionCount ${course.examQuestionCount} as total (bank has ${allCourseQuestions.length})`);
    } else {
      questions = allCourseQuestions;
      console.log(`Legacy session: using all ${allCourseQuestions.length} questions`);
    }
  }
  
  // Determine if this is a trial enrollment
  const { getEnrollments: getEnrollmentsForCheck } = await import('./enrollmentService');
  const checkEnrollments = await getEnrollmentsForCheck(session.studentId);
  const checkCourseEnrollment = checkEnrollments.find((e: any) => e.courseCode === session.courseCode);
  const isTrial = checkCourseEnrollment?.enrollmentType === 'trial';

  // Determine unscored questions count (no unscored questions for trial exams)
  const unscoredCount = isTrial ? 0 : (course.unscoredQuestions || 0);
  
  // Build answer details with correct answers for review
  // For new sessions: questions already contains only exam questions
  // For legacy sessions: filter to only include questions the student answered + fill up to examQuestionCount
  let reviewQuestions = questions;
  if (!session.questionIds || session.questionIds.length === 0) {
    // Legacy: only include questions the student actually answered
    const answeredQuestionIds = new Set(answers.map(a => a.questionId));
    reviewQuestions = questions.filter(q => answeredQuestionIds.has(q.question.id));
  }
  
  const answerDetails = reviewQuestions.map((q) => {
    const studentAnswer = answers.find((ans) => ans.questionId === q.question.id);
    const correctAlternatives = q.alternatives.filter((alt) => alt.isCorrect);
    
    return {
      questionId: q.question.id,
      selectedAlternativeIds: studentAnswer?.selectedAlternativeIds || [],
      isCorrect: studentAnswer?.isCorrect || false,
      correctAlternativeIds: correctAlternatives.map(alt => alt.id),
      explanation: q.question.explanation || null,
      incorrectExplanation: q.question.incorrectExplanation || null,
      isUnscored: false, // will be set below
    };
  });
  
  // Randomly select unscored questions from the answered questions
  let unscoredQuestionIds = new Set<string>();
  if (unscoredCount > 0 && unscoredCount < answerDetails.length) {
    // Shuffle indices and pick first N as unscored
    const indices = answerDetails.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const unscoredIndices = indices.slice(0, unscoredCount);
    for (const idx of unscoredIndices) {
      answerDetails[idx].isUnscored = true;
      unscoredQuestionIds.add(answerDetails[idx].questionId);
    }
  }
  
  // Calculate score excluding unscored questions
  const scoredAnswers = answers.filter((ans) => !unscoredQuestionIds.has(ans.questionId));
  const correctAnswersCount = scoredAnswers.filter((ans) => ans.isCorrect).length;
  
  // Determine total scored questions
  let totalScoredQuestions: number;
  if (session.questionIds && session.questionIds.length > 0) {
    // New sessions: use the actual number of assigned questions
    totalScoredQuestions = questions.length - unscoredCount;
  } else {
    // Legacy sessions: use examQuestionCount from course config if available
    const examTotal = (course.examQuestionCount > 0 && course.examQuestionCount < questions.length)
      ? course.examQuestionCount
      : questions.length;
    totalScoredQuestions = examTotal - unscoredCount;
  }
  
  // Mark session as completed
  await updateSession(sessionId, {
    endTime: new Date().toISOString(),
    isActive: 'false',
    status: 'completed',
  });
  
  // Create exam result record
  const examResult: ExamResult = {
    id: uuidv4(),
    sessionId,
    studentId: session.studentId,
    courseCode: session.courseCode,
    score: correctAnswersCount,
    totalQuestions: totalScoredQuestions,
    completedAt: new Date().toISOString(),
  };
  
  // Store exam result
  await putItem(env.examResultsTable, examResult);
  
  return {
    result: examResult,
    answers: answerDetails,
    isTrial,
  };
}

/**
 * Complete an exam session (legacy function for backward compatibility)
 * 
 * @param sessionId - The exam session ID to complete
 * @returns The updated exam session object
 * @throws ItemNotFoundError if session doesn't exist
 * @throws DatabaseError if update fails
 */
export async function completeExamSession(sessionId: string): Promise<ExamSession> {
  return await updateSession(sessionId, {
    endTime: new Date().toISOString(),
    isActive: 'false',
    status: 'completed',
  });
}

/**
 * Mark an exam session as failed and clear all answers
 * 
 * Marks the session as failed, clears all answers from the failed session,
 * and allows the student to restart the exam.
 * 
 * @param sessionId - The exam session ID to mark as failed
 * @returns The updated exam session object
 * @throws ItemNotFoundError if session doesn't exist
 * @throws DatabaseError if update fails
 */
export async function failExamSession(sessionId: string): Promise<ExamSession> {
  // Get all answers for this session
  const answers = await getSessionAnswers(sessionId);
  
  // Delete all answers from the failed session
  for (const answer of answers) {
    await deleteItem(env.answersTable, { id: answer.id });
  }
  
  // Mark session as failed
  return await updateSession(sessionId, {
    endTime: new Date().toISOString(),
    isActive: 'false',
    status: 'failed',
  });
}

/**
 * Restart an exam after failure
 * 
 * Creates a new exam session for the student after a previous session failed.
 * This is a convenience function that wraps startExam.
 * 
 * @param studentId - The student's user ID
 * @param courseCode - The course code for the exam
 * @returns Object containing the new session and questions
 * @throws DatabaseError if restart fails
 */
export async function restartExam(
  studentId: string,
  courseCode: string,
  language: SupportedLanguage = 'en'
): Promise<{ session: ExamSession; questions: QuestionWithAlternatives[] }> {
  // Simply start a new exam (startExam already checks for active sessions)
  return await startExam(studentId, courseCode, language);
}

/**
 * Get all exam sessions for a student
 * 
 * By default, excludes failed sessions from the history.
 * 
 * @param studentId - The student's user ID
 * @param includeFailedSessions - Whether to include failed sessions (default: false)
 * @returns Array of exam sessions for the student
 * @throws DatabaseError if retrieval fails
 */
export async function getStudentExamSessions(
  studentId: string,
  includeFailedSessions: boolean = false
): Promise<ExamSession[]> {
  const sessions = await queryItems<ExamSession>(
    env.examSessionsTable,
    'studentId = :studentId',
    { ':studentId': studentId },
    'studentId-startTime-index' // Use the correct GSI name from database template
  );
  
  // Filter out failed sessions if requested
  if (!includeFailedSessions) {
    return sessions.filter((session) => session.status !== 'failed');
  }
  
  return sessions;
}

/**
 * Clean up old active sessions for a student
 * 
 * Marks any sessions that are still marked as active but are older than 2 hours as failed.
 * This helps resolve issues where sessions weren't properly closed.
 * 
 * @param studentId - The student's user ID
 * @returns Number of sessions cleaned up
 * @throws DatabaseError if cleanup fails
 */
export async function cleanupOldActiveSessions(studentId: string): Promise<number> {
  const sessions = await queryItems<ExamSession>(
    env.examSessionsTable,
    'studentId = :studentId',
    { ':studentId': studentId },
    'studentId-startTime-index'
  );
  
  console.log(`Found ${sessions.length} total sessions for student ${studentId}`);
  
  // Find sessions that are marked as active but are older than 2 hours (reduced from 24 hours)
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  
  const activeSessions = sessions.filter((session) => {
    const isActive = session.isActive === 'true' || session.isActive === true;
    return isActive;
  });
  
  console.log(`Found ${activeSessions.length} active sessions for student ${studentId}`);
  
  const oldActiveSessions = activeSessions.filter((session) => {
    const sessionStart = new Date(session.startTime);
    const isOld = sessionStart < twoHoursAgo;
    console.log(`Session ${session.id}: started ${sessionStart.toISOString()}, isOld: ${isOld}, status: ${session.status}`);
    return isOld;
  });
  
  console.log(`Found ${oldActiveSessions.length} old active sessions to clean up`);
  
  // Mark old active sessions as failed
  for (const session of oldActiveSessions) {
    console.log(`Cleaning up session ${session.id}`);
    await updateSession(session.id, {
      endTime: new Date().toISOString(),
      isActive: 'false',
      status: 'failed',
    });
  }
  
  return oldActiveSessions.length;
}

/**
 * Force cleanup all active sessions for a student (emergency cleanup)
 * 
 * Marks ALL active sessions for a student as failed, regardless of age.
 * This is a more aggressive cleanup for when students are stuck.
 * 
 * @param studentId - The student's user ID
 * @returns Number of sessions cleaned up
 * @throws DatabaseError if cleanup fails
 */
export async function forceCleanupActiveSessions(studentId: string): Promise<number> {
  const sessions = await queryItems<ExamSession>(
    env.examSessionsTable,
    'studentId = :studentId',
    { ':studentId': studentId },
    'studentId-startTime-index'
  );
  
  console.log(`Force cleanup: Found ${sessions.length} total sessions for student ${studentId}`);
  
  // Find ALL sessions that are marked as active
  const activeSessions = sessions.filter((session) => {
    const isActive = session.isActive === 'true' || session.isActive === true;
    if (isActive) {
      console.log(`Force cleanup: Active session ${session.id}, status: ${session.status}, startTime: ${session.startTime}`);
    }
    return isActive;
  });
  
  console.log(`Force cleanup: Found ${activeSessions.length} active sessions to clean up`);
  
  // Mark ALL active sessions as failed
  for (const session of activeSessions) {
    console.log(`Force cleanup: Cleaning up session ${session.id}`);
    await updateSession(session.id, {
      endTime: new Date().toISOString(),
      isActive: 'false',
      status: 'failed',
    });
  }
  
  return activeSessions.length;
}

/**
 * Get exam history (results) for a student
 * 
 * Returns all completed exam results, excluding failed sessions.
 * 
 * @param studentId - The student's user ID
 * @returns Array of exam results for the student
 * @throws DatabaseError if retrieval fails
 */
export async function getExamHistory(studentId: string): Promise<ExamResult[]> {
  const results = await queryItems<ExamResult>(
    env.examResultsTable,
    'studentId = :studentId',
    { ':studentId': studentId },
    'studentId-completedAt-index' // Use the correct GSI name from database template
  );
  
  // Sort by completion date descending (newest first)
  results.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  
  return results;
}
