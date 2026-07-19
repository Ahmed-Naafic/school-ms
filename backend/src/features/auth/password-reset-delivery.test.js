// Dedicated test file for PASSWORD_RESET_DELIVERY_MODE behavior. Does NOT
// mock ../../config/password-reset (unlike auth.service.test.js), so each
// test sets the real env var and re-requires the modules fresh via
// jest.resetModules() — this is simpler and more reliable than trying to
// override an already-registered jest.mock() for the same path per-test.
const ORIGINAL_ENV = process.env.PASSWORD_RESET_DELIVERY_MODE;

afterEach(() => {
  process.env.PASSWORD_RESET_DELIVERY_MODE = ORIGINAL_ENV;
  jest.resetModules();
});

function loadWithMode(mode) {
  jest.resetModules();
  if (mode === undefined) {
    delete process.env.PASSWORD_RESET_DELIVERY_MODE;
  } else {
    process.env.PASSWORD_RESET_DELIVERY_MODE = mode;
  }
  jest.doMock('./auth.repository');
  jest.doMock('../../shared/audit');
  return {
    config: require('../../config/password-reset'),
    repository: require('./auth.repository'),
    service: require('./auth.service'),
  };
}

describe('password-reset.js config resolution', () => {
  it.each(['development', 'email', 'sms', 'disabled'])('accepts the valid mode "%s"', (mode) => {
    const { config } = loadWithMode(mode);
    expect(config.PASSWORD_RESET_DELIVERY_MODE).toBe(mode);
  });

  it('defaults to "disabled" (fail safe) when unset', () => {
    const { config } = loadWithMode(undefined);
    expect(config.PASSWORD_RESET_DELIVERY_MODE).toBe('disabled');
  });

  it('defaults to "disabled" for an unrecognized value, rather than silently logging tokens', () => {
    const { config } = loadWithMode('production-oops-typo');
    expect(config.PASSWORD_RESET_DELIVERY_MODE).toBe('disabled');
  });
});

describe('requestPasswordReset under each delivery mode (regression)', () => {
  it('mode "disabled" rejects outright, before even looking up the account', async () => {
    const { service, repository } = loadWithMode('disabled');

    await expect(service.requestPasswordReset({ email: 'anyone@example.com' })).rejects.toThrow(
      'Password recovery is currently unavailable'
    );
    expect(repository.findByEmail).not.toHaveBeenCalled();
  });

  it('mode "email" (no provider wired up) throws once it reaches delivery', async () => {
    const { service, repository } = loadWithMode('email');
    repository.findByEmail.mockResolvedValue({ id: 'acc-1', status: 'ACTIVE', schoolId: null });

    await expect(service.requestPasswordReset({ email: 'a@example.com' })).rejects.toThrow(
      'has no provider integration yet'
    );
  });

  it('mode "sms" (no provider wired up) throws once it reaches delivery', async () => {
    const { service, repository } = loadWithMode('sms');
    repository.findByEmail.mockResolvedValue({ id: 'acc-1', status: 'ACTIVE', schoolId: null });

    await expect(service.requestPasswordReset({ email: 'a@example.com' })).rejects.toThrow(
      'has no provider integration yet'
    );
  });

  it('mode "development" logs the token and does not throw', async () => {
    const { service, repository } = loadWithMode('development');
    repository.findByEmail.mockResolvedValue({ id: 'acc-1', status: 'ACTIVE', schoolId: null });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await expect(service.requestPasswordReset({ email: 'a@example.com' })).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[password-reset] token for a@example.com'));

    logSpy.mockRestore();
  });
});
