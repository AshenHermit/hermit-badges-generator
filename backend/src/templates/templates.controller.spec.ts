import { TemplatesController } from './templates.controller';

const variable = {
  name: 'theme',
  placeholder: 'THEME',
  type: 'select',
  required: false,
  default: 'dark',
  options: [
    { value: 'dark', label: 'Тёмная' },
    { value: 'light', label: 'Светлая' },
  ],
} as const;

it('exposes select options in metadata', () => {
  const controller = new TemplatesController({
    get: () => ({ id: 'demo', file: '', variables: [variable] }),
  } as never);

  expect(
    (controller.getParameters('demo') as { parameters: unknown[] }).parameters[0],
  ).toMatchObject({
    type: 'select',
    default: 'dark',
    options: [
      { value: 'dark', label: 'Тёмная' },
      { value: 'light', label: 'Светлая' },
    ],
  });
});
