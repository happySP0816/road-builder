"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Toggle } from "@/components/ui/toggle"
import { Upload, Eye, EyeOff, Trash2, Move, RotateCw } from "lucide-react"
import { type BackgroundImage } from "@/lib/road-types"

interface BackgroundImagePanelProps {
  backgroundImages: BackgroundImage[]
  showBackgroundLayer: boolean
  selectedBackgroundImageId: string | null
  onAddBackgroundImage: (image: BackgroundImage) => void
  onUpdateBackgroundImage: (id: string, updates: Partial<BackgroundImage>) => void
  onRemoveBackgroundImage: (id: string) => void
  onToggleBackgroundLayer: (show: boolean) => void
  onSelectBackgroundImage: (id: string | null) => void
}

export default function BackgroundImagePanel({
  backgroundImages,
  showBackgroundLayer,
  selectedBackgroundImageId,
  onAddBackgroundImage,
  onUpdateBackgroundImage,
  onRemoveBackgroundImage,
  onToggleBackgroundLayer,
  onSelectBackgroundImage,
}: BackgroundImagePanelProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedImage = backgroundImages.find(img => img.id === selectedBackgroundImageId)

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return

    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const result = e.target?.result as string
          if (result) {
            const img = new Image()
            img.onload = () => {
              const newImage: BackgroundImage = {
                id: `bg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: file.name,
                url: result,
                x: 0,
                y: 0,
                width: img.naturalWidth,
                height: img.naturalHeight,
                originalWidth: img.naturalWidth,
                originalHeight: img.naturalHeight,
                opacity: 0.7,
                rotation: 0,
                visible: true,
              }
              onAddBackgroundImage(newImage)
            }
            img.src = result
          }
        }
        reader.readAsDataURL(file)
      }
    })
  }, [onAddBackgroundImage])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }, [handleFileSelect])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files)
    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [handleFileSelect])

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Background Images</h3>
          <Toggle
            pressed={showBackgroundLayer}
            onPressedChange={onToggleBackgroundLayer}
            aria-label="Toggle background layer"
            size="sm"
          >
            {showBackgroundLayer ? <Eye size={16} /> : <EyeOff size={16} />}
          </Toggle>
        </div>

        {/* File Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            isDragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
          <p className="text-sm text-gray-600 mb-2">
            Drag & drop images here, or{' '}
            <button
              onClick={handleUploadClick}
              className="text-blue-600 hover:text-blue-700 underline"
            >
              click to browse
            </button>
          </p>
          <p className="text-xs text-gray-500">
            Supports: JPG, PNG, GIF, WebP
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
          />
        </div>

        {/* Background Images List */}
        {backgroundImages.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Uploaded Images ({backgroundImages.length})</Label>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {backgroundImages.map((image) => (
                <div
                  key={image.id}
                  className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    selectedBackgroundImageId === image.id
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => onSelectBackgroundImage(image.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{image.name}</p>
                    <p className="text-xs text-gray-500">
                      {image.width} × {image.height}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Toggle
                      pressed={image.visible}
                      onPressedChange={(visible) => 
                        onUpdateBackgroundImage(image.id, { visible })
                      }
                      size="sm"
                      aria-label="Toggle image visibility"
                    >
                      {image.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                    </Toggle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveBackgroundImage(image.id)
                      }}
                      className="h-6 w-6 p-0"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selected Image Controls */}
        {selectedImage && (
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center gap-2">
              <Move size={16} className="text-gray-500" />
              <Label className="text-sm font-medium">Editing: {selectedImage.name}</Label>
            </div>

            {/* Position Controls */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="image-x" className="text-xs">X Position</Label>
                <Input
                  id="image-x"
                  type="number"
                  value={Math.round(selectedImage.x)}
                  onChange={(e) => 
                    onUpdateBackgroundImage(selectedImage.id, { x: Number(e.target.value) })
                  }
                  className="text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="image-y" className="text-xs">Y Position</Label>
                <Input
                  id="image-y"
                  type="number"
                  value={Math.round(selectedImage.y)}
                  onChange={(e) => 
                    onUpdateBackgroundImage(selectedImage.id, { y: Number(e.target.value) })
                  }
                  className="text-xs"
                />
              </div>
            </div>

            {/* Size Controls */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="image-width" className="text-xs">Width</Label>
                <Input
                  id="image-width"
                  type="number"
                  value={Math.round(selectedImage.width)}
                  onChange={(e) => 
                    onUpdateBackgroundImage(selectedImage.id, { width: Number(e.target.value) })
                  }
                  className="text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="image-height" className="text-xs">Height</Label>
                <Input
                  id="image-height"
                  type="number"
                  value={Math.round(selectedImage.height)}
                  onChange={(e) => 
                    onUpdateBackgroundImage(selectedImage.id, { height: Number(e.target.value) })
                  }
                  className="text-xs"
                />
              </div>
            </div>

            {/* Opacity Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Opacity</Label>
                <Badge variant="secondary">{Math.round(selectedImage.opacity * 100)}%</Badge>
              </div>
              <Slider
                value={[selectedImage.opacity]}
                min={0.1}
                max={1}
                step={0.1}
                onValueChange={(value) => 
                  onUpdateBackgroundImage(selectedImage.id, { opacity: value[0] })
                }
              />
            </div>

            {/* Rotation Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Rotation</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{selectedImage.rotation}°</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => 
                      onUpdateBackgroundImage(selectedImage.id, { rotation: 0 })
                    }
                    className="h-6 w-6 p-0"
                  >
                    <RotateCw size={12} />
                  </Button>
                </div>
              </div>
              <Slider
                value={[selectedImage.rotation]}
                min={-180}
                max={180}
                step={15}
                onValueChange={(value) => 
                  onUpdateBackgroundImage(selectedImage.id, { rotation: value[0] })
                }
              />
            </div>

            {/* Reset to Original Size */}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => 
                onUpdateBackgroundImage(selectedImage.id, {
                  width: selectedImage.originalWidth,
                  height: selectedImage.originalHeight,
                  rotation: 0,
                })
              }
            >
              Reset to Original Size
            </Button>
          </div>
        )}

        {backgroundImages.length === 0 && (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">No background images uploaded</p>
          </div>
        )}
      </div>
    </div>
  )
}