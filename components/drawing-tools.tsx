"use client"

import { Toggle } from "@/components/ui/toggle"
import { MousePointer2, MousePointer, Hand, Link, Unlink, Plus, Hexagon, Edit } from "lucide-react"

interface DrawingToolsProps {
  drawingMode: "nodes" | "pan" | "select" | "connect" | "disconnect" | "add-node" | "polygon"
  onDrawingModeChange: (mode: "nodes" | "pan" | "select" | "connect" | "disconnect" | "add-node" | "polygon") => void
}

export default function DrawingTools({ drawingMode, onDrawingModeChange }: DrawingToolsProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Drawing Tools</h3>
        <div className="grid grid-cols-2 gap-2">
          <Toggle
            pressed={drawingMode === "nodes"}
            onPressedChange={() => onDrawingModeChange("nodes")}
            aria-label="Build mode"
            className="flex flex-col items-center gap-1 h-16"
          >
            <MousePointer2 size={20} />
            <span className="text-xs">Build</span>
          </Toggle>
          <Toggle
            pressed={drawingMode === "add-node"}
            onPressedChange={() => onDrawingModeChange("add-node")}
            aria-label="Add node mode"
            className="flex flex-col items-center gap-1 h-16"
          >
            <Plus size={20} />
            <span className="text-xs">Add Node</span>
          </Toggle>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Polygon Tools</h3>
        <div className="grid grid-cols-1 gap-2">
          <Toggle
            pressed={drawingMode === "polygon"}
            onPressedChange={() => onDrawingModeChange("polygon")}
            aria-label="Draw polygon"
            className="flex flex-col items-center gap-1 h-16"
          >
            <Hexagon size={20} />
            <span className="text-xs">Draw Polygon</span>
          </Toggle>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Connection Tools</h3>
        <div className="grid grid-cols-2 gap-2">
          <Toggle
            pressed={drawingMode === "connect"}
            onPressedChange={() => onDrawingModeChange("connect")}
            aria-label="Connect roads"
            className="flex flex-col items-center gap-1 h-16"
          >
            <Link size={20} />
            <span className="text-xs">Connect</span>
          </Toggle>
          <Toggle
            pressed={drawingMode === "disconnect"}
            onPressedChange={() => onDrawingModeChange("disconnect")}
            aria-label="Disconnect roads"
            className="flex flex-col items-center gap-1 h-16"
          >
            <Unlink size={20} />
            <span className="text-xs">Disconnect</span>
          </Toggle>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Selection Tools</h3>
        <div className="grid grid-cols-1 gap-2">
          <Toggle
            pressed={drawingMode === "select"}
            onPressedChange={() => onDrawingModeChange("select")}
            aria-label="Select mode - select nodes, roads, and polygons"
            className="flex flex-col items-center gap-1 h-16"
          >
            <MousePointer size={20} />
            <span className="text-xs">Select All</span>
          </Toggle>
        </div>
        <Toggle
          pressed={drawingMode === "pan"}
          onPressedChange={() => onDrawingModeChange("pan")}
          aria-label="Pan mode"
          className="flex flex-col items-center gap-1 h-12 w-full"
        >
          <Hand size={20} />
          <span className="text-xs">Pan View</span>
        </Toggle>
      </div>
    </div>
  )
}