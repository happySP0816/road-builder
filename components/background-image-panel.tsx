"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Toggle } from "@/components/ui/toggle"
import { 
  Upload, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Trash2, 
  RotateCw,
  Move,
  Maximize2
} from "lucide-react"
import type { BackgroundImage } from "@/lib/road-types"

interface BackgroundImagePanelProps {
  backgroundImages: BackgroundImage[]
  selectedBackgroundId: string | null
  showBackgrounds: boolean
  onAddBackgroundImage: (file: File) => void
  onUpdateBackgroundImage: (id: string, updates: Partial<BackgroundImage>) => void
  onDeleteBackgroundImage: (id: string) => void
  onSelectBackgroundImage: (id: string | null) => void
  onToggleBackgrounds: (show: boolean) => void
}

export default function BackgroundImagePanel({
  backgroundImages,
  selectedBackgroundId,
  showBackgrounds,
  onAddBackgroundImage,
  onUpdateBackgroundImage,
  onDeleteBackgroundImage,
  onSelectBackgroundImage,
  onToggleBackgrounds,
}: BackgroundImagePanelProps) {
  const [dragOver, setDragOver] = useState(false)
  
  const selectedImage = selectedBackgroundId 
    ? backgroundImages.find(img => img.id === selectedBackgroundId)
    : null

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      onAddBackgroundImage(file)
    }
    // Reset input
    event.target.value = ''
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    
    const file = event.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      onAddBackgroundImage(file)
    }
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  return (
    <div className="space-y-6">
      {/* Background Layer Toggle */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Background Layer</h3>
        <div className="flex items-center gap-2">
          <Toggle
            pressed={showBackgrounds}
            onPressedChange={onToggleBackgrounds}
            aria-label="Toggle background visibility"
            className="flex items-center gap-2"
          >
            {showBackgrounds ? <Eye size={16} /> : <EyeOff size={16} />}
            <span className="text-xs">{showBackgrounds ? 'Visible' : 'Hidden'}</span>
          </Toggle>
          <Badge variant="secondary" className="text-xs">
            {backgroundImages.length} image{backgroundImages.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      {/* Upload Area */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Add Background</h3>
        <div
          className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
            dragOver 
              ? 'border-blue-400 bg-blue-50' 
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
          <p className="text-sm text-gray-600 mb-2">
            Drag & drop an image or click to browse
          </p>
          <Input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
            id="background-upload"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById('background-upload')?.click()}
          >
            Choose File
          </Button>
        </div>
      </div>

      {/* Background Images List */}
      {backgroundImages.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Background Images</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {backgroundImages.map((image) => (
              <div
                key={image.id}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedBackgroundId === image.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => onSelectBackgroundImage(
                  selectedBackgroundId === image.id ? null : image.id
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium truncate flex-1">
                    {image.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        onUpdateBackgroundImage(image.id, { visible: !image.visible })
                      }}
                    >
                      {image.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        onUpdateBackgroundImage(image.id, { locked: !image.locked })
                      }}
                    >
                      {image.locked ? <Lock size={12} /> : <Unlock size={12} />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteBackgroundImage(image.id)
                      }}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Badge variant="outline" className="text-xs">
                    {Math.round(image.opacity * 100)}%
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {Math.round(image.width)}×{Math.round(image.height)}
                  </Badge>
                  {image.rotation !== 0 && (
                    <Badge variant="outline" className="text-xs">
                      {Math.round(image.rotation)}°
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected Image Controls */}
      {selectedImage && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Edit: {selectedImage.name}
          </h3>
          
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="image-name" className="text-sm font-medium">Name</Label>
            <Input
              id="image-name"
              type="text"
              value={selectedImage.name}
              onChange={(e) => onUpdateBackgroundImage(selectedImage.id, { name: e.target.value })}
              className="text-sm"
            />
          </div>

          {/* Position */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Move size={14} />
              Position
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="image-x" className="text-xs text-gray-500">X</Label>
                <Input
                  id="image-x"
                  type="number"
                  value={Math.round(selectedImage.x)}
                  onChange={(e) => onUpdateBackgroundImage(selectedImage.id, { x: Number(e.target.value) })}
                  className="text-sm"
                />
              </div>
              <div>
                <Label htmlFor="image-y" className="text-xs text-gray-500">Y</Label>
                <Input
                  id="image-y"
                  type="number"
                  value={Math.round(selectedImage.y)}
                  onChange={(e) => onUpdateBackgroundImage(selectedImage.id, { y: Number(e.target.value) })}
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          {/* Size */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Maximize2 size={14} />
              Size
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="image-width" className="text-xs text-gray-500">Width</Label>
                <Input
                  id="image-width"
                  type="number"
                  value={Math.round(selectedImage.width)}
                  onChange={(e) => onUpdateBackgroundImage(selectedImage.id, { width: Number(e.target.value) })}
                  className="text-sm"
                />
              </div>
              <div>
                <Label htmlFor="image-height" className="text-xs text-gray-500">Height</Label>
                <Input
                  id="image-height"
                  type="number"
                  value={Math.round(selectedImage.height)}
                  onChange={(e) => onUpdateBackgroundImage(selectedImage.id, { height: Number(e.target.value) })}
                  className="text-sm"
                />
              </div>
            </div>
            {selectedImage.originalWidth && selectedImage.originalHeight && (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => onUpdateBackgroundImage(selectedImage.id, {
                  width: selectedImage.originalWidth!,
                  height: selectedImage.originalHeight!
                })}
              >
                Reset to Original Size
              </Button>
            )}
          </div>

          {/* Rotation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                <RotateCw size={14} />
                Rotation
              </Label>
              <Badge variant="secondary">{Math.round(selectedImage.rotation)}°</Badge>
            </div>
            <Slider
              value={[selectedImage.rotation]}
              min={-180}
              max={180}
              step={1}
              onValueChange={(value) => onUpdateBackgroundImage(selectedImage.id, { rotation: value[0] })}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => onUpdateBackgroundImage(selectedImage.id, { rotation: 0 })}
            >
              Reset Rotation
            </Button>
          </div>

          {/* Opacity */}
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

          {/* Lock/Unlock */}
          <div className="flex items-center gap-2">
            <Toggle
              pressed={selectedImage.locked}
              onPressedChange={(locked) => onUpdateBackgroundImage(selectedImage.id, { locked })}
              aria-label="Lock image"
              className="flex items-center gap-2"
            >
              {selectedImage.locked ? <Lock size={16} /> : <Unlock size={16} />}
              <span className="text-xs">{selectedImage.locked ? 'Locked' : 'Unlocked'}</span>
            </Toggle>
          </div>
        </div>
      )}
    </div>
  )
}