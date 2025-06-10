"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import { 
  Upload, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Trash2, 
  RotateCw, 
  Move, 
  Maximize2,
  Link,
  Unlink
} from "lucide-react"
import type { BackgroundImage } from "@/lib/road-types"

interface BackgroundImagePanelProps {
  backgroundImages: BackgroundImage[]
  showBackgroundLayer: boolean
  selectedBackgroundImageId: string | null
  onToggleBackgroundLayer: () => void
  onAddBackgroundImage: (file: File) => void
  onUpdateBackgroundImage: (id: string, updates: Partial<BackgroundImage>) => void
  onDeleteBackgroundImage: (id: string) => void
  onSelectBackgroundImage: (id: string | null) => void
}

export default function BackgroundImagePanel({
  backgroundImages,
  showBackgroundLayer,
  selectedBackgroundImageId,
  onToggleBackgroundLayer,
  onAddBackgroundImage,
  onUpdateBackgroundImage,
  onDeleteBackgroundImage,
  onSelectBackgroundImage,
}: BackgroundImagePanelProps) {
  const selectedImage = backgroundImages.find(img => img.id === selectedBackgroundImageId)

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      onAddBackgroundImage(file)
    }
    // Reset input
    event.target.value = ''
  }

  const resetImageTransform = (imageId: string) => {
    const image = backgroundImages.find(img => img.id === imageId)
    if (image) {
      onUpdateBackgroundImage(imageId, {
        x: 0,
        y: 0,
        width: image.originalWidth,
        height: image.originalHeight,
        rotation: 0,
        opacity: 1
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Background Images</h3>
          <Toggle
            pressed={showBackgroundLayer}
            onPressedChange={onToggleBackgroundLayer}
            aria-label="Toggle background layer visibility"
            size="sm"
          >
            {showBackgroundLayer ? <Eye size={16} /> : <EyeOff size={16} />}
          </Toggle>
        </div>

        {/* Upload Button */}
        <div className="space-y-2">
          <Label htmlFor="background-upload" className="text-sm font-medium">Add Background Image</Label>
          <div className="relative">
            <Input
              id="background-upload"
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => document.getElementById('background-upload')?.click()}
            >
              <Upload size={16} className="mr-2" />
              Upload Image
            </Button>
          </div>
        </div>

        {/* Image List */}
        {backgroundImages.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Image Layers ({backgroundImages.length})</Label>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {backgroundImages.map((image, index) => (
                <div
                  key={image.id}
                  className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    selectedBackgroundImageId === image.id 
                      ? 'bg-blue-50 border-blue-200' 
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}
                  onClick={() => onSelectBackgroundImage(image.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{image.name}</div>
                    <div className="text-xs text-gray-500">Layer {backgroundImages.length - index}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Toggle
                      pressed={image.visible}
                      onPressedChange={(visible) => onUpdateBackgroundImage(image.id, { visible })}
                      size="sm"
                      className="h-6 w-6 p-0"
                    >
                      {image.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                    </Toggle>
                    <Toggle
                      pressed={image.locked}
                      onPressedChange={(locked) => onUpdateBackgroundImage(image.id, { locked })}
                      size="sm"
                      className="h-6 w-6 p-0"
                    >
                      {image.locked ? <Lock size={12} /> : <Unlock size={12} />}
                    </Toggle>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selected Image Controls */}
        {selectedImage && (
          <>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Edit: {selectedImage.name}</h4>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDeleteBackgroundImage(selectedImage.id)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>

              {/* Position Controls */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Move size={14} />
                  Position
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="pos-x" className="text-xs">X</Label>
                    <Input
                      id="pos-x"
                      type="number"
                      value={Math.round(selectedImage.x)}
                      onChange={(e) => onUpdateBackgroundImage(selectedImage.id, { x: Number(e.target.value) })}
                      className="text-xs h-8"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pos-y" className="text-xs">Y</Label>
                    <Input
                      id="pos-y"
                      type="number"
                      value={Math.round(selectedImage.y)}
                      onChange={(e) => onUpdateBackgroundImage(selectedImage.id, { y: Number(e.target.value) })}
                      className="text-xs h-8"
                    />
                  </div>
                </div>
              </div>

              {/* Size Controls */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Maximize2 size={14} />
                    Size
                  </Label>
                  <Toggle
                    pressed={selectedImage.maintainAspectRatio}
                    onPressedChange={(maintainAspectRatio) => onUpdateBackgroundImage(selectedImage.id, { maintainAspectRatio })}
                    size="sm"
                    className="h-6 w-6 p-0"
                  >
                    {selectedImage.maintainAspectRatio ? <Link size={12} /> : <Unlink size={12} />}
                  </Toggle>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="size-w" className="text-xs">Width</Label>
                    <Input
                      id="size-w"
                      type="number"
                      value={Math.round(selectedImage.width)}
                      onChange={(e) => {
                        const newWidth = Number(e.target.value)
                        const updates: Partial<BackgroundImage> = { width: newWidth }
                        if (selectedImage.maintainAspectRatio) {
                          const aspectRatio = selectedImage.originalWidth / selectedImage.originalHeight
                          updates.height = newWidth / aspectRatio
                        }
                        onUpdateBackgroundImage(selectedImage.id, updates)
                      }}
                      className="text-xs h-8"
                    />
                  </div>
                  <div>
                    <Label htmlFor="size-h" className="text-xs">Height</Label>
                    <Input
                      id="size-h"
                      type="number"
                      value={Math.round(selectedImage.height)}
                      onChange={(e) => {
                        const newHeight = Number(e.target.value)
                        const updates: Partial<BackgroundImage> = { height: newHeight }
                        if (selectedImage.maintainAspectRatio) {
                          const aspectRatio = selectedImage.originalWidth / selectedImage.originalHeight
                          updates.width = newHeight * aspectRatio
                        }
                        onUpdateBackgroundImage(selectedImage.id, updates)
                      }}
                      className="text-xs h-8"
                    />
                  </div>
                </div>
              </div>

              {/* Rotation Control */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <RotateCw size={14} />
                    Rotation
                  </Label>
                  <Badge variant="secondary">{selectedImage.rotation}°</Badge>
                </div>
                <Slider
                  value={[selectedImage.rotation]}
                  min={-180}
                  max={180}
                  step={1}
                  onValueChange={(value) => onUpdateBackgroundImage(selectedImage.id, { rotation: value[0] })}
                />
              </div>

              {/* Opacity Control */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Opacity</Label>
                  <Badge variant="secondary">{Math.round(selectedImage.opacity * 100)}%</Badge>
                </div>
                <Slider
                  value={[selectedImage.opacity]}
                  min={0.1}
                  max={1}
                  step={0.1}
                  onValueChange={(value) => onUpdateBackgroundImage(selectedImage.id, { opacity: value[0] })}
                />
              </div>

              {/* Reset Button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => resetImageTransform(selectedImage.id)}
              >
                Reset Transform
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}