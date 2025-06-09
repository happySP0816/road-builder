"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Trash2 } from "lucide-react"
import type { Polygon } from "@/lib/road-types"

interface SelectedPolygonPanelProps {
  selectedPolygon: Polygon | null
  onDeletePolygon: (polygonId: string) => void
  onUpdatePolygonName: (polygonId: string, newName: string) => void
  onUpdatePolygonFillColor: (polygonId: string, newColor: string) => void
  onUpdatePolygonStrokeColor: (polygonId: string, newColor: string) => void
  onUpdatePolygonOpacity: (polygonId: string, newOpacity: number) => void
}

export default function SelectedPolygonPanel({
  selectedPolygon,
  onDeletePolygon,
  onUpdatePolygonName,
  onUpdatePolygonFillColor,
  onUpdatePolygonStrokeColor,
  onUpdatePolygonOpacity,
}: SelectedPolygonPanelProps) {
  if (!selectedPolygon) return null

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Selected Polygon</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-50 p-2 rounded">
              <div className="text-gray-500">Points</div>
              <div className="font-medium">{selectedPolygon.points.length}</div>
            </div>
            <div className="bg-gray-50 p-2 rounded">
              <div className="text-gray-500">Area</div>
              <div className="font-medium">
                {selectedPolygon.area ? `${selectedPolygon.area.toFixed(1)}m²` : 'N/A'}
              </div>
            </div>
          </div>

          {/* Polygon Name Input */}
          <div className="space-y-2">
            <Label htmlFor="polygon-name" className="text-sm font-medium">Polygon Name</Label>
            <Input
              id="polygon-name"
              type="text"
              placeholder="Enter polygon name..."
              value={selectedPolygon.name || ""}
              onChange={(e) => onUpdatePolygonName(selectedPolygon.id, e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Fill Color */}
          <div className="space-y-2">
            <Label htmlFor="polygon-fill" className="text-sm font-medium">Fill Color</Label>
            <div className="flex items-center gap-2">
              <Input
                id="polygon-fill"
                type="color"
                value={selectedPolygon.fillColor}
                onChange={(e) => onUpdatePolygonFillColor(selectedPolygon.id, e.target.value)}
                className="w-12 h-8 p-1 border rounded"
              />
              <Input
                type="text"
                value={selectedPolygon.fillColor}
                onChange={(e) => onUpdatePolygonFillColor(selectedPolygon.id, e.target.value)}
                className="flex-1 text-sm"
              />
            </div>
          </div>

          {/* Stroke Color */}
          <div className="space-y-2">
            <Label htmlFor="polygon-stroke" className="text-sm font-medium">Stroke Color</Label>
            <div className="flex items-center gap-2">
              <Input
                id="polygon-stroke"
                type="color"
                value={selectedPolygon.strokeColor}
                onChange={(e) => onUpdatePolygonStrokeColor(selectedPolygon.id, e.target.value)}
                className="w-12 h-8 p-1 border rounded"
              />
              <Input
                type="text"
                value={selectedPolygon.strokeColor}
                onChange={(e) => onUpdatePolygonStrokeColor(selectedPolygon.id, e.target.value)}
                className="flex-1 text-sm"
              />
            </div>
          </div>

          {/* Opacity Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Opacity</span>
              <Badge variant="secondary">{Math.round(selectedPolygon.opacity * 100)}%</Badge>
            </div>
            <Slider
              value={[selectedPolygon.opacity]}
              min={0.1}
              max={1}
              step={0.1}
              onValueChange={(value) => onUpdatePolygonOpacity(selectedPolygon.id, value[0])}
            />
          </div>

          <Button 
            variant="destructive" 
            size="sm" 
            className="w-full" 
            onClick={() => onDeletePolygon(selectedPolygon.id)}
          >
            <Trash2 size={16} className="mr-1" />
            Delete Polygon
          </Button>
        </div>
      </div>
    </div>
  )
}