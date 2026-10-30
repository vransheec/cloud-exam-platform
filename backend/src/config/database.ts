/**
 * Database Configuration and Connection
 * 
 * This module sets up the DynamoDB client and provides helper functions
 * for common database operations with clear error handling.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { env } from './env';

/**
 * DynamoDB Client Instance
 * 
 * Configured with the region from environment variables.
 * This client is used for all database operations.
 */
const client = new DynamoDBClient({
  region: env.awsRegion,
  // For local development, you can configure endpoint
  ...(env.nodeEnv === 'development' && process.env.DYNAMODB_ENDPOINT
    ? { endpoint: process.env.DYNAMODB_ENDPOINT }
    : {}),
});

export const dynamoDb = DynamoDBDocumentClient.from(client);

/**
 * Database Error Types
 * 
 * Custom error types for better error handling and messaging
 */
export class DatabaseError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ItemNotFoundError extends DatabaseError {
  constructor(itemType: string, identifier: string) {
    super(`${itemType} not found: ${identifier}`);
    this.name = 'ItemNotFoundError';
  }
}

export class DuplicateItemError extends DatabaseError {
  constructor(itemType: string, identifier: string) {
    super(`${itemType} already exists: ${identifier}`);
    this.name = 'DuplicateItemError';
  }
}

/**
 * Helper function to put an item into DynamoDB
 * 
 * @param tableName - The name of the DynamoDB table
 * @param item - The item to store
 * @returns The stored item
 * @throws DatabaseError if the operation fails
 */
export async function putItem<T>(tableName: string, item: T): Promise<T> {
  try {
    await dynamoDb.send(new PutCommand({
      TableName: tableName,
      Item: item as any,
    }));
    
    return item;
  } catch (error) {
    throw new DatabaseError(
      `Failed to put item in table ${tableName}: ${(error as Error).message}`,
      error as Error
    );
  }
}

/**
 * Helper function to get an item from DynamoDB by primary key
 * 
 * @param tableName - The name of the DynamoDB table
 * @param key - The primary key object (e.g., { id: '123' })
 * @returns The retrieved item or null if not found
 * @throws DatabaseError if the operation fails
 */
export async function getItem<T>(
  tableName: string,
  key: Record<string, any>
): Promise<T | null> {
  try {
    const result = await dynamoDb.send(new GetCommand({
      TableName: tableName,
      Key: key,
    }));
    
    return (result.Item as T) || null;
  } catch (error) {
    throw new DatabaseError(
      `Failed to get item from table ${tableName}: ${(error as Error).message}`,
      error as Error
    );
  }
}

/**
 * Helper function to update an item in DynamoDB
 * 
 * @param tableName - The name of the DynamoDB table
 * @param key - The primary key object
 * @param updates - Object containing fields to update
 * @returns The updated item
 * @throws DatabaseError if the operation fails
 */
export async function updateItem<T>(
  tableName: string,
  key: Record<string, any>,
  updates: Record<string, any>
): Promise<T> {
  try {
    // Build update expression and attribute values
    const updateExpressionParts: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};
    
    Object.keys(updates).forEach((field, index) => {
      const placeholder = `#field${index}`;
      const valuePlaceholder = `:value${index}`;
      
      updateExpressionParts.push(`${placeholder} = ${valuePlaceholder}`);
      expressionAttributeNames[placeholder] = field;
      expressionAttributeValues[valuePlaceholder] = updates[field];
    });
    
    const result = await dynamoDb.send(new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    }));
    
    return result.Attributes as T;
  } catch (error) {
    throw new DatabaseError(
      `Failed to update item in table ${tableName}: ${(error as Error).message}`,
      error as Error
    );
  }
}

/**
 * Helper function to delete an item from DynamoDB
 * 
 * @param tableName - The name of the DynamoDB table
 * @param key - The primary key object
 * @returns true if deletion was successful
 * @throws DatabaseError if the operation fails
 */
export async function deleteItem(
  tableName: string,
  key: Record<string, any>
): Promise<boolean> {
  try {
    await dynamoDb.send(new DeleteCommand({
      TableName: tableName,
      Key: key,
    }));
    
    return true;
  } catch (error) {
    throw new DatabaseError(
      `Failed to delete item from table ${tableName}: ${(error as Error).message}`,
      error as Error
    );
  }
}

/**
 * Helper function to query items from DynamoDB
 * 
 * @param tableName - The name of the DynamoDB table
 * @param keyConditionExpression - The key condition expression
 * @param expressionAttributeValues - Values for the expression
 * @param indexName - Optional index name for querying GSI
 * @returns Array of items matching the query
 * @throws DatabaseError if the operation fails
 */
export async function queryItems<T>(
  tableName: string,
  keyConditionExpression: string,
  expressionAttributeValues: Record<string, any>,
  indexName?: string,
  expressionAttributeNames?: Record<string, string>
): Promise<T[]> {
  try {
    const params: any = {
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
    };
    
    if (indexName) {
      params.IndexName = indexName;
    }
    
    if (expressionAttributeNames) {
      params.ExpressionAttributeNames = expressionAttributeNames;
    }
    
    const result = await dynamoDb.send(new QueryCommand(params));
    
    return (result.Items as T[]) || [];
  } catch (error) {
    throw new DatabaseError(
      `Failed to query items from table ${tableName}: ${(error as Error).message}`,
      error as Error
    );
  }
}

/**
 * Helper function to scan all items from DynamoDB table
 * 
 * @param tableName - The name of the DynamoDB table
 * @param filterExpression - Optional filter expression
 * @param expressionAttributeValues - Optional values for the filter expression
 * @returns Array of all items in the table
 * @throws DatabaseError if the operation fails
 */
export async function scanItems<T>(
  tableName: string,
  filterExpression?: string,
  expressionAttributeValues?: Record<string, any>
): Promise<T[]> {
  try {
    const allItems: T[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined = undefined;

    do {
      const params: any = {
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      };

      if (filterExpression) {
        params.FilterExpression = filterExpression;
      }

      if (expressionAttributeValues) {
        params.ExpressionAttributeValues = expressionAttributeValues;
      }

      const result = await dynamoDb.send(new ScanCommand(params));
      if (result.Items) {
        allItems.push(...(result.Items as T[]));
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return allItems;
  } catch (error) {
    throw new DatabaseError(
      `Failed to scan items from table ${tableName}: ${(error as Error).message}`,
      error as Error
    );
  }
}

/**
 * Helper function to batch write items to DynamoDB
 * 
 * @param tableName - The name of the DynamoDB table
 * @param items - Array of items to write
 * @returns true if all items were written successfully
 * @throws DatabaseError if the operation fails
 */
export async function batchWriteItems<T>(
  tableName: string,
  items: T[]
): Promise<boolean> {
  try {
    // DynamoDB batch write has a limit of 25 items
    const batchSize = 25;
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      const requestItems = batch.map((item) => ({
        PutRequest: {
          Item: item as any,
        },
      }));
      
      await dynamoDb.send(new BatchWriteCommand({
        RequestItems: {
          [tableName]: requestItems,
        },
      }));
    }
    
    return true;
  } catch (error) {
    throw new DatabaseError(
      `Failed to batch write items to table ${tableName}: ${(error as Error).message}`,
      error as Error
    );
  }
}
