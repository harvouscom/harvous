/**
 * Transaction Helper Utilities
 * 
 * Since Astro DB doesn't expose explicit transactions, this provides
 * a pattern for ensuring atomicity in multi-step operations.
 * 
 * Note: This is a best-effort approach. For true atomicity, consider
 * using database-level transactions if Astro DB adds support.
 */

export interface Operation {
  execute: () => Promise<any>;
  rollback?: () => Promise<void>;
  description: string;
}

export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  rolledBack: boolean;
}

/**
 * Execute operations with rollback support
 * If any operation fails, attempts to rollback previous operations
 */
export async function executeWithRollback<T>(
  operations: Operation[]
): Promise<TransactionResult<T>> {
  const executedOperations: Operation[] = [];
  let result: T | undefined;

  try {
    for (const operation of operations) {
      const operationResult = await operation.execute();
      executedOperations.push(operation);
      
      // If this is the last operation, store its result
      if (operations.indexOf(operation) === operations.length - 1) {
        result = operationResult;
      }
    }

    return {
      success: true,
      data: result,
      rolledBack: false
    };
  } catch (error) {
    // Attempt to rollback executed operations in reverse order
    let rollbackSuccess = true;
    const rollbackErrors: Error[] = [];

    for (let i = executedOperations.length - 1; i >= 0; i--) {
      const operation = executedOperations[i];
      if (operation.rollback) {
        try {
          await operation.rollback();
        } catch (rollbackError) {
          rollbackSuccess = false;
          rollbackErrors.push(
            rollbackError instanceof Error 
              ? rollbackError 
              : new Error(String(rollbackError))
          );
        }
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      rolledBack: rollbackSuccess,
      data: undefined
    };
  }
}

/**
 * Create a simple operation without rollback
 */
export function createOperation<T>(
  execute: () => Promise<T>,
  description: string
): Operation {
  return {
    execute,
    description
  };
}

/**
 * Create an operation with rollback
 */
export function createOperationWithRollback<T>(
  execute: () => Promise<T>,
  rollback: () => Promise<void>,
  description: string
): Operation {
  return {
    execute,
    rollback,
    description
  };
}

