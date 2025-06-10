// Basic types file - ready for development
export interface BasicNode {
  id: string
  x: number
  y: number
}

export interface BasicRoad {
  id: string
  start: { x: number; y: number }
  end: { x: number; y: number }
}