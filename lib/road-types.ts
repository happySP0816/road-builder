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
  // For bezier: cp2 is the control point leading out of this node
  // cp1 of the *next* node will be the control point leading into it
  cp2?: { x: number; y: number } // Control point for the curve segment starting from this node
  cp1?: { x: number; y: number } // Control point for the curve segment ending at this node (used during drawing)
}

export interface Road {
  start: { x: number; y: number }
  end: { x: number; y: number }
  startNodeId?: string
  endNodeId?: string
  type: RoadType
  width: number
  id: string
  // For BEZIER type, controlPoints[0] is cp1 (for start point), controlPoints[1] is cp2 (for end point)
  controlPoints?: [{ x: number; y: number }, { x: number; y: number }]
}

export interface BuildSession {
  nodes: NodePoint[]
  isActive: boolean
  roadType: RoadType
  roadWidth: number
  isDraggingControlPoint?: "cp1" | "cp2" | null // To know which control point is being dragged for the current segment
  currentSegmentStartNodeIndex?: number | null // Index of the node where the current bezier segment starts
}

export interface NodePoint {
  id: string
  x: number
  y: number
  connectedRoadIds?: string[]
  cp2?: { x: number; y: number }
  cp1?: { x: number; y: number }
}
