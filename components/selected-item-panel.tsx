"use client"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Trash2 } from "lucide-react"
import type { Road, Node } from "@/lib/road-types"

interface SelectedItemPanelProps {
  selectedRoad: Road | null
  selectedNode: Node | null
  onDeleteRoad: (roadId: string) => void
  onDeleteNode: (nodeId: string) => void
  calculateRoadLength: (road: Road) => number
  onUpdateRoadWidth?: (roadId: string, newWidth: number) => void
  onUpdateRoadName?: (roadId: string, newName: string) => void
}

export default function SelectedItemPanel({
  selectedRoad,
  selectedNode,
  onDeleteRoad,
  onDeleteNode,
  calculateRoadLength,
  onUpdateRoadWidth,
  onUpdateRoadName,
}: SelectedItemPanelProps) {
  if (!selectedRoad && !selectedNode) return null

  return (
    <div className="space-y-6">
      {selectedNode && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Selected Node</h3>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-gray-500">Position</div>
                <div className="font-medium">
                  {selectedNode.x.toFixed(0)}, {selectedNode.y.toFixed(0)}
                </div>
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-gray-500">Roads</div>
                <div className="font-medium">{selectedNode.connectedRoadIds.length}</div>
              </div>
            </div>
            <Button variant="destructive" size="sm" className="w-full" onClick={() => onDeleteNode(selectedNode.id)}>
              <Trash2 size={16} className="mr-1" />
              Delete Node
            </Button>
          </div>
        </div>
      )}

      {selectedRoad && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Selected Road</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-gray-500">Length</div>
                <div className="font-medium">{calculateRoadLength(selectedRoad).toFixed(1)}m</div>
              </div>
            </div>

            {/* Road Width Slider */}
            {onUpdateRoadWidth && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Width</span>
                  <Badge variant="secondary">{selectedRoad.width}px</Badge>
                </div>
                <Slider
                  value={[selectedRoad.width]}
                  min={5}
                  max={50}
                  step={1}
                  onValueChange={(value) => onUpdateRoadWidth(selectedRoad.id, value[0])}
                />
              </div>
            )}

            <Button variant="destructive" size="sm" className="w-full" onClick={() => onDeleteRoad(selectedRoad.id)}>
              <Trash2 size={16} className="mr-1" />
              Delete Road
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}