/**
 * Property-Based Tests for Question Service
 * 
 * Tests the round-trip preservation of question data using fast-check.
 * Feature: cloud-exam-platform, Property 6: Question data round-trip preservation
 * Validates: Requirements 2.3, 6.1
 */

// Set up test environment variables before importing modules
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.JWT_EXPIRATION = '1h';
process.env.AWS_REGION = 'us-east-1';
process.env.DYNAMODB_TABLE_PREFIX = 'test';

import * as fc from 'fast-check';
import {
  saveQuestion,
  getQuestion,
  QuestionWithAlternatives
} from './questionService';
import * as database from '../config/database';

// Mock the database module
jest.mock('../config/database');
const mockPutItem = database.putItem as jest.MockedFunction<typeof database.putItem>;
const mockGetItem = database.getItem as jest.MockedFunction<typeof database.getItem>;
const mockQueryItems = database.queryItems as jest.MockedFunction<typeof database.queryItems>;
const mockBatchWriteItems = database.batchWriteItems as jest.MockedFunction<typeof database.batchWriteItems>;
const mockUpdateItem = database.updateItem as jest.MockedFunction<typeof database.updateItem>;

/**
 * Supported course codes for validation
 */
const SUPPORTED_COURSE_CODES = [
  'CLF', 'DVA', 'SAA', 'DEA', 'SOA',  // AWS
  'AZ900', 'AZ104', 'AZ204',           // Azure
  'GCDL', 'GCE'                        // GCP
];

/**
 * Generator for valid course codes
 */
const courseCodeArbitrary = fc.constantFrom(...SUPPORTED_COURSE_CODES);

/**
 * Generator for valid question text (non-empty string)
 */
const questionTextArbitrary = fc.string({ minLength: 1, maxLength: 500 });

/**
 * Generator for optional image URLs
 */
const imageUrlArbitrary = fc.option(
  fc.webUrl(),
  { nil: null }
);

/**
 * Generator for user IDs (UUIDs)
 */
const userIdArbitrary = fc.uuid();

/**
 * Generator for timestamps
 */
const timestampArbitrary = fc.date();

/**
 * Generator for version numbers
 */
const versionArbitrary = fc.nat({ max: 100 });

/**
 * Generator for alternative text (non-empty string)
 */
const alternativeTextArbitrary = fc.string({ minLength: 1, maxLength: 200 });

/**
 * Generator for an array of alternatives
 * Supports two common patterns:
 * 1. Single correct answer: 5 alternatives with 1 correct
 * 2. Multiple correct answers: 6-8 alternatives with 2-3 correct
 */
const alternativesArbitrary = fc.oneof(
  // Pattern 1: Single correct answer (5 alternatives, 1 correct)
  fc.tuple(
    fc.record({
      text: alternativeTextArbitrary,
      imageUrl: imageUrlArbitrary,
      isCorrect: fc.constant(true),
      order: fc.nat({ max: 10 })
    }),
    fc.array(
      fc.record({
        text: alternativeTextArbitrary,
        imageUrl: imageUrlArbitrary,
        isCorrect: fc.constant(false),
        order: fc.nat({ max: 10 })
      }),
      { minLength: 4, maxLength: 4 } // Exactly 4 incorrect
    )
  ).map(([correct, incorrects]) => [correct, ...incorrects]),
  
  // Pattern 2: Multiple correct answers (6-8 alternatives, 2-3 correct)
  fc.tuple(
    fc.array(
      fc.record({
        text: alternativeTextArbitrary,
        imageUrl: imageUrlArbitrary,
        isCorrect: fc.constant(true),
        order: fc.nat({ max: 10 })
      }),
      { minLength: 2, maxLength: 3 } // 2-3 correct
    ),
    fc.array(
      fc.record({
        text: alternativeTextArbitrary,
        imageUrl: imageUrlArbitrary,
        isCorrect: fc.constant(false),
        order: fc.nat({ max: 10 })
      }),
      { minLength: 4, maxLength: 5 } // 4-5 incorrect
    )
  ).map(([corrects, incorrects]) => [...corrects, ...incorrects])
);

/**
 * Generator for question data (without ID)
 */
