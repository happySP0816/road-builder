"use client"

import { Toggle } from "@/components/ui/toggle"
import { Eye, EyeOff, Ruler, Type, Magnet, Magnet as MagnetOff } from "lucide-react"

interface DisplayOptionsProps {
  snapEnabled: boolean
  showRoadLengths: boolean
  showRoadNames: boolean
  showPolygons: boolean
  onSnapEnabledChange: (enabled: boolean) => void
  onShowRoadLengthsChange: (show: boolean) => void
  onShowRoadNamesChange: (show: boolean) => void
  onShowPolygonsChange: (show: boolean) => void
}

export default function DisplayOptions({
  snapEnabled,
  showRoadLengths,
  showRoadNames,
  showPolygons,
  onSnapEnabledChange,
  onShowRoadLengthsChange,
  onShowRoadNamesChange,
  onShowPolygonsChange,
}: DisplayOptionsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"></div>
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Display Options</h3>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        {/* Auto Snapping */}
        <div className="group relative">
          <Toggle 
            pressed={snapEnabled} 
            onPressedChange={onSnapEnabledChange}
            className="w-full h-16 flex flex-col items-center justify-center gap-1 rounded-xl border-2 transition-all duration-300 hover:scale-105 data-[state=on]:bg-gradient-to-br data-[state=on]:from-emerald-500 data-[state=on]:to-teal-600 data-[state=on]:border-emerald-400 data-[state=on]:text-white data-[state=on]:shadow-lg data-[state=on]:shadow-emerald-500/25 hover:shadow-md"
          >
            {snapEnabled ? (
              <Magnet size={20} className="drop-shadow-sm" />
            ) : (
              <MagnetOff size={20} className="text-gray-500" />
            )}
            <span className="text-xs font-medium">Snap</span>
          </Toggle>
          
          {/* Tooltip */}
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
            Auto Snapping
          </div>
        </div>

        {/* Show Lengths */}
        <div className="group relative">
          <Toggle 
            pressed={showRoadLengths} 
            onPressedChange={onShowRoadLengthsChange}
            className="w-full h-16 flex flex-col items-center justify-center gap-1 rounded-xl border-2 transition-all duration-300 hover:scale-105 data-[state=on]:bg-gradient-to-br data-[state=on]:from-blue-500 data-[state=on]:to-indigo-600 data-[state=on]:border-blue-400 data-[state=on]:text-white data-[state=on]:shadow-lg data-[state=on]:shadow-blue-500/25 hover:shadow-md"
          >
            <Ruler size={20} className={showRoadLengths ? "drop-shadow-sm" : "text-gray-500"} />
            <span className="text-xs font-medium">Lengths</span>
          </Toggle>
          
          {/* Tooltip */}
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
            Show Lengths
          </div>
        </div>

        {/* Show Names */}
        <div className="group relative">
          <Toggle 
            pressed={showRoadNames} 
            onPressedChange={onShowRoadNamesChange}
            className="w-full h-16 flex flex-col items-center justify-center gap-1 rounded-xl border-2 transition-all duration-300 hover:scale-105 data-[state=on]:bg-gradient-to-br data-[state=on]:from-purple-500 data-[state=on]:to-pink-600 data-[state=on]:border-purple-400 data-[state=on]:text-white data-[state=on]:shadow-lg data-[state=on]:shadow-purple-500/25 hover:shadow-md"
          >
            <Type size={20} className={showRoadNames ? "drop-shadow-sm" : "text-gray-500"} />
            <span className="text-xs font-medium">Names</span>
          </Toggle>
          
          {/* Tooltip */}
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
            Show Names
          </div>
        </div>

        {/* Show Polygons */}
        <div className="group relative">
          <Toggle 
            pressed={showPolygons} 
            onPressedChange={onShowPolygonsChange}
            className="w-full h-16 flex flex-col items-center justify-center gap-1 rounded-xl border-2 transition-all duration-300 hover:scale-105 data-[state=on]:bg-gradient-to-br data-[state=on]:from-orange-500 data-[state=on]:to-red-600 data-[state=on]:border-orange-400 data-[state=on]:text-white data-[state=on]:shadow-lg data-[state=on]:shadow-orange-500/25 hover:shadow-md"
          >
            {showPolygons ? (
              <Eye size={20} className="drop-shadow-sm" />
            ) : (
              <EyeOff size={20} className="text-gray-500" />
            )}
            <span className="text-xs font-medium">Polygons</span>
          </Toggle>
          
          {/* Tooltip */}
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
            Show Polygons
          </div>
        </div>
      </div>
    </div>
  )
}