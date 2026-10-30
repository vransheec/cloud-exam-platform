/**
 * CSV Parser Utility
 * 
 * Parses CSV files containing question data for bulk import.
 * Supports both single and multiple answer questions.
 */

export interface CSVQuestion {
  questionType: 'single' | 'multiple' | 'dropdown' | 'truefalse' | 'ordering';
  questionText: string;
  questionImageUrl: string | null;
  explanation: string | null;
  extendedData: any | null;
  alternatives: Array<{
    text: string;
    imageUrl: string | null;
    isCorrect: boolean;
    order: number;
  }>;
}

export interface CSVParseResult {
  questions: CSVQuestion[];
  errors: Array<{
    row: number;
    field: string;
    message: string;
  }>;
}

/**
 * Parse CSV content into question objects
 * 
 * Expected CSV format:
 * QuestionType,QuestionText,QuestionImageURL,Alt1Text,Alt1ImageURL,Alt1Correct,Alt2Text,Alt2ImageURL,Alt2Correct,...
 * 
 * @param csvContent - Raw CSV file content as string
 * @returns Parsed questions and any validation errors
 */
export function parseQuestionsCSV(csvContent: string): CSVParseResult {
  const questions: CSVQuestion[] = [];
  const errors: Array<{ row: number; field: string; message: string }> = [];
  
  // Split into lines and remove empty lines
  const lines = csvContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  if (lines.length === 0) {
    errors.push({ row: 0, field: 'file', message: 'CSV file is empty' });
    return { questions, errors };
  }
  
  // Parse header
  const header = parseCSVLine(lines[0]);
  
  // Validate header format
  if (!header.includes('QuestionType') || !header.includes('QuestionText')) {
    errors.push({ 
      row: 0, 
      field: 'header', 
      message: 'CSV must have QuestionType and QuestionText columns' 
    });
    return { questions, errors };
  }
  
  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    const values = parseCSVLine(lines[i]);
    
    if (values.length === 0) continue; // Skip empty rows
    
    try {
      const question = parseQuestionRow(header, values);
      
      // Validate question
      const validationErrors = validateQuestion(question, rowNumber);
      if (validationErrors.length > 0) {
        errors.push(...validationErrors);
      } else {
        questions.push(question);
      }
    } catch (error) {
      errors.push({
        row: rowNumber,
        field: 'row',
        message: error instanceof Error ? error.message : 'Failed to parse row'
      });
    }
  }
  
  return { questions, errors };
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of value
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last value
  values.push(current.trim());
  
  return values;
}

/**
 * Parse a question row from CSV values
 */
function parseQuestionRow(
  header: string[],
  values: string[]
): CSVQuestion {
  const row: Record<string, string> = {};
  
  // Map values to header columns
  header.forEach((col, index) => {
    row[col] = values[index] || '';
  });
  
  // Extract question type
  const questionType = row['QuestionType']?.toLowerCase();
  if (!['single', 'multiple', 'dropdown', 'truefalse', 'ordering'].includes(questionType)) {
    throw new Error(`Invalid question type: ${row['QuestionType']}. Must be 'single', 'multiple', 'dropdown', 'truefalse', or 'ordering'`);
  }
  
  // Extract question text
  const questionText = row['QuestionText'];
  if (!questionText || questionText.trim() === '') {
    throw new Error('Question text is required');
  }
  
  // Extract question image URL (optional)
  const questionImageUrl = row['QuestionImageURL'] || null;
  
  // Extract alternatives (support up to 10 alternatives)
  const alternatives: Array<{
    text: string;
    imageUrl: string | null;
    isCorrect: boolean;
    order: number;
  }> = [];
  
  for (let i = 1; i <= 10; i++) {
    const altText = row[`Alt${i}Text`];
    
    // Stop if no more alternatives
    if (!altText || altText.trim() === '') {
      break;
    }
    
    const altImageUrl = row[`Alt${i}ImageURL`] || null;
    const altCorrect = row[`Alt${i}Correct`]?.toLowerCase() === 'true';
    
    alternatives.push({
      text: altText.trim(),
      imageUrl: altImageUrl && altImageUrl.trim() !== '' ? altImageUrl.trim() : null,
      isCorrect: altCorrect,
      order: i - 1
    });
  }
  
  // Parse extended data for new question types
  let extendedData: any = null;
  const extendedDataRaw = row['ExtendedData'];
  if (extendedDataRaw && extendedDataRaw.trim() !== '') {
    try {
      extendedData = JSON.parse(extendedDataRaw);
    } catch {
      throw new Error('ExtendedData must be valid JSON');
    }
  }
  
  // Parse additional images
  const additionalImages: string[] = [];
  for (let i = 2; i <= 5; i++) {
    const imgUrl = row[`QuestionImageURL${i}`];
    if (imgUrl && imgUrl.trim() !== '') {
      additionalImages.push(imgUrl.trim());
    }
  }
  if (additionalImages.length > 0) {
    if (!extendedData) extendedData = {};
    extendedData.additionalImages = additionalImages;
  }
  
  return {
    questionType: questionType as 'single' | 'multiple' | 'dropdown' | 'truefalse' | 'ordering',
    questionText: questionText.trim(),
    questionImageUrl: questionImageUrl && questionImageUrl.trim() !== '' ? questionImageUrl.trim() : null,
    explanation: row['Explanation'] && row['Explanation'].trim() !== '' ? row['Explanation'].trim() : null,
    extendedData,
    alternatives
  };
}

