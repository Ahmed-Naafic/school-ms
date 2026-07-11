const { hashPassword, verifyPassword } = require('./password');

describe('password hashing', () => {
  it('hashes a password and verifies it correctly', async () => {
    const hash = await hashPassword('CorrectHorse123');
    expect(hash).not.toBe('CorrectHorse123');
    await expect(verifyPassword('CorrectHorse123', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password against a hash', async () => {
    const hash = await hashPassword('CorrectHorse123');
    await expect(verifyPassword('WrongPassword', hash)).resolves.toBe(false);
  });
});
