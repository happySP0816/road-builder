"use client"

import { Toggle } from "@/components/ui/toggle"
import { Ruler, Type, Eye } from "lucide-react"

interface ViewSettingsProps {
  showRoadLengths: boolean
  showRoadNames: boolean
  showPolygons: boolean
  onShowRoadLengthsChange: (show: boolean) => void
  onShowRoadNamesChange: (show: boolean) => void
  onShowPolygonsChange: (show: boolean) => void
}

export default function ViewSettings({
  showRoadLengths,
  showRoadNames,
  showPolygons,
  onShowRoadLengthsChange,
  onShowRoadNamesChange,
  onShowPolygonsChange,
}: ViewSettingsProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Display Options</h3>
        
        <div className="space-y-3">
          <Toggle
            pressed={showRoadLengths}
            onPressedChange={onShowRoadLengthsChange}
            aria-label="Show road lengths"
            className="flex items-center justify-start gap-2 w-full h-8"
          >
            <Ruler size={16} />
            <span className="text-sm">Show Lengths</span>
          </Toggle>
          
          <Toggle
            pressed={showRoadNames}
            onPressedChange={onShowRoadNamesChange}
            aria-label="Show road names"
            className="flex items-center justify-start gap-2 w-full h-8"
          >
            <Type size={16} />
            <span className="text-sm">Show Names</span>
          </Toggle>
          
          <Toggle
            pressed={showPolygons}
            onPressedChange={onShowPolygonsChange}
            aria-label="Show polygons"
            className="flex items-center justify-start gap-2 w-full h-8"
          >
            <Eye size={16} />
            <span className="text-sm">Show Polygons</span>
          </Toggle>
        </div>
      </div>
    </div>
  )
}