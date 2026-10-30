/**
 * Question Service
 * 
 * Handles CRUD operations for questions and alternatives.
 * Questions are associated with courses and can have multiple alternatives.
 * 
 * Updated: Fixed createdAt field type mismatch for DynamoDB GSI compatibility
 */

import { Question, Alternative, QuestionHistory } from '../models/types';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import {
  putItem,
  getItem,
  updateItem,
  deleteItem,
  queryItems,
  batchWriteItems,
  DatabaseError,
  ItemNotFoundError,
} from '../config/database';
import { validateCourseCode } from './courseService';
import { deleteImage } from './imageUploadService';

/**
 * QuestionWithAlternatives
 * 
 * Combined structure for creating/retrieving questions with their alternatives
 */
export interface QuestionWithAlternatives {
  question: Question;
  alternatives: Alternative[];
}

/**
 * Create a new question with its alternatives
 * 
 * @param courseCode - The course this question belongs to
 * @param questionText - The question text
 * @param questionType - Type of question (single or multiple correct answers)
 * @param alternatives - Array of alternatives (at least one correct, two incorrect)
 * @param createdBy - User ID of the assistant creating the question
 * @param imageUrl - Optional image URL for the question
 * @returns The created question with alternatives
 * @throws DatabaseError if course code is invalid or creation fails
 */
export async function createQuestion(
  courseCode: string,
  questionText: string,
  questionType: 'single' | 'multiple' | 'dropdown' | 'truefalse' | 'ordering',
  alternatives: Omit<Alternative, 'id' | 'questionId'>[],
  createdBy: string,
  imageUrl: string | null = null,
  explanation: string | null = null,
  extendedData: any = null,
  incorrectExplanation: string | null = null
): Promise<QuestionWithAlternatives> {
  // Validate course code exists
  const courseExists = await validateCourseCode(courseCode);
  if (!courseExists) {
    throw new DatabaseError(`Invalid course code: ${courseCode}`);
  }
  
  // Validation depends on question type
  if (questionType === 'single' || questionType === 'multiple') {
    // Traditional validation for single/multiple
    const correctAlternatives = alternatives.filter((alt) => alt.isCorrect);
    if (correctAlternatives.length === 0) {
      throw new DatabaseError('Question must have at least one correct alternative');
    }
    if (alternatives.length < 2) {
      throw new DatabaseError('Question must have at least two alternatives');
    }
    if (questionType === 'single' && correctAlternatives.length > 1) {
      throw new DatabaseError('Single answer questions must have exactly one correct alternative');
    }
    if (questionType === 'multiple' && correctAlternatives.length < 2) {
      throw new DatabaseError('Multiple answer questions must have at least two correct alternatives');
    }
  } else if (questionType === 'dropdown') {
    if (!extendedData?.dropdownStatements || extendedData.dropdownStatements.length < 1) {
      throw new DatabaseError('Dropdown questions must have at least one statement');
    }
  } else if (questionType === 'truefalse') {
    if (!extendedData?.trueFalseStatements || extendedData.trueFalseStatements.length < 1) {
      throw new DatabaseError('True/False questions must have at least one statement');
    }
  } else if (questionType === 'ordering') {
    if (!extendedData?.orderingItems || extendedData.orderingItems.length < 2) {
      throw new DatabaseError('Ordering questions must have at least two items');
    }
  }
  
  // Generate ID for the question
  const questionId = uuidv4();
  
  // Create the question object
  const question: Question = {
    id: questionId,
    courseCode,
    questionText,
    questionType,
    imageUrl,
    createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    explanation: explanation || null,
    incorrectExplanation: incorrectExplanation || null,
    extendedData: extendedData || null,
  };
  
  // Question is already in the correct format for DynamoDB storage
  const questionForStorage = question;
  
  // Store the question
  await putItem(env.questionsTable, questionForStorage);
  
  // Create and store alternatives with generated IDs
  const savedAlternatives: Alternative[] = alternatives.map((alt, index) => ({
    id: uuidv4(),
    questionId: questionId,
    text: alt.text,
    imageUrl: alt.imageUrl || null,
    isCorrect: alt.isCorrect,
    order: alt.order !== undefined ? alt.order : index,
  }));
  
  // Batch write alternatives
  await batchWriteItems(env.alternativesTable, savedAlternatives);
  
  return {
    question,
    alternatives: savedAlternatives,
  };
}

/**
 * Convert DynamoDB question item to proper Question object with Date objects
 */
function convertDynamoQuestionToQuestion(item: any): Question {
  return {
    ...item,
    createdAt: typeof item.createdAt === 'string' ? new Date(item.createdAt) : item.createdAt,
    updatedAt: typeof item.updatedAt === 'string' ? new Date(item.updatedAt) : item.updatedAt,
  };
}

/**
 * Get a question by ID with its alternatives
 * 
 * @param questionId - The ID of the question to retrieve
 * @returns The question with alternatives, or null if not found
 * @throws DatabaseError if retrieval fails
 */