const questionDataArbitrary = fc.record({
  courseCode: courseCodeArbitrary,
  questionText: questionTextArbitrary,
  imageUrl: imageUrlArbitrary,
  createdBy: userIdArbitrary,
  createdAt: timestampArbitrary,
  updatedAt: timestampArbitrary,
  version: versionArbitrary
});

/**
 * Helper function to check if two questions are equivalent
 */
function questionsAreEquivalent(
  original: QuestionWithAlternatives,
  retrieved: QuestionWithAlternatives
): boolean {
  const q1 = original.question;
  const q2 = retrieved.question;
  
  // Check question fields (excluding ID which is generated)
  const questionMatch = 
    q1.courseCode === q2.courseCode &&
    q1.questionText === q2.questionText &&
    q1.imageUrl === q2.imageUrl &&
    q1.createdBy === q2.createdBy &&
    q1.createdAt.getTime() === q2.createdAt.getTime() &&
    q1.updatedAt.getTime() === q2.updatedAt.getTime() &&
    q1.version === q2.version;
  
  if (!questionMatch) {
    return false;
  }
  
  // Check alternatives count
  if (original.alternatives.length !== retrieved.alternatives.length) {
    return false;
  }
  
  // Sort alternatives by order for comparison
  const sortedOriginal = [...original.alternatives].sort((a, b) => a.order - b.order);
  const sortedRetrieved = [...retrieved.alternatives].sort((a, b) => a.order - b.order);
  
  // Check each alternative (excluding IDs which are generated)
  for (let i = 0; i < sortedOriginal.length; i++) {
    const alt1 = sortedOriginal[i];
    const alt2 = sortedRetrieved[i];
    
    if (
      alt1.text !== alt2.text ||
      alt1.imageUrl !== alt2.imageUrl ||
      alt1.isCorrect !== alt2.isCorrect ||
      alt1.order !== alt2.order
    ) {
      return false;
    }
  }
  
  return true;
}