/**
 * Validate a parsed question
 */
function validateQuestion(
  question: CSVQuestion,
  rowNumber: number
): Array<{ row: number; field: string; message: string }> {
  const errors: Array<{ row: number; field: string; message: string }> = [];
  
  // Check alternatives count (only for single/multiple types)
  if ((question.questionType === 'single' || question.questionType === 'multiple') && question.alternatives.length < 2) {
    errors.push({
      row: rowNumber,
      field: 'alternatives',
      message: 'Question must have at least 2 alternatives'
    });
  }
  
  // Check correct alternatives (only for single/multiple types)
  if (question.questionType === 'single' || question.questionType === 'multiple') {
    const correctCount = question.alternatives.filter(alt => alt.isCorrect).length;
    
    if (correctCount === 0) {
      errors.push({
        row: rowNumber,
        field: 'alternatives',
        message: 'Question must have at least one correct alternative'
      });
    }
    
    if (question.questionType === 'single' && correctCount > 1) {
      errors.push({
        row: rowNumber,
        field: 'questionType',
        message: 'Single answer questions must have exactly one correct alternative'
      });
    }
    
    if (question.questionType === 'multiple' && correctCount < 2) {
      errors.push({
        row: rowNumber,
        field: 'questionType',
        message: 'Multiple answer questions must have at least two correct alternatives'
      });
    }
  }
  
  // Validate extended data for new question types
  if (question.questionType === 'dropdown' && (!question.extendedData?.dropdownStatements || question.extendedData.dropdownStatements.length < 1)) {
    errors.push({ row: rowNumber, field: 'extendedData', message: 'Dropdown questions require dropdownStatements in ExtendedData' });
  }
  if (question.questionType === 'truefalse' && (!question.extendedData?.trueFalseStatements || question.extendedData.trueFalseStatements.length < 1)) {
    errors.push({ row: rowNumber, field: 'extendedData', message: 'True/False questions require trueFalseStatements in ExtendedData' });
  }
  if (question.questionType === 'ordering' && (!question.extendedData?.orderingItems || question.extendedData.orderingItems.length < 2)) {
    errors.push({ row: rowNumber, field: 'extendedData', message: 'Ordering questions require at least 2 orderingItems in ExtendedData' });
  }
  
  // Validate question text length
  if (question.questionText.length > 1000) {
    errors.push({
      row: rowNumber,
      field: 'questionText',
      message: 'Question text must be 1000 characters or less'
    });
  }
  
  // Validate alternative text
  question.alternatives.forEach((alt, index) => {
    if (alt.text.length > 500) {
      errors.push({
        row: rowNumber,
        field: `alternative${index + 1}`,
        message: `Alternative ${index + 1} text must be 500 characters or less`
      });
    }
  });
  
  return errors;
}

/**
 * Generate a CSV template for download
 */
