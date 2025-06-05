export enum RoadType {
  STRAIGHT = "straight",
  CURVED = "curved",
  CIRCLE = "circle",
}

export interface Node {
  id: string
  x: number
  y: number
  connectedRoadIds: string[]
}

export interface Road {
  start: { x: number; y: number }
  end: { x: number; y: number }
  startNodeId?: string
  endNodeId?: string
  type: RoadType
  width: number
  id: string
}

export interface BuildSession {
  nodes: Node[]
  isActive: boolean
  roadType: RoadType
  roadWidth: number
}
