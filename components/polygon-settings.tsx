"use client"

import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import { Eye, EyeOff } from "lucide-react"

interface PolygonSettingsProps {
  fillColor: string
  strokeColor: string
  opacity: number
  onFillColorChange: (color: string) => void
  onStrokeColorChange: (color: string) => void
  onOpacityChange: (opacity: number) => void
}

export default function PolygonSettings({
  fillColor,
  strokeColor,
  opacity,
  onFillColorChange,
  onStrokeColorChange,
  onOpacityChange,
}: PolygonSettingsProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Polygon Settings</h3>
        
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="fill-color" className="text-sm font-medium">Fill Color</Label>
            <div className="flex items-center gap-2">
              <Input
                id="fill-color"
                type="color"
                value={fillColor}
                onChange={(e) => onFillColorChange(e.target.value)}
                className="w-12 h-8 p-1 border rounded"
              />
              <Input
                type="text"
                value={fillColor}
                onChange={(e) => onFillColorChange(e.target.value)}
                className="flex-1 text-sm"
                placeholder="#hex color"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stroke-color" className="text-sm font-medium">Stroke Color</Label>
            <div className="flex items-center gap-2">
              <Input
                id="stroke-color"
                type="color"
                value={strokeColor}
                onChange={(e) => onStrokeColorChange(e.target.value)}
                className="w-12 h-8 p-1 border rounded"
              />
              <Input
                type="text"
                value={strokeColor}
                onChange={(e) => onStrokeColorChange(e.target.value)}
                className="flex-1 text-sm"
                placeholder="#hex color"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Opacity</span>
              <Badge variant="secondary">{Math.round(opacity * 100)}%</Badge>
            </div>
            <Slider
              value={[opacity]}
              min={0.1}
              max={1}
              step={0.1}
              onValueChange={(value) => onOpacityChange(value[0])}
            />
          </div>
        </div>
      </div>
    </div>
  )
}