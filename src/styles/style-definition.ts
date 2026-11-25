export type RegionName =
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'center';

export interface SliceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  file: string;
}

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
  regions: Record<RegionName, SliceRegion>;
}

export interface StyleDefinition {
  id: string;
  viewBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
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
