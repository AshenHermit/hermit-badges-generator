import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TemplateDefinition } from '../templates/template-definition';
import { TemplateService } from './template.service';

it('escapes selected values before inserting them into HTML', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'select-template-'));
  const templatePath = path.join(dir, 'source.html');
  fs.writeFileSync(templatePath, '<p>{{THEME}}</p>', 'utf8');
  let preparedPath: string | undefined;

  const definition: TemplateDefinition = {
    id: 'demo',
    file: templatePath,
    variables: [
      {
        name: 'theme',
        placeholder: 'THEME',
        type: 'select',
        required: true,
        options: [{ value: '<b>x</b>', label: 'X' }],
      },
    ],
  };

  try {
    preparedPath = new TemplateService().prepare(definition, { theme: '<b>x</b>' });
    const html = fs.readFileSync(preparedPath, 'utf8');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>');
  } finally {
    if (preparedPath !== undefined && fs.existsSync(preparedPath)) {
      fs.unlinkSync(preparedPath);
    }
    fs.unlinkSync(templatePath);
    fs.rmdirSync(dir);
  }
});
