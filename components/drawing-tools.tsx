"use client"

import { Toggle } from "@/components/ui/toggle"
import { MousePointer2, MousePointer, Hand, Link, Unlink, Plus, Hexagon, Edit, Image } from "lucide-react"

interface DrawingToolsProps {
  drawingMode: "nodes" | "pan" | "select" | "connect" | "disconnect" | "add-node" | "polygon" | "background-image"
  onDrawingModeChange: (mode: "nodes" | "pan" | "select" | "connect" | "disconnect" | "add-node" | "polygon" | "background-image") => void
}

export default function DrawingTools({ drawingMode, onDrawingModeChange }: DrawingToolsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Drawing</h3>
        <div className="grid grid-cols-1 gap-1">
          <Toggle
            pressed={drawingMode === "nodes"}
            onPressedChange={() => onDrawingModeChange("nodes")}
            aria-label="Build mode"
            className="flex flex-col items-center gap-1 h-12 text-xs"
          >
            <MousePointer2 size={16} />
            <span>Build</span>
          </Toggle>
          <Toggle
            pressed={drawingMode === "add-node"}
            onPressedChange={() => onDrawingModeChange("add-node")}
            aria-label="Add node mode"
            className="flex flex-col items-center gap-1 h-12 text-xs"
          >
            <Plus size={16} />
            <span>Add Node</span>
          </Toggle>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Background</h3>
        <div className="grid grid-cols-1 gap-1">
          <Toggle
            pressed={drawingMode === "background-image"}
            onPressedChange={() => onDrawingModeChange("background-image")}
            aria-label="Background image tool"
            className="flex flex-col items-center gap-1 h-12 text-xs"
          >
            <Image size={16} />
            <span>Images</span>
          </Toggle>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Polygon</h3>
        <div className="grid grid-cols-1 gap-1">
          <Toggle
            pressed={drawingMode === "polygon"}
            onPressedChange={() => onDrawingModeChange("polygon")}
            aria-label="Draw polygon"
            className="flex flex-col items-center gap-1 h-12 text-xs"
          >
            <Hexagon size={16} />
            <span>Draw</span>
          </Toggle>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Connect</h3>
        <div className="grid grid-cols-1 gap-1">
          <Toggle
            pressed={drawingMode === "connect"}
            onPressedChange={() => onDrawingModeChange("connect")}
            aria-label="Connect roads"
            className="flex flex-col items-center gap-1 h-12 text-xs"
          >
            <Link size={16} />
            <span>Connect</span>
          </Toggle>
          <Toggle
            pressed={drawingMode === "disconnect"}
            onPressedChange={() => onDrawingModeChange("disconnect")}
            aria-label="Disconnect roads"
            className="flex flex-col items-center gap-1 h-12 text-xs"
          >
            <Unlink size={16} />
            <span>Disconnect</span>
          </Toggle>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Select</h3>
        <div className="grid grid-cols-1 gap-1">
          <Toggle
            pressed={drawingMode === "select"}
            onPressedChange={() => onDrawingModeChange("select")}
            aria-label="Select mode - select nodes, roads, and polygons"
            className="flex flex-col items-center gap-1 h-12 text-xs"
          >
            <MousePointer size={16} />
            <span>Select All</span>
          </Toggle>
          <Toggle
            pressed={drawingMode === "pan"}
            onPressedChange={() => onDrawingModeChange("pan")}
            aria-label="Pan mode"
            className="flex flex-col items-center gap-1 h-12 text-xs"
          >
            <Hand size={16} />
            <span>Pan View</span>
          </Toggle>
        </div>
      </div>
    </div>
  )
}