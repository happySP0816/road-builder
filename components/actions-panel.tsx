"use client"

import { Button } from "@/components/ui/button"
import { Undo2, Trash2 } from "lucide-react"

interface ActionsPanelProps {
  onRemoveLastElement: () => void
  onClearCanvas: () => void
}

export default function ActionsPanel({ onRemoveLastElement, onClearCanvas }: ActionsPanelProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Actions</h3>
      <div className="space-y-2">
        <Button variant="outline" size="sm" className="w-full justify-start" onClick={onRemoveLastElement}>
          <Undo2 size={16} className="mr-2" /> Undo Last
        </Button>
        <Button variant="outline" size="sm" className="w-full justify-start" onClick={onClearCanvas}>
          <Trash2 size={16} className="mr-2" /> Clear All
        </Button>
      </div>
    </div>
  )
}
