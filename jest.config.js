module.exports = {
  preset: 'ts-jest',
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
      isolatedModules: true,
    },
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/node'],
};
