export enum RoadType {
  STRAIGHT = "straight",
  CURVED = "curved", // Quadratic
  CIRCLE = "circle",
  BEZIER = "bezier", // Cubic
}

export interface Node {
  id: string
  x: number
  y: number
  connectedRoadIds: string[]
  // For each connected road, a control point (for straight roads, this is the node position)
  controlPoints: { x: number; y: number; roadId: string }[]
}

export interface Road {
  start: { x: number; y: number }
  end: { x: number; y: number }
  startNodeId?: string
  endNodeId?: string
  type: RoadType
  width: number
  id: string
  name?: string // Road name/label
  // For BEZIER type, controlPoints[0] is cp1 (for start point), controlPoints[1] is cp2 (for end point)
  controlPoints?: [{ x: number; y: number }, { x: number; y: number }]
}

export interface Polygon {
  id: string
  name?: string
  points: { x: number; y: number }[]
  roadIds: string[] // Roads that this polygon follows
  fillColor: string
  strokeColor: string
  opacity: number
  area?: number // Calculated area in square meters
}

export interface BuildSession {
  nodes: NodePoint[]
  isActive: boolean
  roadType: RoadType
  roadWidth: number
  isDraggingControlPoint?: "cp1" | "cp2" | null // To know which control point is being dragged for the current segment
  currentSegmentStartNodeIndex?: number | null // Index of the node where the current bezier segment starts
}

export interface PolygonSession {
  points: { x: number; y: number }[]
  roadIds: string[]
  isActive: boolean
  fillColor: string
  strokeColor: string
  opacity: number
}

export interface NodePoint {
  id: string
  x: number
  y: number
  connectedRoadIds?: string[]
  controlPoints: { x: number; y: number; roadId: string }[]
}

export interface BackgroundImage {
  id: string;
  src: string; // Data URL or image URL
  x: number; // Top-left x in canvas coordinates
  y: number; // Top-left y in canvas coordinates
  scale: number; // Uniform scale (1 = original size)
  width: number; // Natural width (for display)
  height: number; // Natural height (for display)
  opacity: number; // 0-1
  visible: boolean;
  name?: string;
}