describe('Question Service - Property-Based Tests', () => {
  // Store saved questions for retrieval - use object to maintain reference
  const storage = { questions: new Map<string, any>() };
  
  beforeEach(() => {
    // DON'T clear mocks - it resets the implementations
    // jest.clearAllMocks();
    // Clear the map but keep the same reference
    storage.questions.clear();
    
    // Mock course validation to always succeed
    mockGetItem.mockImplementation(async (tableName: string, key: any) => {
      if (tableName.includes('courses')) {
        return {
          code: key.code,
          name: 'Test Course',
          provider: 'AWS',
          description: 'Test course description'
        };
      }
      if (tableName.includes('questions')) {
        return storage.questions.get(key.id) || null;
      }
      return null;
    });
    
    // Mock database put operations
    mockPutItem.mockImplementation(async (tableName: string, item: any) => {
      if (tableName.includes('question-history')) {
        // Store question history (we don't need to retrieve it in these tests)
        return item;
      } else if (tableName.includes('questions')) {
        storage.questions.set(item.id, item);
      } else if (tableName.includes('alternatives')) {
        // Store alternatives by questionId
        const questionAlts = storage.questions.get(`alts_${item.questionId}`) || [];
        questionAlts.push(item);
        storage.questions.set(`alts_${item.questionId}`, questionAlts);
      }
      return item;
    });
    
    // Mock batch write operations for alternatives
    mockBatchWriteItems.mockImplementation(async (tableName: string, items: any[]) => {
      if (tableName.includes('alternatives')) {
        for (const item of items) {
          const questionAlts = storage.questions.get(`alts_${item.questionId}`) || [];
          questionAlts.push(item);
          storage.questions.set(`alts_${item.questionId}`, questionAlts);
        }
      }
      return true;
    });
    
    // Mock query operations for alternatives
    // queryItems signature: (tableName, keyConditionExpression, expressionAttributeValues, indexName?, expressionAttributeNames?)
    mockQueryItems.mockImplementation(async (
      tableName: string,
      _keyConditionExpression: string,
      expressionAttributeValues: any
    ) => {
      if (tableName.includes('alternatives')) {
        const questionId = expressionAttributeValues[':questionId'];
        const alts = storage.questions.get(`alts_${questionId}`) || [];
        return alts;
      }
      return [];
    });
    
    // Mock update operations
    mockUpdateItem.mockImplementation(async (tableName: string, key: any, updates: any) => {
      if (tableName.includes('questions')) {
        const existing = storage.questions.get(key.id);
        if (existing) {
          const updated = { ...existing, ...updates };
          storage.questions.set(key.id, updated);
          return updated;
        }
      } else if (tableName.includes('alternatives')) {
        // Find and update the alternative in storage
        const allAlts = Array.from(storage.questions.entries())
          .filter(([k]) => k.startsWith('alts_'))
          .flatMap(([_, alts]) => alts);
        
        const altToUpdate = allAlts.find((alt: any) => alt.id === key.id);
        if (altToUpdate) {
          Object.assign(altToUpdate, updates);
          return altToUpdate;
        }
      }
      return null;
    });
  });
  
  // Feature: cloud-exam-platform, Property 6: Question data round-trip preservation
  test('question round-trip preserves all data', async () => {
    await fc.assert(
      fc.asyncProperty(
        questionDataArbitrary,
        alternativesArbitrary,
        async (questionData, alternatives) => {
          // Save the question with alternatives
          const saved = await saveQuestion(questionData, alternatives);
          
          // Retrieve the question
          const retrieved = await getQuestion(saved.question.id);
          
          // Should not be null
          if (retrieved === null) {
            return false;
          }
          
          // Check equivalence
          return questionsAreEquivalent(saved, retrieved);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  // Additional property: Retrieved question should have valid IDs
  test('saved questions have valid generated IDs', async () => {
    await fc.assert(
      fc.asyncProperty(
        questionDataArbitrary,
        alternativesArbitrary,
        async (questionData, alternatives) => {
          const saved = await saveQuestion(questionData, alternatives);
          
          // Question should have a valid UUID
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(saved.question.id)) {
            return false;
          }
          
          // All alternatives should have valid UUIDs
          for (const alt of saved.alternatives) {
            if (!uuidRegex.test(alt.id)) {
              return false;
            }
            // Alternative should reference the question ID
            if (alt.questionId !== saved.question.id) {
              return false;
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  // Additional property: Course code validation
  test('only supported course codes are accepted', async () => {
    await fc.assert(
      fc.asyncProperty(
        questionDataArbitrary,
        alternativesArbitrary,
        async (questionData, alternatives) => {
          const saved = await saveQuestion(questionData, alternatives);
          
          // Course code should be one of the supported codes
          return SUPPORTED_COURSE_CODES.includes(saved.question.courseCode);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  // Feature: cloud-exam-platform, Property 7: Correct alternative can be updated
  // Validates: Requirements 2.4
  test('correct alternative can be updated', async () => {
    await fc.assert(
      fc.asyncProperty(
        questionDataArbitrary,
        alternativesArbitrary,
        async (questionData, alternatives) => {
          // Save the question with alternatives
          const saved = await saveQuestion(questionData, alternatives);
          
          // Find the currently correct alternative(s)
          const currentlyCorrect = saved.alternatives.filter(alt => alt.isCorrect);
          
          // Find an alternative that is currently incorrect
          const currentlyIncorrect = saved.alternatives.find(alt => !alt.isCorrect);
          
          // If there are no incorrect alternatives, skip this test case
          if (!currentlyIncorrect) {
            return true;
          }
          
          // Import updateQuestion dynamically to avoid circular dependencies
          const { updateQuestion } = await import('./questionService');
          
          // Update the question to mark a different alternative as correct
          // We'll use the alternatives array update method
          const updates = saved.alternatives.map(alt => ({
            id: alt.id,
            isCorrect: alt.id === currentlyIncorrect.id
          }));
          
          await updateQuestion(saved.question.id, {
            alternatives: updates
          });
          
          // Retrieve the question again to verify the update
          const retrieved = await getQuestion(saved.question.id);
          
          if (retrieved === null) {
            return false;
          }
          
          // Find the alternative that should now be correct
          const nowCorrect = retrieved.alternatives.find(
            alt => alt.id === currentlyIncorrect.id
          );
          
          // Verify that the previously incorrect alternative is now correct
          if (!nowCorrect || !nowCorrect.isCorrect) {
            return false;
          }
          
          // Verify that the previously correct alternatives are now incorrect
          for (const prevCorrect of currentlyCorrect) {
            const nowIncorrect = retrieved.alternatives.find(
              alt => alt.id === prevCorrect.id
            );
            if (!nowIncorrect || nowIncorrect.isCorrect) {
              return false;
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
