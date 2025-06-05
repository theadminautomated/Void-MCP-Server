import { AuthService } from '../../src/services/AuthService';

describe('AuthService', () => {
  it('should generate secure API key of sufficient length', () => {
    const service = new AuthService();
    const key = (service as any).generateSecureApiKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(20);
  });
});
