import { TemplateDefinition } from './template-definition';
import { TemplateParamsService } from './template-params.service';

const definition = (defaultValue?: string): TemplateDefinition => ({
  id: 'demo',
  file: '',
  variables: [
    {
      name: 'theme',
      placeholder: 'THEME',
      type: 'select',
      required: defaultValue === undefined,
      ...(defaultValue === undefined ? {} : { default: defaultValue }),
      options: [
        { value: 'dark', label: 'Тёмная' },
        { value: 'light', label: 'Светлая' },
      ],
    },
  ],
});

it('accepts a declared option value', () => {
  expect(new TemplateParamsService().resolve(definition(), { theme: 'light' })).toEqual({
    theme: 'light',
  });
});

it('rejects a value outside options', () => {
  expect(() =>
    new TemplateParamsService().resolve(definition(), { theme: 'neon' }),
  ).toThrow('theme: must be one of the allowed options');
});

it('validates defaults too', () => {
  expect(() =>
    new TemplateParamsService().resolve(definition('neon'), {}),
  ).toThrow('theme: must be one of the allowed options');
});

it('rejects a non-string value', () => {
  expect(() =>
    new TemplateParamsService().resolve(definition(), { theme: 1 }),
  ).toThrow('theme: must be a string');
});
