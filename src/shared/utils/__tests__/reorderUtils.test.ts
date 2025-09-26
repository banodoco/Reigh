/**
 * Tests for reorderUtils
 * These tests verify the pure reorder logic works correctly for various scenarios
 */

import { analyzeReorderOperation, validateReorderAnalysis } from '../reorderUtils';

describe('reorderUtils', () => {
  describe('analyzeReorderOperation', () => {
    test('handles no changes needed', () => {
      const current = ['a', 'b', 'c'];
      const desired = ['a', 'b', 'c'];
      
      const result = analyzeReorderOperation(current, desired);
      
      expect(result.noChangesNeeded).toBe(true);
      expect(result.swapSequence).toHaveLength(0);
      expect(result.finalOrder).toEqual(current);
    });
    
    test('handles simple swap A↔B', () => {
      const current = ['a', 'b', 'c'];
      const desired = ['b', 'a', 'c'];
      
      const result = analyzeReorderOperation(current, desired);
      
      expect(result.noChangesNeeded).toBe(false);
      expect(result.swapSequence).toHaveLength(1);
      expect(result.swapSequence[0]).toEqual({
        shotGenIdA: 'b',
        shotGenIdB: 'a',
        reason: expect.stringContaining('Moving b from pos 1 to 0')
      });
      expect(result.finalOrder).toEqual(desired);
    });
    
    test('handles complex chain move (drag to end)', () => {
      const current = ['a', 'b', 'c', 'd'];
      const desired = ['b', 'c', 'd', 'a']; // Move 'a' from start to end
      
      const result = analyzeReorderOperation(current, desired);
      
      expect(result.noChangesNeeded).toBe(false);
      expect(result.swapSequence.length).toBeGreaterThan(1); // Multiple swaps needed
      expect(result.finalOrder).toEqual(desired);
      
      // Verify all swaps are valid (no item swaps with itself)
      result.swapSequence.forEach(swap => {
        expect(swap.shotGenIdA).not.toBe(swap.shotGenIdB);
      });
    });
    
    test('handles reverse order', () => {
      const current = ['a', 'b', 'c', 'd'];
      const desired = ['d', 'c', 'b', 'a'];
      
      const result = analyzeReorderOperation(current, desired);
      
      expect(result.noChangesNeeded).toBe(false);
      expect(result.finalOrder).toEqual(desired);
    });
    
    test('handles single item arrays', () => {
      const current = ['a'];
      const desired = ['a'];
      
      const result = analyzeReorderOperation(current, desired);
      
      expect(result.noChangesNeeded).toBe(true);
      expect(result.swapSequence).toHaveLength(0);
    });
    
    test('handles empty arrays', () => {
      const current: string[] = [];
      const desired: string[] = [];
      
      const result = analyzeReorderOperation(current, desired);
      
      expect(result.noChangesNeeded).toBe(true);
      expect(result.swapSequence).toHaveLength(0);
    });
    
    test('throws error for mismatched array lengths', () => {
      const current = ['a', 'b'];
      const desired = ['a', 'b', 'c'];
      
      expect(() => analyzeReorderOperation(current, desired)).toThrow(
        'Current and desired order arrays must have the same length'
      );
    });
    
    test('throws error for missing items', () => {
      const current = ['a', 'b', 'c'];
      const desired = ['a', 'b', 'd']; // 'd' not in current
      
      expect(() => analyzeReorderOperation(current, desired)).toThrow(
        'Desired item d not found in current order'
      );
    });
  });
  
  describe('validateReorderAnalysis', () => {
    test('validates correct analysis', () => {
      const analysis = {
        swapSequence: [{ shotGenIdA: 'b', shotGenIdB: 'a', reason: 'test' }],
        finalOrder: ['b', 'a', 'c'],
        noChangesNeeded: false
      };
      const desired = ['b', 'a', 'c'];
      
      expect(() => validateReorderAnalysis(analysis, desired)).not.toThrow();
    });
    
    test('validates no-changes-needed analysis', () => {
      const analysis = {
        swapSequence: [],
        finalOrder: ['a', 'b', 'c'],
        noChangesNeeded: true
      };
      const desired = ['a', 'b', 'c'];
      
      expect(() => validateReorderAnalysis(analysis, desired)).not.toThrow();
    });
    
    test('throws error for incorrect final order', () => {
      const analysis = {
        swapSequence: [],
        finalOrder: ['a', 'b', 'c'],
        noChangesNeeded: false
      };
      const desired = ['b', 'a', 'c'];
      
      expect(() => validateReorderAnalysis(analysis, desired)).toThrow(
        'Final order mismatch at position 0'
      );
    });
  });
});
