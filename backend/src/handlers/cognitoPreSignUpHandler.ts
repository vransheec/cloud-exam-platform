/**
 * Cognito Pre Sign Up Trigger
 * 
 * Auto-confirms and auto-verifies email for external provider users (Google).
 */

export async function preSignUpTrigger(event: any): Promise<any> {
  console.log('Pre Sign Up Trigger:', JSON.stringify({
    userName: event.userName,
    triggerSource: event.triggerSource,
    userAttributes: event.request?.userAttributes,
  }));

  const triggerSource = event.triggerSource;

  // For external providers (Google): auto-confirm and auto-verify
  if (triggerSource === 'PreSignUp_ExternalProvider') {
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
  }

  return event;
}
