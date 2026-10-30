/**
 * API Handlers Index
 * 
 * Exports all API handlers for the Cloud Exam Platform.
 * These handlers are designed to be deployed as serverless functions.
 */

// Authentication handlers
export {
  login,
  logoutHandler as logout,
  getCurrentUser,
} from './authHandler';

// Operator handlers
export {
  createStudentHandler as createStudent,
  updateStudentHandler as updateStudent,
  createEnrollmentHandler as createEnrollment,
  activateStudentHandler as activateStudent,
  resetStudentPasswordHandler as resetStudentPassword,
  resetAssistantPasswordHandler as resetAssistantPassword,
  setSiteAvailabilityHandler as setSiteAvailability,
  getSiteAvailabilityHandler as getSiteAvailability,
  getStudentHandler as getStudent,
  getAllStudentsHandler as getAllStudents,
  createCourseHandler as createCourse,
  updateCourseHandler as updateCourse,
  deleteCourseHandler as deleteCourse,
  getAllCoursesHandler as getAllCourses,
  getCourseHandler as getCourse,
  createAssistantHandler as createAssistant,
  updateAssistantHandler as updateAssistant,
  deleteAssistantHandler as deleteAssistant,
  getAllAssistantsHandler as getAllAssistants,
  getAssistantHandler as getAssistant,
  deleteStudentHandler as deleteStudent,
  bulkCreateStudentsHandler as bulkCreateStudents,
} from './operatorHandler';

// Assistant handlers
export {
  createQuestionHandler as createQuestion,
  updateQuestionHandler as updateQuestion,
  deleteQuestionHandler as deleteQuestion,
  getQuestionHandler as getQuestion,
  getQuestionsByCourseHandler as getQuestionsByCourse,
  uploadImageHandler as uploadImage,
  bulkImportQuestionsHandler as bulkImportQuestions,
  downloadCSVTemplateHandler as downloadCSVTemplate,
  exportQuestionsHandler as exportQuestions,
  createStudentHandler as createStudentAssistant,
  getAllStudentsHandler as getAllStudentsAssistant,
  resetStudentPasswordHandler as resetStudentPasswordAssistant,
  createEnrollmentHandler as createEnrollmentAssistant,
  getAllCoursesHandler as getAllCoursesAssistant,
  createCourseAssistantHandler as createCourseAssistant,
  updateCourseAssistantHandler as updateCourseAssistant,
  bulkStudentActivationHandler as bulkStudentActivationAssistant,
  getStudentEnrollmentsHandler as getStudentEnrollmentsAssistant,
  deleteStudentAssistantHandler as deleteStudentAssistant,
  bulkCreateStudentsAssistantHandler as bulkCreateStudentsAssistant,
  updateEnrollmentAssistantHandler as updateEnrollmentAssistant,
} from './assistantHandler';

// Student handlers
export {
  getCoursesHandler as getCourses,
  getCourseExamsHandler as getCourseExams,
  startExamHandler as startExam,
  getActiveExamHandler as getActiveExam,
  submitAnswerHandler as submitAnswer,
  completeExamHandler as completeExam,
  getExamHistoryHandler as getExamHistory,
  abandonExamHandler as abandonExam,
} from './studentHandler';


// Webhook handlers
export {
  webhookSaleHandler as webhookSale,
} from './webhookHandler';

// Trial handlers
export {
  getTrialCoursesHandler as getTrialCourses,
  trialRegisterHandler as trialRegister,
} from './trialHandler';

// Batch translation handler (one-time operator-invoked Lambda)
export { handler as batchTranslate } from './batchTranslateHandler';

// Cognito Trigger handlers
export { postConfirmationTrigger } from './cognitoTriggerHandler';
export { preSignUpTrigger } from './cognitoPreSignUpHandler';
