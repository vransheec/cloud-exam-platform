/**
 * System Configuration Service
 * 
 * This service manages system-wide configuration settings stored in the database.
 * Primary use case is controlling site availability (enable/disable entire platform).
 * 
 * Requirements:
 * - 1.1 (extended): Site availability control
 * - Property 31: Site availability control
 */

import { getItem, putItem, updateItem } from '../config/database';
import { env } from '../config/env';
import { SystemConfig } from '../models/types';

/**
 * Get a system configuration value by key
 * 
 * @param key - Configuration key (e.g., 'site_available')
 * @returns SystemConfig object or null if not found
 * @throws Error if database operation fails
 */
export async function getSystemConfig(
  key: string
): Promise<SystemConfig | null> {
  try {
    const config = await getItem<SystemConfig>(env.systemConfigTable, { key });
    return config;
  } catch (error) {
    console.error(`Error getting system config for key ${key}:`, error);
    throw new Error(`Failed to get system configuration: ${(error as Error).message}`);
  }
}

/**
 * Set a system configuration value
 * 
 * Creates a new configuration entry or updates an existing one.
 * 
 * @param key - Configuration key
 * @param value - Configuration value (string, boolean, or number)
 * @param operatorId - ID of the operator making the change
 * @returns Updated SystemConfig object
 * @throws Error if database operation fails or user is not an operator
 */
export async function setSystemConfig(
  key: string,
  value: string | boolean | number,
  operatorId: string
): Promise<SystemConfig> {
  try {
    const now = new Date().toISOString();
    
    // Check if config already exists
    const existingConfig = await getItem<SystemConfig>(env.systemConfigTable, { key });
    
    if (existingConfig) {
      // Update existing configuration
      const updatedConfig = await updateItem<SystemConfig>(
        env.systemConfigTable,
        { key },
        {
          value,
          updatedBy: operatorId,
          updatedAt: now,
        }
      );
      
      return updatedConfig;
    } else {
      // Create new configuration
      const newConfig: SystemConfig = {
        key,
        value,
        updatedBy: operatorId,
        updatedAt: now,
      };
      
      await putItem(env.systemConfigTable, newConfig);
      return newConfig;
    }
  } catch (error) {
    console.error(`Error setting system config for key ${key}:`, error);
    throw new Error(`Failed to set system configuration: ${(error as Error).message}`);
  }
}

/**
 * Get site availability status
 * 
 * Returns whether the site is currently available for access.
 * If the configuration doesn't exist, defaults to true (site available).
 * 
 * @returns boolean indicating if site is available
 * @throws Error if database operation fails
 */
export async function getSiteAvailability(): Promise<boolean> {
  try {
    const config = await getSystemConfig('site_available');
    
    // If config doesn't exist, default to available
    if (!config) {
      return true;
    }
    
    // Handle both boolean and string values
    return config.value === true || config.value === 'true';
  } catch (error) {
    console.error('Error getting site availability:', error);
    // On error, default to available (fail open)
    return true;
  }
}

/**
 * Set site availability status
 * 
 * Allows operators to enable or disable the entire platform.
 * When disabled, all users except operators will be denied access.
 * 
 * @param isAvailable - Whether the site should be available
 * @param operatorId - ID of the operator making the change
 * @returns Updated SystemConfig object
 * @throws Error if database operation fails
 * 
 * Requirements:
 * - Property 31: Site availability control
 */
export async function setSiteAvailability(
  isAvailable: boolean,
  operatorId: string
): Promise<SystemConfig> {
  try {
    const config = await setSystemConfig('site_available', isAvailable, operatorId);
    
    console.log(
      `Site availability ${isAvailable ? 'enabled' : 'disabled'} by operator ${operatorId}`
    );
    
    return config;
  } catch (error) {
    console.error('Error setting site availability:', error);
    throw new Error(`Failed to set site availability: ${(error as Error).message}`);
  }
}

/**
 * Initialize default system configurations
 * 
 * Sets up default configuration values if they don't exist.
 * Should be called during system initialization.
 * 
 * @param operatorId - ID of the operator initializing the system
 */
export async function initializeSystemConfig(operatorId: string): Promise<void> {
  try {
    // Check if site_available config exists
    const siteAvailableConfig = await getSystemConfig('site_available');
    
    if (!siteAvailableConfig) {
      // Initialize with site available by default
      await setSiteAvailability(true, operatorId);
      console.log('Initialized site_available configuration to true');
    }
  } catch (error) {
    console.error('Error initializing system config:', error);
    // Don't throw - initialization failures shouldn't block the system
  }
}
