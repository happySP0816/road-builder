import { Badge } from "@/components/ui/badge"
import type { BuildSession } from "@/lib/road-types"

interface StatusBarProps {
  roadCount: number
  nodeCount: number
  totalLength: number
  zoom: number
  buildSession: BuildSession
}

export default function StatusBar({ roadCount, nodeCount, totalLength, zoom, buildSession }: StatusBarProps) {
  return (
    <div className="bg-white border-b px-4 py-2 flex gap-6 text-sm text-gray-600">
      <span>Roads: {roadCount}</span>
      <span>Nodes: {nodeCount}</span>
      <span>Total Length: {totalLength.toFixed(1)}m</span>
      <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
      {buildSession.isActive && <Badge variant="secondary">Building: {buildSession.nodes.length} nodes</Badge>}
    </div>
  )
}