export async function getQuestion(
  questionId: string
): Promise<QuestionWithAlternatives | null> {
  // Get the question
  const questionItem = await getItem<any>(env.questionsTable, { id: questionId });
  if (!questionItem) {
    return null;
  }
  
  // Convert to proper Question object
  const question = convertDynamoQuestionToQuestion(questionItem);
  
  // Get alternatives for this question
  const alternatives = await queryItems<Alternative>(
    env.alternativesTable,
    'questionId = :questionId',
    { ':questionId': questionId },
    'questionId-order-index' // Use the correct GSI for querying by questionId
  );
  
  // Sort alternatives by order
  alternatives.sort((a, b) => a.order - b.order);
  
  return {
    question,
    alternatives,
  };
}

/**
 * Update a question
 * 
 * Preserves the previous version in question history before updating.
 * 
 * @param questionId - The ID of the question to update
 * @param updates - Fields to update (questionText, imageUrl, correctAlternativeId, alternatives)
 * @returns The updated question with alternatives
 * @throws ItemNotFoundError if question doesn't exist
 * @throws DatabaseError if update fails
 */
export async function updateQuestion(
  questionId: string,
  updates: {
    questionText?: string;
    imageUrl?: string | null;
    correctAlternativeId?: string;
    explanation?: string | null;
    incorrectExplanation?: string | null;
    alternatives?: Array<{
      id: string;
      text?: string;
      imageUrl?: string | null;
      isCorrect?: boolean;
    }>;
  }
): Promise<QuestionWithAlternatives> {
  // Check if question exists
  const existing = await getQuestion(questionId);
  if (!existing) {
    throw new ItemNotFoundError('Question', questionId);
  }
  
  // Preserve current version in history before updating
  const historyRecord: QuestionHistory = {
    id: `${questionId}_v${existing.question.version}`,
    questionId: existing.question.id,
    version: existing.question.version,
    courseCode: existing.question.courseCode,
    questionText: existing.question.questionText,
    questionType: existing.question.questionType,
    imageUrl: existing.question.imageUrl,
    createdBy: existing.question.createdBy,
    createdAt: existing.question.createdAt,
    archivedAt: new Date().toISOString(),
    alternativesSnapshot: existing.alternatives,
  };
  
  // Convert dates to ISO strings for DynamoDB storage
  const historyForStorage = {
    ...historyRecord,
    createdAt: typeof historyRecord.createdAt === 'string' ? historyRecord.createdAt : (historyRecord.createdAt as Date).toISOString(),
    archivedAt: new Date().toISOString(),
  };
  
  // Store history record
  await putItem(env.questionHistoryTable, historyForStorage);
  
  // Update question fields
  const questionUpdates: Record<string, any> = {
    updatedAt: new Date().toISOString(),
    version: existing.question.version + 1,
  };
  
  if (updates.questionText !== undefined) {
    questionUpdates.questionText = updates.questionText;
    // Clear Spanish cache when English source changes (Req 4.4, Property 8)
    questionUpdates.questionText_es = null;
  }
  
  if (updates.imageUrl !== undefined) {
    questionUpdates.imageUrl = updates.imageUrl;
  }

  if (updates.explanation !== undefined) {
    questionUpdates.explanation = updates.explanation;
    // Clear Spanish cache when English source changes (Req 4.4, Property 8)
    questionUpdates.explanation_es = null;
  }

  if (updates.incorrectExplanation !== undefined) {
    questionUpdates.incorrectExplanation = updates.incorrectExplanation;
    // Clear Spanish cache when English source changes (Req 4.4, Property 8)
    questionUpdates.incorrectExplanation_es = null;
  }
  
  if ((updates as any).extendedData !== undefined) {
    questionUpdates.extendedData = (updates as any).extendedData;
  }
  
  const updatedQuestion = await updateItem<Question>(
    env.questionsTable,
    { id: questionId },
    questionUpdates
  );
  
  // Update alternatives if provided
  if (updates.alternatives) {
    for (const altUpdate of updates.alternatives) {
      const altUpdates: Record<string, any> = {};
      
      if (altUpdate.text !== undefined) {
        altUpdates.text = altUpdate.text;
        // Clear Spanish cache when English source changes (Req 4.4, Property 8)
        altUpdates.text_es = null;
      }
      
      if (altUpdate.imageUrl !== undefined) {
        altUpdates.imageUrl = altUpdate.imageUrl;
      }
      
      if (altUpdate.isCorrect !== undefined) {
        altUpdates.isCorrect = altUpdate.isCorrect;
      }
      
      if (Object.keys(altUpdates).length > 0) {
        await updateItem<Alternative>(
          env.alternativesTable,
          { id: altUpdate.id },
          altUpdates
        );
      }
    }
  }
  
  // If updating correct alternative (legacy support), update alternatives
  let alternatives = existing.alternatives;
  if (updates.correctAlternativeId) {
    // Set all alternatives to incorrect
    for (const alt of alternatives) {
      await updateItem<Alternative>(
        env.alternativesTable,
        { id: alt.id },
        { isCorrect: false }
      );
    }
    
    // Set the specified alternative to correct
    await updateItem<Alternative>(
      env.alternativesTable,
      { id: updates.correctAlternativeId },
      { isCorrect: true }
    );
  }
  
  // Refresh alternatives to get latest state
  const refreshed = await getQuestion(questionId);
  alternatives = refreshed!.alternatives;
  
  return {
    question: updatedQuestion,
    alternatives,
  };
}

