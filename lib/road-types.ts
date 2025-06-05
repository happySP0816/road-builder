export enum RoadType {
  STRAIGHT = "straight",
  CURVED = "curved",
  CIRCLE = "circle",
}

export interface Road {
  start: { x: number; y: number }
  end: { x: number; y: number }
  type: RoadType
  width: number
  id: string
}
