/**
 * System Configuration Service Tests
 * 
 * Tests for system configuration management including site availability control.
 */

import {
  getSystemConfig,
  setSystemConfig,
  getSiteAvailability,
  setSiteAvailability,
  initializeSystemConfig,
} from './systemConfigService';
import { SystemConfig } from '../models/types';
import * as database from '../config/database';

// Mock the database module
jest.mock('../config/database');

describe('System Configuration Service', () => {
  const mockOperatorId = 'operator-123';
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSystemConfig', () => {
    it('should retrieve a configuration by key', async () => {
      const mockConfig: SystemConfig = {
        key: 'test_key',
        value: 'test_value',
        updatedBy: mockOperatorId,
        updatedAt: new Date(),
      };

      (database.getItem as jest.Mock).mockResolvedValue(mockConfig);

      const result = await getSystemConfig('test_key');

      expect(result).toEqual(mockConfig);
      expect(database.getItem).toHaveBeenCalledWith(
        expect.any(String),
        { key: 'test_key' }
      );
    });

    it('should return null if configuration does not exist', async () => {
      (database.getItem as jest.Mock).mockResolvedValue(null);

      const result = await getSystemConfig('nonexistent_key');

      expect(result).toBeNull();
    });

    it('should throw error if database operation fails', async () => {
      (database.getItem as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(getSystemConfig('test_key')).rejects.toThrow(
        'Failed to get system configuration'
      );
    });
  });

  describe('setSystemConfig', () => {
    it('should create new configuration if it does not exist', async () => {
      (database.getItem as jest.Mock).mockResolvedValue(null);
      (database.putItem as jest.Mock).mockResolvedValue(undefined);

      const result = await setSystemConfig('new_key', 'new_value', mockOperatorId);

      expect(result.key).toBe('new_key');
      expect(result.value).toBe('new_value');
      expect(result.updatedBy).toBe(mockOperatorId);
      expect(database.putItem).toHaveBeenCalled();
    });

    it('should update existing configuration', async () => {
      const existingConfig: SystemConfig = {
        key: 'existing_key',
        value: 'old_value',
        updatedBy: 'old-operator',
        updatedAt: new Date('2024-01-01'),
      };

      const updatedConfig: SystemConfig = {
        key: 'existing_key',
        value: 'new_value',
        updatedBy: mockOperatorId,
        updatedAt: new Date(),
      };

      (database.getItem as jest.Mock).mockResolvedValue(existingConfig);
      (database.updateItem as jest.Mock).mockResolvedValue(updatedConfig);

      const result = await setSystemConfig('existing_key', 'new_value', mockOperatorId);

      expect(result.value).toBe('new_value');
      expect(result.updatedBy).toBe(mockOperatorId);
      expect(database.updateItem).toHaveBeenCalled();
    });

    it('should handle boolean values', async () => {
      (database.getItem as jest.Mock).mockResolvedValue(null);
      (database.putItem as jest.Mock).mockResolvedValue(undefined);

      const result = await setSystemConfig('bool_key', true, mockOperatorId);

      expect(result.value).toBe(true);
    });

    it('should handle number values', async () => {
      (database.getItem as jest.Mock).mockResolvedValue(null);
      (database.putItem as jest.Mock).mockResolvedValue(undefined);

      const result = await setSystemConfig('num_key', 42, mockOperatorId);

      expect(result.value).toBe(42);
    });

    it('should throw error if database operation fails', async () => {
      (database.getItem as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(
        setSystemConfig('test_key', 'test_value', mockOperatorId)
      ).rejects.toThrow('Failed to set system configuration');
    });
  });

  describe('getSiteAvailability', () => {
    it('should return true when site is available', async () => {
      const mockConfig: SystemConfig = {
        key: 'site_available',
        value: true,
        updatedBy: mockOperatorId,
        updatedAt: new Date(),
      };

      (database.getItem as jest.Mock).mockResolvedValue(mockConfig);

      const result = await getSiteAvailability();

      expect(result).toBe(true);
    });

    it('should return false when site is unavailable', async () => {
      const mockConfig: SystemConfig = {
        key: 'site_available',
        value: false,
        updatedBy: mockOperatorId,
        updatedAt: new Date(),
      };

      (database.getItem as jest.Mock).mockResolvedValue(mockConfig);

      const result = await getSiteAvailability();

      expect(result).toBe(false);
    });

    it('should handle string "true" value', async () => {
      const mockConfig: SystemConfig = {
        key: 'site_available',
        value: 'true',
        updatedBy: mockOperatorId,
        updatedAt: new Date(),
      };

      (database.getItem as jest.Mock).mockResolvedValue(mockConfig);

      const result = await getSiteAvailability();

      expect(result).toBe(true);
    });

    it('should handle string "false" value', async () => {
      const mockConfig: SystemConfig = {
        key: 'site_available',
        value: 'false',
        updatedBy: mockOperatorId,
        updatedAt: new Date(),
      };

      (database.getItem as jest.Mock).mockResolvedValue(mockConfig);

      const result = await getSiteAvailability();

      expect(result).toBe(false);
    });

    it('should default to true if configuration does not exist', async () => {
      (database.getItem as jest.Mock).mockResolvedValue(null);

      const result = await getSiteAvailability();

      expect(result).toBe(true);
    });

    it('should default to true on database error (fail open)', async () => {
      (database.getItem as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await getSiteAvailability();

      expect(result).toBe(true);
    });
  });

  describe('setSiteAvailability', () => {
    it('should enable site availability', async () => {
      (database.getItem as jest.Mock).mockResolvedValue(null);
      (database.putItem as jest.Mock).mockResolvedValue(undefined);

      const result = await setSiteAvailability(true, mockOperatorId);

      expect(result.key).toBe('site_available');
      expect(result.value).toBe(true);
      expect(result.updatedBy).toBe(mockOperatorId);
    });

    it('should disable site availability', async () => {
      (database.getItem as jest.Mock).mockResolvedValue(null);
      (database.putItem as jest.Mock).mockResolvedValue(undefined);

      const result = await setSiteAvailability(false, mockOperatorId);

      expect(result.key).toBe('site_available');
      expect(result.value).toBe(false);
    });

    it('should throw error if database operation fails', async () => {
      (database.getItem as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(setSiteAvailability(true, mockOperatorId)).rejects.toThrow(
        'Failed to set site availability'
      );
    });
  });

  describe('initializeSystemConfig', () => {
    it('should initialize site_available to true if not exists', async () => {
      (database.getItem as jest.Mock).mockResolvedValue(null);
      (database.putItem as jest.Mock).mockResolvedValue(undefined);

      await initializeSystemConfig(mockOperatorId);

      expect(database.putItem).toHaveBeenCalled();
    });

    it('should not initialize if site_available already exists', async () => {
      const existingConfig: SystemConfig = {
        key: 'site_available',
        value: true,
        updatedBy: 'previous-operator',
        updatedAt: new Date(),
      };

      (database.getItem as jest.Mock).mockResolvedValue(existingConfig);

      await initializeSystemConfig(mockOperatorId);

      expect(database.putItem).not.toHaveBeenCalled();
    });

    it('should not throw error on initialization failure', async () => {
      (database.getItem as jest.Mock).mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(initializeSystemConfig(mockOperatorId)).resolves.toBeUndefined();
    });
  });
});

// Import fast-check for property-based testing
import * as fc from 'fast-check';

// Feature: cloud-exam-platform, Property 31: Site availability control
describe('Property-Based Test: Site availability control', () => {
  /**
   * Generator for operator IDs (UUIDs)
   */
  const operatorIdArbitrary = fc.uuid();

  /**
   * Generator for boolean availability status
   */
  const availabilityArbitrary = fc.boolean();

  /**
   * Generator for sequences of availability changes
   * Creates arrays of boolean values representing a series of enable/disable actions
   */
  const availabilitySequenceArbitrary = fc.array(fc.boolean(), { minLength: 1, maxLength: 10 });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('setting site availability updates status and subsequent checks respect it', async () => {
    // Store the current site availability state
    let currentAvailability: SystemConfig | null = null;

    // Mock database operations to maintain state
    (database.getItem as jest.Mock).mockImplementation(async () => {
      return currentAvailability;
    });

    (database.putItem as jest.Mock).mockImplementation(async (_tableName: string, item: any) => {
      currentAvailability = item;
      return item;
    });

    (database.updateItem as jest.Mock).mockImplementation(async (_tableName: string, _key: any, updates: any) => {
      if (currentAvailability) {
        currentAvailability = {
          ...currentAvailability,
          ...updates
        };
      }
      return currentAvailability;
    });

    await fc.assert(
      fc.asyncProperty(
        operatorIdArbitrary,
        availabilityArbitrary,
        async (operatorId, isAvailable) => {
          // Reset state for each test
          currentAvailability = null;

          // Step 1: Set site availability
          const setResult = await setSiteAvailability(isAvailable, operatorId);

          // Verify the set operation returned correct value
          if (setResult.value !== isAvailable) {
            return false;
          }

          // Verify operator ID was recorded
          if (setResult.updatedBy !== operatorId) {
            return false;
          }

          // Step 2: Get site availability and verify it matches what was set
          const getResult = await getSiteAvailability();

          if (getResult !== isAvailable) {
            return false;
          }

          // Step 3: Verify the config can be retrieved directly
          const config = await getSystemConfig('site_available');

          if (!config) {
            return false;
          }

          // Handle both boolean and string values
          const configValue = config.value === true || config.value === 'true';
          if (configValue !== isAvailable) {
            return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('multiple availability changes are correctly tracked in sequence', async () => {
    // Store the current site availability state
    let currentAvailability: SystemConfig | null = null;

    // Mock database operations to maintain state
    (database.getItem as jest.Mock).mockImplementation(async () => {
      return currentAvailability;
    });

    (database.putItem as jest.Mock).mockImplementation(async (_tableName: string, item: any) => {
      currentAvailability = item;
      return item;
    });

    (database.updateItem as jest.Mock).mockImplementation(async (_tableName: string, _key: any, updates: any) => {
      if (currentAvailability) {
        currentAvailability = {
          ...currentAvailability,
          ...updates
        };
      }
      return currentAvailability;
    });

    await fc.assert(
      fc.asyncProperty(
        operatorIdArbitrary,
        availabilitySequenceArbitrary,
        async (operatorId, availabilitySequence) => {
          // Reset state for each test
          currentAvailability = null;

          // Apply each availability change in sequence
          for (const isAvailable of availabilitySequence) {
            // Set the availability
            await setSiteAvailability(isAvailable, operatorId);

            // Immediately verify it was set correctly
            const currentStatus = await getSiteAvailability();

            if (currentStatus !== isAvailable) {
              return false;
            }
          }

          // Final check: the last value in the sequence should be the current status
          const finalStatus = await getSiteAvailability();
          const expectedFinalStatus = availabilitySequence[availabilitySequence.length - 1];

          if (finalStatus !== expectedFinalStatus) {
            return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('different operators can change site availability and changes are tracked', async () => {
    // Store the current site availability state
    let currentAvailability: SystemConfig | null = null;

    // Mock database operations to maintain state
    (database.getItem as jest.Mock).mockImplementation(async () => {
      return currentAvailability;
    });

    (database.putItem as jest.Mock).mockImplementation(async (_tableName: string, item: any) => {
      currentAvailability = item;
      return item;
    });

    (database.updateItem as jest.Mock).mockImplementation(async (_tableName: string, _key: any, updates: any) => {
      if (currentAvailability) {
        currentAvailability = {
          ...currentAvailability,
          ...updates
        };
      }
      return currentAvailability;
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(operatorIdArbitrary, availabilityArbitrary), { minLength: 1, maxLength: 5 }),
        async (operatorActions) => {
          // Reset state for each test
          currentAvailability = null;

          // Track the last operator who made a change
          let lastOperatorId: string | null = null;
          let lastAvailability: boolean | null = null;

          // Apply each operator action in sequence
          for (const [operatorId, isAvailable] of operatorActions) {
            // Set the availability
            const result = await setSiteAvailability(isAvailable, operatorId);

            // Verify the operator ID was recorded
            if (result.updatedBy !== operatorId) {
              return false;
            }

            // Verify the value was set correctly
            if (result.value !== isAvailable) {
              return false;
            }

            // Track this change
            lastOperatorId = operatorId;
            lastAvailability = isAvailable;

            // Verify the change is immediately reflected
            const currentStatus = await getSiteAvailability();
            if (currentStatus !== isAvailable) {
              return false;
            }
          }

          // Final verification: the last operator and availability should be recorded
          const finalConfig = await getSystemConfig('site_available');

          if (!finalConfig) {
            return false;
          }

          if (finalConfig.updatedBy !== lastOperatorId) {
            return false;
          }

          const finalValue = finalConfig.value === true || finalConfig.value === 'true';
          if (finalValue !== lastAvailability) {
            return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('site availability defaults to true when not configured', async () => {
    // Mock database to return null (no configuration exists)
    (database.getItem as jest.Mock).mockResolvedValue(null);

    await fc.assert(
      fc.asyncProperty(
        fc.constant(null), // No input needed, just testing default behavior
        async () => {
          const availability = await getSiteAvailability();

          // Should default to true (site available)
          return availability === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('site availability handles both boolean and string values correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        operatorIdArbitrary,
        availabilityArbitrary,
        async (operatorId, isAvailable) => {
          // Test with boolean value
          const booleanConfig: SystemConfig = {
            key: 'site_available',
            value: isAvailable,
            updatedBy: operatorId,
            updatedAt: new Date(),
          };

          (database.getItem as jest.Mock).mockResolvedValue(booleanConfig);

          const booleanResult = await getSiteAvailability();
          if (booleanResult !== isAvailable) {
            return false;
          }

          // Test with string value
          const stringConfig: SystemConfig = {
            key: 'site_available',
            value: isAvailable ? 'true' : 'false',
            updatedBy: operatorId,
            updatedAt: new Date(),
          };

          (database.getItem as jest.Mock).mockResolvedValue(stringConfig);

          const stringResult = await getSiteAvailability();
          if (stringResult !== isAvailable) {
            return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
