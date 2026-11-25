export interface Renderer {
  render(svg: string): Promise<Buffer>;
}
