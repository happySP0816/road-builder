"use client"

import { Toggle } from "@/components/ui/toggle"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Ruler, Type } from "lucide-react"

interface RoadSettingsProps {
  defaultRoadWidth: number
  scaleMetersPerPixel: number
  snapDistance: number
  curvedRoads: boolean
  snapEnabled: boolean
  showRoadLengths: boolean
  showRoadNames: boolean
  onDefaultRoadWidthChange: (width: number) => void
  onScaleChange: (scale: number) => void
  onSnapDistanceChange: (distance: number) => void
  onCurvedRoadsChange: (curved: boolean) => void
  onSnapEnabledChange: (enabled: boolean) => void
  onShowRoadLengthsChange: (show: boolean) => void
  onShowRoadNamesChange: (show: boolean) => void
}

export default function RoadSettings({
  defaultRoadWidth,
  scaleMetersPerPixel,
  snapDistance,
  curvedRoads,
  snapEnabled,
  showRoadLengths,
  showRoadNames,
  onDefaultRoadWidthChange,
  onScaleChange,
  onSnapDistanceChange,
  onCurvedRoadsChange,
  onSnapEnabledChange,
  onShowRoadLengthsChange,
  onShowRoadNamesChange,
}: RoadSettingsProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Road Settings</h3>
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Default Width</span>
              <Badge variant="secondary">{defaultRoadWidth}px</Badge>
            </div>
            <Slider
              value={[defaultRoadWidth]}
              min={5}
              max={30}
              step={1}
              onValueChange={(value) => onDefaultRoadWidthChange(value[0])}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Scale</span>
              <Badge variant="secondary">{scaleMetersPerPixel} m/px</Badge>
            </div>
            <Slider
              value={[scaleMetersPerPixel]}
              min={0.01}
              max={1}
              step={0.01}
              onValueChange={(value) => onScaleChange(value[0])}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Snap Distance</span>
              <Badge variant="secondary">{snapDistance}px</Badge>
            </div>
            <Slider
              value={[snapDistance]}
              min={10}
              max={50}
              step={5}
              onValueChange={(value) => onSnapDistanceChange(value[0])}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Display Options</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Auto Snapping</span>
            <Toggle pressed={snapEnabled} onPressedChange={onSnapEnabledChange}>
              <span className="text-xs">Snap</span>
            </Toggle>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">Show Lengths</span>
            <Toggle pressed={showRoadLengths} onPressedChange={onShowRoadLengthsChange}>
              <Ruler size={16} />
            </Toggle>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">Show Names</span>
            <Toggle pressed={showRoadNames} onPressedChange={onShowRoadNamesChange}>
              <Type size={16} />
            </Toggle>
          </div>
        </div>
      </div>
    </div>
  )
}