export function generateCSVTemplate(): string {
  const header = [
    'QuestionType',
    'QuestionText',
    'QuestionImageURL',
    'Alt1Text',
    'Alt1ImageURL',
    'Alt1Correct',
    'Alt2Text',
    'Alt2ImageURL',
    'Alt2Correct',
    'Alt3Text',
    'Alt3ImageURL',
    'Alt3Correct',
    'Alt4Text',
    'Alt4ImageURL',
    'Alt4Correct',
    'Alt5Text',
    'Alt5ImageURL',
    'Alt5Correct',
    'Alt6Text',
    'Alt6ImageURL',
    'Alt6Correct'
  ].join(',');
  
  const examples = [
    [
      'single',
      'What does AWS S3 stand for?',
      '',
      'Simple Storage Service',
      '',
      'true',
      'Simple Server Service',
      '',
      'false',
      'Secure Storage System',
      '',
      'false',
      'Server Scaling Service',
      '',
      'false',
      '',
      '',
      '',
      '',
      '',
      ''
    ].join(','),
    [
      'single',
      'Which AWS service provides virtual servers?',
      '',
      'Amazon EC2',
      '',
      'true',
      'Amazon S3',
      '',
      'false',
      'Amazon RDS',
      '',
      'false',
      'Amazon CloudFront',
      '',
      'false',
      'Amazon Lambda',
      '',
      'false',
      'Amazon DynamoDB',
      '',
      'false'
    ].join(','),
    [
      'multiple',
      '"Which of the following are AWS database services? (Select TWO)"',
      '',
      'Amazon RDS',
      '',
      'true',
      'Amazon DynamoDB',
      '',
      'true',
      'Amazon S3',
      '',
      'false',
      'Amazon EC2',
      '',
      'false',
      '',
      '',
      '',
      '',
      '',
      ''
    ].join(',')
  ];
  
  const instructions = [
    '',
    '# CSV Import Instructions:',
    '# - QuestionType: Use "single" for one correct answer or "multiple" for 2+ correct answers',
    '# - QuestionText: The question text (required)',
    '# - QuestionImageURL: Optional URL to an image for the question (leave empty if none)',
    '# - Alt1Text through Alt6Text: Alternative answer texts (minimum 2 required)',
    '# - Alt1ImageURL through Alt6ImageURL: Optional URLs to images for alternatives',
    '# - Alt1Correct through Alt6Correct: Use "true" for correct answers, "false" for incorrect',
    '# - You can add up to 10 alternatives by adding Alt7Text, Alt7ImageURL, Alt7Correct, etc.',
    '# - For images: Upload images first using the UI, then copy the URL here',
    '# - Leave empty columns at the end if you have fewer than 6 alternatives',
    ''
  ].join('\n');
  
  return instructions + '\n' + [header, ...examples].join('\n');
}

/**
 * Export questions to CSV format
 * 
 * @param questions - Array of questions with alternatives
 * @returns CSV content as string
 */
export function exportQuestionsToCSV(
  questions: Array<{
    question: {
      id: string;
      courseCode: string;
      questionText: string;
      questionType: string;
      imageUrl: string | null;
      explanation?: string | null;
    };
    alternatives: Array<{
      id: string;
      text: string;
      imageUrl: string | null;
      isCorrect: boolean;
      order: number;
    }>;
  }>
): string {
  const header = [
    'QuestionType',
    'QuestionText', 
    'QuestionImageURL',
    'Explanation',
    'Alt1Text',
    'Alt1ImageURL',
    'Alt1Correct',
    'Alt2Text',
    'Alt2ImageURL',
    'Alt2Correct',
    'Alt3Text',
    'Alt3ImageURL',
    'Alt3Correct',
    'Alt4Text',
    'Alt4ImageURL',
    'Alt4Correct',
    'Alt5Text',
    'Alt5ImageURL',
    'Alt5Correct',
    'Alt6Text',
    'Alt6ImageURL',
    'Alt6Correct'
  ].join(',');
  
  const rows: string[] = [header];
  
  for (const q of questions) {
    const question = q.question;
    const alternatives = q.alternatives.sort((a, b) => a.order - b.order);
    
    // Build row with up to 6 alternatives
    const row = [
      question.questionType,
      escapeCSVField(question.questionText),
      question.imageUrl || '',
      question.explanation ? escapeCSVField(question.explanation) : '',
      // Alternative 1
      alternatives[0]?.text ? escapeCSVField(alternatives[0].text) : '',
      alternatives[0]?.imageUrl || '',
      alternatives[0]?.isCorrect ? 'true' : 'false',
      // Alternative 2
      alternatives[1]?.text ? escapeCSVField(alternatives[1].text) : '',
      alternatives[1]?.imageUrl || '',
      alternatives[1]?.isCorrect ? 'true' : 'false',
      // Alternative 3
      alternatives[2]?.text ? escapeCSVField(alternatives[2].text) : '',
      alternatives[2]?.imageUrl || '',
      alternatives[2]?.isCorrect ? 'true' : 'false',
      // Alternative 4
      alternatives[3]?.text ? escapeCSVField(alternatives[3].text) : '',
      alternatives[3]?.imageUrl || '',
      alternatives[3]?.isCorrect ? 'true' : 'false',
      // Alternative 5
      alternatives[4]?.text ? escapeCSVField(alternatives[4].text) : '',
      alternatives[4]?.imageUrl || '',
      alternatives[4]?.isCorrect ? 'true' : 'false',
      // Alternative 6
      alternatives[5]?.text ? escapeCSVField(alternatives[5].text) : '',
      alternatives[5]?.imageUrl || '',
      alternatives[5]?.isCorrect ? 'true' : 'false',
    ];
    
    rows.push(row.join(','));
  }
  
  return rows.join('\n');
}

/**
 * Escape a CSV field value
 */
function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}