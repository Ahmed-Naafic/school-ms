// Concrete thresholds defined in Security-Standards.md's Login Attempts and
// Account Lockout section.
module.exports = {
  BCRYPT_SALT_ROUNDS: 12,
  LOCKOUT_THRESHOLD: 5,
  LOCKOUT_DURATION_MINUTES: 15,
};
