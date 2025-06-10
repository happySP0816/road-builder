"use client"

import { Toggle } from "@/components/ui/toggle"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff, Ruler, Type, Upload, Trash2, Move, RotateCw } from "lucide-react"
import { useState, useRef, useCallback } from "react"
import { type BackgroundImage } from "@/lib/road-types"

interface ViewSettingsProps {
  showRoadLengths: boolean
  showRoadNames: boolean
  showPolygons: boolean
  onShowRoadLengthsChange: (show: boolean) => void
  onShowRoadNamesChange: (show: boolean) => void
  onShowPolygonsChange: (show: boolean) => void
  // Background image props
  drawingMode?: string
  backgroundImages?: BackgroundImage[]
  showBackgroundLayer?: boolean
  selectedBackgroundImageId?: string | null
  onAddBackgroundImage?: (image: BackgroundImage) => void
  onUpdateBackgroundImage?: (id: string, updates: Partial<BackgroundImage>) => void
  onRemoveBackgroundImage?: (id: string) => void
  onToggleBackgroundLayer?: (show: boolean) => void
  onSelectBackgroundImage?: (id: string | null) => void
}

export default function ViewSettings({
  showRoadLengths,
  showRoadNames,
  showPolygons,
  onShowRoadLengthsChange,
  onShowRoadNamesChange,
  onShowPolygonsChange,
  drawingMode,
  backgroundImages = [],
  showBackgroundLayer = true,
  selectedBackgroundImageId,
  onAddBackgroundImage,
  onUpdateBackgroundImage,
  onRemoveBackgroundImage,
  onToggleBackgroundLayer,
  onSelectBackgroundImage,
}: ViewSettingsProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedImage = backgroundImages.find(img => img.id === selectedBackgroundImageId)

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || !onAddBackgroundImage) return

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
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Display Options</h3>
        
        {/* Background Images Section - Show when background-image mode is selected */}
        {drawingMode === "background-image" && (
          <div className="space-y-4 border-b pb-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Background Images</Label>
              {onToggleBackgroundLayer && (
                <Toggle
                  pressed={showBackgroundLayer}
                  onPressedChange={onToggleBackgroundLayer}
                  aria-label="Toggle background layer"
                  size="sm"
                >
                  {showBackgroundLayer ? <Eye size={16} /> : <EyeOff size={16} />}
                </Toggle>
              )}
            </div>

            {/* File Upload Area */}
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                isDragOver
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto h-6 w-6 text-gray-400 mb-2" />
              <p className="text-xs text-gray-600 mb-2">
                Drag & drop images here, or{' '}
                <button
                  onClick={handleUploadClick}
                  className="text-blue-600 hover:text-blue-700 underline"
                >
                  click to browse
                </button>
              </p>
              <p className="text-xs text-gray-500">
                JPG, PNG, GIF, WebP
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
                <Label className="text-xs font-medium">Images ({backgroundImages.length})</Label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {backgroundImages.map((image) => (
                    <div
                      key={image.id}
                      className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                        selectedBackgroundImageId === image.id
                          ? 'border-blue-400 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => onSelectBackgroundImage?.(image.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{image.name}</p>
                        <p className="text-xs text-gray-500">
                          {Math.round(image.width)} × {Math.round(image.height)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Toggle
                          pressed={image.visible}
                          onPressedChange={(visible) => 
                            onUpdateBackgroundImage?.(image.id, { visible })
                          }
                          size="sm"
                          aria-label="Toggle image visibility"
                        >
                          {image.visible ? <Eye size={10} /> : <EyeOff size={10} />}
                        </Toggle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            onRemoveBackgroundImage?.(image.id)
                          }}
                          className="h-5 w-5 p-0"
                        >
                          <Trash2 size={10} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Image Controls */}
            {selectedImage && onUpdateBackgroundImage && (
              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center gap-2">
                  <Move size={12} className="text-gray-500" />
                  <Label className="text-xs font-medium">Editing: {selectedImage.name}</Label>
                </div>

                {/* Position Controls */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="image-x" className="text-xs">X</Label>
                    <Input
                      id="image-x"
                      type="number"
                      value={Math.round(selectedImage.x)}
                      onChange={(e) => 
                        onUpdateBackgroundImage(selectedImage.id, { x: Number(e.target.value) })
                      }
                      className="text-xs h-7"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="image-y" className="text-xs">Y</Label>
                    <Input
                      id="image-y"
                      type="number"
                      value={Math.round(selectedImage.y)}
                      onChange={(e) => 
                        onUpdateBackgroundImage(selectedImage.id, { y: Number(e.target.value) })
                      }
                      className="text-xs h-7"
                    />
                  </div>
                </div>

                {/* Size Controls */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="image-width" className="text-xs">Width</Label>
                    <Input
                      id="image-width"
                      type="number"
                      value={Math.round(selectedImage.width)}
                      onChange={(e) => 
                        onUpdateBackgroundImage(selectedImage.id, { width: Number(e.target.value) })
                      }
                      className="text-xs h-7"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="image-height" className="text-xs">Height</Label>
                    <Input
                      id="image-height"
                      type="number"
                      value={Math.round(selectedImage.height)}
                      onChange={(e) => 
                        onUpdateBackgroundImage(selectedImage.id, { height: Number(e.target.value) })
                      }
                      className="text-xs h-7"
                    />
                  </div>
                </div>

                {/* Opacity Control */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Opacity</Label>
                    <Badge variant="secondary" className="text-xs">{Math.round(selectedImage.opacity * 100)}%</Badge>
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
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">{selectedImage.rotation}°</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => 
                          onUpdateBackgroundImage(selectedImage.id, { rotation: 0 })
                        }
                        className="h-5 w-5 p-0"
                      >
                        <RotateCw size={10} />
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

                {/* Reset Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-7"
                  onClick={() => 
                    onUpdateBackgroundImage(selectedImage.id, {
                      width: selectedImage.originalWidth,
                      height: selectedImage.originalHeight,
                      rotation: 0,
                    })
                  }
                >
                  Reset Size
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Regular Display Options */}
        <div className="space-y-3">
          <Toggle
            pressed={showRoadLengths}
            onPressedChange={onShowRoadLengthsChange}
            aria-label="Show road lengths"
            className="flex items-center justify-start gap-2 w-full h-8"
          >
            <Ruler size={16} />
            <span className="text-sm">Show Lengths</span>
          </Toggle>
          
          <Toggle
            pressed={showRoadNames}
            onPressedChange={onShowRoadNamesChange}
            aria-label="Show road names"
            className="flex items-center justify-start gap-2 w-full h-8"
          >
            <Type size={16} />
            <span className="text-sm">Show Names</span>
          </Toggle>
          
          <Toggle
            pressed={showPolygons}
            onPressedChange={onShowPolygonsChange}
            aria-label="Show polygons"
            className="flex items-center justify-start gap-2 w-full h-8"
          >
            <Eye size={16} />
            <span className="text-sm">Show Polygons</span>
          </Toggle>
        </div>
      </div>
    </div>
  )
}