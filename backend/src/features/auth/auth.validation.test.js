const { isStrongPassword } = require('./auth.validation');

describe('isStrongPassword', () => {
  it('accepts a password with 8+ chars, a letter, and a number', () => {
    expect(isStrongPassword('Bootstrap123')).toBe(true);
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(isStrongPassword('Ab1')).toBe(false);
  });

  it('rejects a password with no digits', () => {
    expect(isStrongPassword('NoDigitsHere')).toBe(false);
  });

  it('rejects a password with no letters', () => {
    expect(isStrongPassword('12345678')).toBe(false);
  });
});
