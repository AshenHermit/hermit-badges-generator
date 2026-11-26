import { TemplateDefinition } from '../templates/template-definition';
import { ResolvedValues } from '../templates/template-params.service';

export interface RenderInput {
  template: TemplateDefinition;
  values: ResolvedValues;
}

export interface Renderer {
  render(input: RenderInput): Promise<Buffer>;
}
