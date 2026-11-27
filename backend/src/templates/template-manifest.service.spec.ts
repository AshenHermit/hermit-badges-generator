import { parseVariable } from './template-manifest.service';

const base = { name: 'theme', placeholder: 'THEME', type: 'select', required: true };

it('parses select options', () => {
  expect(
    parseVariable({
      ...base,
      options: [
        { value: 'dark', label: 'Тёмная' },
        { value: 'light', label: 'Светлая' },
      ],
    }),
  ).toMatchObject({
    type: 'select',
    options: [
      { value: 'dark', label: 'Тёмная' },
      { value: 'light', label: 'Светлая' },
    ],
  });
});

it.each([
  ['missing options', {}],
  ['empty options', { options: [] }],
  ['non-array options', { options: 'dark' }],
  [
    'duplicate values',
    {
      options: [
        { value: 'dark', label: 'A' },
        { value: 'dark', label: 'B' },
      ],
    },
  ],
  ['empty value', { options: [{ value: '', label: 'A' }] }],
  ['empty label', { options: [{ value: 'dark', label: '' }] }],
  ['non-string label', { options: [{ value: 'dark', label: 1 }] }],
])('rejects %s', (_name, extra) => {
  expect(() => parseVariable({ ...base, ...extra })).toThrow(
    /Invalid template manifest/,
  );
});

it('rejects a default outside options', () => {
  expect(() =>
    parseVariable({
      ...base,
      required: false,
      default: 'other',
      options: [{ value: 'dark', label: 'A' }],
    }),
  ).toThrow(/default/);
});

it('rejects a numeric default for select', () => {
  expect(() =>
    parseVariable({
      ...base,
      required: false,
      default: 1,
      options: [{ value: 'dark', label: 'A' }],
    }),
  ).toThrow(/default/);
});

it('accepts a default equal to an option value', () => {
  expect(
    parseVariable({
      ...base,
      required: false,
      default: 'dark',
      options: [{ value: 'dark', label: 'A' }],
    }),
  ).toMatchObject({ default: 'dark' });
});

it('rejects options on non-select variables', () => {
  expect(() =>
    parseVariable({
      name: 'left',
      placeholder: 'LEFT',
      type: 'string',
      required: true,
      options: [{ value: 'a', label: 'A' }],
    }),
  ).toThrow(/options/);
});
