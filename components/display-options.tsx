"use client"

import { Toggle } from "@/components/ui/toggle"
import { Eye, EyeOff, Type, Ruler, Hexagon, Image } from "lucide-react"

interface DisplayOptionsProps {
  showRoadLengths: boolean
  showRoadNames: boolean
  showPolygons: boolean
  showBackgrounds: boolean
  onToggleRoadLengths: (show: boolean) => void
  onToggleRoadNames: (show: boolean) => void
  onTogglePolygons: (show: boolean) => void
  onToggleBackgrounds: (show: boolean) => void
}

export default function DisplayOptions({
  showRoadLengths,
  showRoadNames,
  showPolygons,
  showBackgrounds,
  onToggleRoadLengths,
  onToggleRoadNames,
  onTogglePolygons,
  onToggleBackgrounds,
}: DisplayOptionsProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Display Options</h3>
      
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ruler size={16} className="text-gray-500" />
            <span className="text-sm">Lengths</span>
          </div>
          <Toggle
            pressed={showRoadLengths}
            onPressedChange={onToggleRoadLengths}
            aria-label="Toggle road lengths"
            size="sm"
          >
            {showRoadLengths ? <Eye size={14} /> : <EyeOff size={14} />}
          </Toggle>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Type size={16} className="text-gray-500" />
            <span className="text-sm">Names</span>
          </div>
          <Toggle
            pressed={showRoadNames}
            onPressedChange={onToggleRoadNames}
            aria-label="Toggle road names"
            size="sm"
          >
            {showRoadNames ? <Eye size={14} /> : <EyeOff size={14} />}
          </Toggle>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hexagon size={16} className="text-gray-500" />
            <span className="text-sm">Polygons</span>
          </div>
          <Toggle
            pressed={showPolygons}
            onPressedChange={onTogglePolygons}
            aria-label="Toggle polygons"
            size="sm"
          >
            {showPolygons ? <Eye size={14} /> : <EyeOff size={14} />}
          </Toggle>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image size={16} className="text-gray-500" />
            <span className="text-sm">Backgrounds</span>
          </div>
          <Toggle
            pressed={showBackgrounds}
            onPressedChange={onToggleBackgrounds}
            aria-label="Toggle background images"
            size="sm"
          >
            {showBackgrounds ? <Eye size={14} /> : <EyeOff size={14} />}
          </Toggle>
        </div>
      </div>
    </div>
  )
}