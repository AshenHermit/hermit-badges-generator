export interface RenderInput {
  left: string;
  right: string;
}

export interface Renderer {
  render(input: RenderInput): Promise<Buffer>;
}
