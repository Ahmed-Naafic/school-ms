const {
  validateCreateClass,
  validateUpdateClass,
  validateReorderClass,
  validateCreateSection,
  validateUpdateSection,
} = require('./classes.validation');

describe('validateCreateClass', () => {
  it('accepts a valid name', () => {
    expect(() => validateCreateClass({ name: 'Grade 1' })).not.toThrow();
  });

  it('rejects a missing name', () => {
    expect(() => validateCreateClass({})).toThrow('Invalid Class creation request');
  });

  it('rejects a blank name', () => {
    expect(() => validateCreateClass({ name: '   ' })).toThrow();
  });
});

describe('validateUpdateClass', () => {
  it('rejects a missing name', () => {
    expect(() => validateUpdateClass({})).toThrow('Invalid Class update request');
  });
});

describe('validateReorderClass', () => {
  it('accepts a positive integer position', () => {
    expect(() => validateReorderClass({ position: 1 })).not.toThrow();
  });

  it('rejects position 0', () => {
    expect(() => validateReorderClass({ position: 0 })).toThrow('Invalid sequence update request');
  });

  it('rejects a negative position', () => {
    expect(() => validateReorderClass({ position: -1 })).toThrow();
  });

  it('rejects a non-integer position', () => {
    expect(() => validateReorderClass({ position: 1.5 })).toThrow();
  });

  it('rejects a missing position', () => {
    expect(() => validateReorderClass({})).toThrow();
  });
});

describe('validateCreateSection / validateUpdateSection', () => {
  it('rejects a missing name on create', () => {
    expect(() => validateCreateSection({})).toThrow('Invalid Section creation request');
  });

  it('rejects a missing name on update', () => {
    expect(() => validateUpdateSection({})).toThrow('Invalid Section update request');
  });

  it('accepts a valid Section name', () => {
    expect(() => validateCreateSection({ name: 'Section A' })).not.toThrow();
  });
});