/**
 * Delete a question and its alternatives
 * 
 * Also deletes associated images from S3 storage.
 * 
 * @param questionId - The ID of the question to delete
 * @returns true if deletion was successful
 * @throws ItemNotFoundError if question doesn't exist
 * @throws DatabaseError if deletion fails
 */
export async function deleteQuestion(questionId: string): Promise<boolean> {
  // Check if question exists
  const existing = await getQuestion(questionId);
  if (!existing) {
    throw new ItemNotFoundError('Question', questionId);
  }
  
  // Delete question image if it exists
  if (existing.question.imageUrl) {
    try {
      await deleteImage(existing.question.imageUrl);
    } catch (error) {
      console.error('Failed to delete question image:', error);
      // Continue with deletion even if image deletion fails
    }
  }
  
  // Delete all alternatives and their images
  for (const alt of existing.alternatives) {
    // Delete alternative image if it exists
    if (alt.imageUrl) {
      try {
        await deleteImage(alt.imageUrl);
      } catch (error) {
        console.error('Failed to delete alternative image:', error);
        // Continue with deletion even if image deletion fails
      }
    }
    
    // Delete alternative record
    await deleteItem(env.alternativesTable, { id: alt.id });
  }
  
  // Delete the question
  await deleteItem(env.questionsTable, { id: questionId });
  
  return true;
}

/**
 * Get all questions for a course
 * 
 * @param courseCode - The course code to filter by
 * @returns Array of questions with alternatives for the course
 * @throws DatabaseError if retrieval fails
 */
export async function getQuestionsByCourse(
  courseCode: string
): Promise<QuestionWithAlternatives[]> {
  try {
    console.log(`Getting questions for course: ${courseCode}`);
    
    // Query questions by course code
    const questionItems = await queryItems<any>(
      env.questionsTable,
      'courseCode = :courseCode',
      { ':courseCode': courseCode },
      'courseCode-createdAt-index' // Use the correct GSI name
    );
    
    console.log(`Found ${questionItems.length} questions for course ${courseCode}`);
    
    // Convert to proper Question objects
    const questions = questionItems.map(convertDynamoQuestionToQuestion);
    
    // Get alternatives for each question
    const questionsWithAlternatives: QuestionWithAlternatives[] = [];
    
    for (const question of questions) {
      console.log(`Getting alternatives for question: ${question.id}`);
      
      const alternatives = await queryItems<Alternative>(
        env.alternativesTable,
        'questionId = :questionId',
        { ':questionId': question.id },
        'questionId-order-index' // Use the correct GSI for querying by questionId
      );
      
      console.log(`Found ${alternatives.length} alternatives for question ${question.id}`);
      
      // Sort alternatives by order
      alternatives.sort((a, b) => a.order - b.order);
      
      questionsWithAlternatives.push({
        question,
        alternatives,
      });
    }
    
    console.log(`Returning ${questionsWithAlternatives.length} questions with alternatives`);
    return questionsWithAlternatives;
  } catch (error) {
    console.error(`Error in getQuestionsByCourse for course ${courseCode}:`, error);
    throw error;
  }
}

/**
 * Save a question with its alternatives (for backward compatibility with tests)
 * 
 * @param questionData - Question data without ID
 * @param alternatives - Array of alternatives without IDs
 * @returns The saved question with generated ID and alternatives
 */
export async function saveQuestion(
  questionData: Omit<Question, 'id'>,
  alternatives: Omit<Alternative, 'id' | 'questionId'>[]
): Promise<QuestionWithAlternatives> {
  return await createQuestion(
    questionData.courseCode,
    questionData.questionText,
    questionData.questionType,
    alternatives,
    questionData.createdBy,
    questionData.imageUrl
  );
}

/**
 * Get question history
 * 
 * Retrieves all historical versions of a question.
 * 
 * @param questionId - The ID of the question
 * @returns Array of historical versions, sorted by version (newest first)
 * @throws DatabaseError if retrieval fails
 */
export async function getQuestionHistory(
  questionId: string
): Promise<QuestionHistory[]> {
  // Query history records by questionId
  const history = await queryItems<QuestionHistory>(
    env.questionHistoryTable,
    'questionId = :questionId',
    { ':questionId': questionId },
    'QuestionIdIndex' // Assumes GSI named 'QuestionIdIndex' on questionId field
  );
  
  // Sort by version descending (newest first)
  history.sort((a, b) => b.version - a.version);
  
  return history;
}
