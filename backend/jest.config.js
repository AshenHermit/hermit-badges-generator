/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testRegex: '\\.spec\\.ts$',
  maxWorkers: 1,
  // The golden PNG is tied to the exact local rendering toolchain; CI sets
  // SKIP_GOLDEN=1 and leaves it to developers running the recorded setup.
  testPathIgnorePatterns:
    process.env.SKIP_GOLDEN === '1'
      ? ['<rootDir>/src/generation/golden.spec.ts']
      : [],
};
