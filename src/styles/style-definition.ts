export interface HalfDefinition {
  origin: {
    x: number;
    y: number;
  };
  width: number;
  corner: {
    width: number;
    height: number;
  };
  file: string;
}

export interface StyleDefinition {
  id: string;
  height: number;
  padding: number;
  minHalfWidth: number;
  font: {
    file: string;
    size: number;
    color: string;
  };
  halves: {
    left: HalfDefinition;
    right: HalfDefinition;
  };
}
