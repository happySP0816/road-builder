import { Toggle } from "@/components/ui/toggle"
import { MousePointer2, MousePointer, Move } from "lucide-react" // Removed PenTool

interface DrawingToolsProps {
  // Updated drawingMode type
  drawingMode: "nodes" | "pan" | "move" | "select-node"
  onDrawingModeChange: (mode: "nodes" | "pan" | "move" | "select-node") => void
}

export default function DrawingTools({ drawingMode, onDrawingModeChange }: DrawingToolsProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Drawing Tools</h3>
        {/* Simplified to only show Build mode as bezier is integrated */}
        <div className="grid grid-cols-1 gap-2">
          <Toggle
            pressed={drawingMode === "nodes"}
            onPressedChange={() => onDrawingModeChange("nodes")}
            aria-label="Build mode" // Changed label
            className="flex flex-col items-center gap-1 h-16"
          >
            <MousePointer2 size={20} />
            <span className="text-xs">Build</span>
          </Toggle>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Selection Tools</h3>
        <div className="grid grid-cols-2 gap-2">
          <Toggle
            pressed={drawingMode === "select-node"}
            onPressedChange={() => onDrawingModeChange("select-node")}
            aria-label="Select node mode"
            className="flex flex-col items-center gap-1 h-16"
          >
            <MousePointer size={20} />
            <span className="text-xs">Nodes</span>
          </Toggle>
          <Toggle
            pressed={drawingMode === "move"}
            onPressedChange={() => onDrawingModeChange("move")}
            aria-label="Select road mode"
            className="flex flex-col items-center gap-1 h-16"
          >
            <Move size={20} />
            <span className="text-xs">Roads</span>
          </Toggle>
        </div>
        <Toggle
          pressed={drawingMode === "pan"}
          onPressedChange={() => onDrawingModeChange("pan")}
          aria-label="Pan mode"
          className="flex flex-col items-center gap-1 h-12 w-full"
        >
          <Move size={20} />
          <span className="text-xs">Pan View</span>
        </Toggle>
      </div>
    </div>
  )
}
