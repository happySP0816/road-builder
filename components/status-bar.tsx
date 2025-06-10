import { Badge } from "@/components/ui/badge"
import type { BuildSession, PolygonSession } from "@/lib/road-types"

interface StatusBarProps {
  roadCount: number
  nodeCount: number
  polygonCount: number
  totalLength: number
  totalArea: number
  zoom: number
  buildSession: BuildSession
  polygonSession: PolygonSession
}

export default function StatusBar({ 
  roadCount, 
  nodeCount, 
  polygonCount, 
  totalLength, 
  totalArea, 
  zoom, 
  buildSession, 
  polygonSession 
}: StatusBarProps) {
  return (
    <div className="bg-white border-b px-4 py-2 flex gap-6 text-sm text-gray-600">
      <span>Roads: {roadCount}</span>
      <span>Nodes: {nodeCount}</span>
      <span>Polygons: {polygonCount}</span>
      <span>Total Length: {totalLength.toFixed(1)}m</span>
      <span>Total Area: {totalArea.toFixed(1)}m²</span>
      <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
      {buildSession.isActive && <Badge variant="secondary">Building: {buildSession.nodes.length} nodes</Badge>}
      {polygonSession.isActive && <Badge variant="secondary">Polygon: {polygonSession.points.length} points</Badge>}
    </div>
  )
}