import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { MapPin } from "lucide-react"

interface MapNameModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (name: string) => void
}

export default function MapNameModal({ isOpen, onClose, onSave }: MapNameModalProps) {
  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)
    const mapName = formData.get('mapName') as string
    if (mapName.trim()) {
      onSave(mapName.trim())
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 transform transition-all animate-in fade-in slide-in-from-bottom-4">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-blue-100 p-3 rounded-full">
              <MapPin className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Save Your Map</h3>
              <p className="text-sm text-gray-500">Give your map a memorable name</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                name="mapName"
                placeholder="Enter map name..."
                className="w-full"
                autoFocus
                required
              />
            </div>
            
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Save Map
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
} 