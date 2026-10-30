/**
 * Cognito Trigger Handler
 * 
 * Post Confirmation trigger that automatically adds new users
 * (especially those from Google sign-in) to the 'students' group.
 */

import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand, AdminListGroupsForUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({});

/**
 * Post Confirmation Trigger
 * 
 * Fired after a user is confirmed (either via email verification or external provider like Google).
 * Adds the user to the 'students' group if they're not already in any group.
 */
export async function postConfirmationTrigger(event: any): Promise<any> {
  console.log('Post Confirmation Trigger:', JSON.stringify({
    userName: event.userName,
    triggerSource: event.triggerSource,
    userAttributes: event.request?.userAttributes,
  }));

  const userPoolId = event.userPoolId;
  const username = event.userName;

  try {
    // Check if user is already in a relevant application group
    const listGroupsResponse = await cognitoClient.send(new AdminListGroupsForUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    }));

    const existingGroups = listGroupsResponse.Groups || [];
    const appGroups = existingGroups.filter(g => 
      ['operators', 'assistants', 'students'].includes(g.GroupName || '')
    );

    // Only add to 'students' if not already in an application group
    if (appGroups.length === 0) {
      await cognitoClient.send(new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: username,
        GroupName: 'students',
      }));
      console.log(`Added user ${username} to students group`);
    } else {
      console.log(`User ${username} already in app groups: ${appGroups.map(g => g.GroupName).join(', ')}`);
    }
  } catch (error) {
    console.error('Error in post confirmation trigger:', error);
    // Don't throw - we don't want to block the user from signing in
  }

  // Must return the event object
  return event;
}
