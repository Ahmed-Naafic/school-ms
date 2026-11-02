const {
  validateCreateClass,
  validateUpdateClass,
  validateReorderClass,
  validateCreateSection,
  validateUpdateSection,
  validateCreateGradeLevel,
  validateUpdateGradeLevel,
  validateReorderGradeLevel,
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

describe('validateCreateClass / validateUpdateClass (ACR-009 — gradeLevelId shape)', () => {
  it('accepts an omitted gradeLevelId (defaulted in the service layer)', () => {
    expect(() => validateCreateClass({ name: 'Grade 1' })).not.toThrow();
  });

  it('accepts a string gradeLevelId', () => {
    expect(() => validateCreateClass({ name: 'Grade 1', gradeLevelId: 'gl-1' })).not.toThrow();
  });

  it('rejects a non-string gradeLevelId', () => {
    expect(() => validateCreateClass({ name: 'Grade 1', gradeLevelId: 123 })).toThrow(
      'Invalid Class creation request'
    );
  });
});

describe('validateCreateGradeLevel (ACR-009, Architecture Update — Grade/Form)', () => {
  it('accepts a valid name and educationLevel', () => {
    expect(() => validateCreateGradeLevel({ name: 'Grade 8', educationLevel: 'PRIMARY' })).not.toThrow();
  });

  it('rejects a missing name', () => {
    expect(() => validateCreateGradeLevel({ educationLevel: 'PRIMARY' })).toThrow('Invalid Grade/Form creation request');
  });

  it('rejects a missing educationLevel', () => {
    expect(() => validateCreateGradeLevel({ name: 'Grade 8' })).toThrow('Invalid Grade/Form creation request');
  });

  it('rejects an invalid educationLevel value', () => {
    expect(() => validateCreateGradeLevel({ name: 'Grade 8', educationLevel: 'TERTIARY' })).toThrow(
      'Invalid Grade/Form creation request'
    );
  });
});

describe('validateUpdateGradeLevel (Guard by Construction)', () => {
  it('accepts a valid name-only body (educationLevel omitted means unchanged)', () => {
    expect(() => validateUpdateGradeLevel({ name: 'Grade 9' })).not.toThrow();
  });

  it('accepts a corrected educationLevel', () => {
    expect(() => validateUpdateGradeLevel({ name: 'Grade 9', educationLevel: 'SECONDARY' })).not.toThrow();
  });

  it('rejects an invalid educationLevel value', () => {
    expect(() => validateUpdateGradeLevel({ name: 'Grade 9', educationLevel: 'TERTIARY' })).toThrow(
      'Invalid Grade/Form update request'
    );
  });

  it('rejects a missing name', () => {
    expect(() => validateUpdateGradeLevel({})).toThrow('Invalid Grade/Form update request');
  });

  it('rejects sequenceOrder in the body', () => {
    expect(() => validateUpdateGradeLevel({ name: 'Grade 9', sequenceOrder: 3 })).toThrow(
      'Invalid Grade/Form update request'
    );
  });

  it('rejects status in the body', () => {
    expect(() => validateUpdateGradeLevel({ name: 'Grade 9', status: 'ARCHIVED' })).toThrow(
      'Invalid Grade/Form update request'
    );
  });
});

describe('validateReorderGradeLevel', () => {
  it('accepts a positive integer position', () => {
    expect(() => validateReorderGradeLevel({ position: 1 })).not.toThrow();
  });

  it('rejects a non-positive position', () => {
    expect(() => validateReorderGradeLevel({ position: 0 })).toThrow('Invalid sequence update request');
  });
});
