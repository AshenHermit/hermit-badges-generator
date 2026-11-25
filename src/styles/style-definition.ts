export interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface HalfDefinition {
  origin: {
    x: number;
    y: number;
  };
  width: number;
  file: string;
}

export interface StyleDefinition {
  id: string;
  height: number;
  border: {
    slice: Sides;
    width: Sides;
  };
  padding: Sides;
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
