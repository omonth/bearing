import { describe, it, expect } from 'vitest';
import { toProTable } from '@/shared/lib/adminApi';

describe('adminApi.toProTable', () => {
  it('should transform response with results array', () => {
    const input = {
      data: { total: 50, results: [{ id: 1, name: 'test' }] },
    };
    const result = toProTable(input as Parameters<typeof toProTable>[0]);
    expect(result).toEqual({
      data: [{ id: 1, name: 'test' }],
      success: true,
      total: 50,
    });
  });

  it('should transform response with data array', () => {
    const input = {
      data: { total: 10, data: [{ id: 2 }] },
    };
    const result = toProTable(input as Parameters<typeof toProTable>[0]);
    expect(result).toEqual({
      data: [{ id: 2 }],
      success: true,
      total: 10,
    });
  });

  it('should handle empty results', () => {
    const input = { data: {} };
    const result = toProTable(input as Parameters<typeof toProTable>[0]);
    expect(result).toEqual({
      data: [],
      success: true,
      total: 0,
    });
  });
});
