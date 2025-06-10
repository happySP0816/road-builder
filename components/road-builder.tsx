"use client"

import { useState, useCallback, useRef, useEffect, type MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import { Eye, EyeOff, Ruler, Type } from "lucide-react"
import RoadCanvas from "./road-canvas"
import DrawingTools from "./drawing-tools"
import RoadSettings from "./road-settings"
import PolygonSettings from "./polygon-settings"
import ActionsPanel from "./actions-panel"
import SelectedItemPanel from "./selected-item-panel"
import SelectedPolygonPanel from "./selected-polygon-panel"
import BackgroundImagePanel from "./background-image-panel"
import StatusBar from "./status-bar"
import { 
  type Road, 
  type Node, 
  type BuildSession, 
  type PolygonSession, 
  type Polygon,
  type BackgroundImage,
  RoadType 
} from "@/lib/road-types"

export default function RoadBuilder() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [polygons, setPolygons] = useState<Polygon[]>([])
  const [backgroundImages, setBackgroundImages] = useState<BackgroundImage[]>([])
  const [drawingMode, setDrawingMode] = useState<"nodes" | "pan" | "select" | "connect" | "disconnect" | "add-node" | "polygon" | "background-image">("nodes")
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snapDistance, setSnapDistance] = useState(20)
  const [defaultRoadWidth, setDefaultRoadWidth] = useState(12)
  const [showRoadLengths, setShowRoadLengths] = useState(true)
  const [showRoadNames, setShowRoadNames] = useState(true)
  const [showPolygons, setShowPolygons] = useState(true)
  const [showBackgroundLayer, setShowBackgroundLayer] = useState(true)
  const [scaleMetersPerPixel, setScaleMetersPerPixel] = useState(0.1)
  const [curvedRoads, setCurvedRoads] = useState(false)
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null)
  const [selectedBackgroundImageId, setSelectedBackgroundImageId] = useState<string | null>(null)
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null)
  const [selectedRoadForDisconnect, setSelectedRoadForDisconnect] = useState<string | null>(null)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [isActivelyDrawingCurve, setIsActivelyDrawingCurve] = useState(false)

  // Polygon drawing settings
  const [polygonFillColor, setPolygonFillColor] = useState("#3b82f6")
  const [polygonStrokeColor, setPolygonStrokeColor] = useState("#1e40af")
  const [polygonOpacity, setPolygonOpacity] = useState(0.3)

  const [buildSession, setBuildSession] = useState<BuildSession>({
    nodes: [],
    isActive: false,
    roadType: RoadType.STRAIGHT,
    roadWidth: defaultRoadWidth,
  })

  const [polygonSession, setPolygonSession] = useState<PolygonSession>({
    points: [],
    roadIds: [],
    isActive: false,
    fillColor: polygonFillColor,
    strokeColor: polygonStrokeColor,
    opacity: polygonOpacity,
  })

  const selectedNodeData = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) || null : null
  const selectedRoad = selectedRoadId ? roads.find(r => r.id === selectedRoadId) || null : null
  const selectedPolygon = selectedPolygonId ? polygons.find(p => p.id === selectedPolygonId) || null : null

  // Background image handlers
  const handleAddBackgroundImage = useCallback((image: BackgroundImage) => {
    setBackgroundImages(prev => [...prev, image])
    setSelectedBackgroundImageId(image.id)
  }, [])

  const handleUpdateBackgroundImage = useCallback((id: string, updates: Partial<BackgroundImage>) => {
    setBackgroundImages(prev => 
      prev.map(img => img.id === id ? { ...img, ...updates } : img)
    )
  }, [])

  const handleRemoveBackgroundImage = useCallback((id: string) => {
    setBackgroundImages(prev => prev.filter(img => img.id !== id))
    if (selectedBackgroundImageId === id) {
      setSelectedBackgroundImageId(null)
    }
  }, [selectedBackgroundImageId])

  const handleSelectBackgroundImage = useCallback((id: string | null) => {
    setSelectedBackgroundImageId(id)
  }, [])

  const handleToggleBackgroundLayer = useCallback((show: boolean) => {
    setShowBackgroundLayer(show)
  }, [])

  // Canvas event handlers
  const handleMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    // Canvas mouse down logic here
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    // Canvas mouse move logic here
  }, [])

  const handleMouseUp = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    // Canvas mouse up logic here
  }, [])

  const handleCompleteBuildSession = useCallback(() => {
    setBuildSession(prev => ({ ...prev, isActive: false, nodes: [] }))
  }, [])

  const handleCancelBuildSession = useCallback(() => {
    setBuildSession(prev => ({ ...prev, isActive: false, nodes: [] }))
  }, [])

  const handleCompletePolygonSession = useCallback(() => {
    setPolygonSession(prev => ({ ...prev, isActive: false, points: [], roadIds: [] }))
  }, [])

  const handleCancelPolygonSession = useCallback(() => {
    setPolygonSession(prev => ({ ...prev, isActive: false, points: [], roadIds: [] }))
  }, [])

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev * 1.2, 5))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev / 1.2, 0.1))
  }, [])

  const handleResetZoom = useCallback(() => {
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
  }, [])

  const handleRemoveLastElement = useCallback(() => {
    // Remove last element logic
  }, [])

  const handleClearCanvas = useCallback(() => {
    setNodes([])
    setRoads([])
    setPolygons([])
    setSelectedRoadId(null)
    setSelectedNodeId(null)
    setSelectedPolygonId(null)
  }, [])

  const handleDeleteRoad = useCallback((roadId: string) => {
    setRoads(prev => prev.filter(r => r.id !== roadId))
    setSelectedRoadId(null)
  }, [])

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId))
    setSelectedNodeId(null)
  }, [])

  const handleDeletePolygon = useCallback((polygonId: string) => {
    setPolygons(prev => prev.filter(p => p.id !== polygonId))
    setSelectedPolygonId(null)
  }, [])

  const calculateRoadLength = useCallback((road: Road): number => {
    if (road.type === RoadType.BEZIER && road.controlPoints) {
      let len = 0
      const steps = 20
      let p0 = road.start
      for (let i = 1; i <= steps; i++) {
        const t = i / steps,
          mt = 1 - t
        const x =
          mt * mt * mt * road.start.x +
          3 * mt * mt * t * road.controlPoints[0].x +
          3 * mt * t * t * road.controlPoints[1].x +
          t * t * t * road.end.x
        const y =
          mt * mt * mt * road.start.y +
          3 * mt * mt * t * road.controlPoints[0].y +
          3 * mt * t * t * road.controlPoints[1].y +
          t * t * t * road.end.y
        const p1 = { x, y }
        len += Math.sqrt(Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2))
        p0 = p1
      }
      return len * scaleMetersPerPixel
    }
    const dx = road.end.x - road.start.x
    const dy = road.end.y - road.start.y
    return Math.sqrt(dx * dx + dy * dy) * scaleMetersPerPixel
  }, [scaleMetersPerPixel])

  const handleUpdateRoadWidth = useCallback((roadId: string, newWidth: number) => {
    setRoads(prev => 
      prev.map(road => road.id === roadId ? { ...road, width: newWidth } : road)
    )
  }, [])

  const handleUpdateRoadName = useCallback((roadId: string, newName: string) => {
    setRoads(prev => 
      prev.map(road => road.id === roadId ? { ...road, name: newName } : road)
    )
  }, [])

  const handleUpdatePolygonName = useCallback((polygonId: string, newName: string) => {
    setPolygons(prev => 
      prev.map(polygon => polygon.id === polygonId ? { ...polygon, name: newName } : polygon)
    )
  }, [])

  const handleUpdatePolygonFillColor = useCallback((polygonId: string, newColor: string) => {
    setPolygons(prev => 
      prev.map(polygon => polygon.id === polygonId ? { ...polygon, fillColor: newColor } : polygon)
    )
  }, [])

  const handleUpdatePolygonStrokeColor = useCallback((polygonId: string, newColor: string) => {
    setPolygons(prev => 
      prev.map(polygon => polygon.id === polygonId ? { ...polygon, strokeColor: newColor } : polygon)
    )
  }, [])

  const handleUpdatePolygonOpacity = useCallback((polygonId: string, newOpacity: number) => {
    setPolygons(prev => 
      prev.map(polygon => polygon.id === polygonId ? { ...polygon, opacity: newOpacity } : polygon)
    )
  }, [])

  const totalLength = roads.reduce((sum, road) => sum + calculateRoadLength(road), 0)
  const totalArea = polygons.reduce((sum, polygon) => sum + (polygon.area || 0), 0)

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Road Map Builder</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <DrawingTools 
            drawingMode={drawingMode} 
            onDrawingModeChange={setDrawingMode} 
          />
          
          <Separator />
          
          <RoadSettings
            defaultRoadWidth={defaultRoadWidth}
            scaleMetersPerPixel={scaleMetersPerPixel}
            snapDistance={snapDistance}
            curvedRoads={curvedRoads}
            onDefaultRoadWidthChange={setDefaultRoadWidth}
            onScaleChange={setScaleMetersPerPixel}
            onSnapDistanceChange={setSnapDistance}
            onCurvedRoadsChange={setCurvedRoads}
          />

          <Separator />

          <PolygonSettings
            fillColor={polygonFillColor}
            strokeColor={polygonStrokeColor}
            opacity={polygonOpacity}
            onFillColorChange={setPolygonFillColor}
            onStrokeColorChange={setPolygonStrokeColor}
            onOpacityChange={setPolygonOpacity}
          />

          <Separator />

          <ActionsPanel
            onRemoveLastElement={handleRemoveLastElement}
            onClearCanvas={handleClearCanvas}
          />

          <Separator />

          <SelectedItemPanel
            selectedRoad={selectedRoad}
            selectedNode={selectedNodeData}
            onDeleteRoad={handleDeleteRoad}
            onDeleteNode={handleDeleteNode}
            calculateRoadLength={calculateRoadLength}
            onUpdateRoadWidth={handleUpdateRoadWidth}
            onUpdateRoadName={handleUpdateRoadName}
          />

          <SelectedPolygonPanel
            selectedPolygon={selectedPolygon}
            onDeletePolygon={handleDeletePolygon}
            onUpdatePolygonName={handleUpdatePolygonName}
            onUpdatePolygonFillColor={handleUpdatePolygonFillColor}
            onUpdatePolygonStrokeColor={handleUpdatePolygonStrokeColor}
            onUpdatePolygonOpacity={handleUpdatePolygonOpacity}
          />
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col">
        <StatusBar
          roadCount={roads.length}
          nodeCount={nodes.length}
          polygonCount={polygons.length}
          totalLength={totalLength}
          totalArea={totalArea}
          zoom={zoom}
          buildSession={buildSession}
          polygonSession={polygonSession}
        />
        
        <div className="flex-1 flex">
          <RoadCanvas
            nodes={nodes}
            roads={roads}
            polygons={polygons}
            buildSession={buildSession}
            polygonSession={polygonSession}
            drawingMode={drawingMode}
            snapEnabled={snapEnabled}
            snapDistance={snapDistance}
            defaultRoadWidth={defaultRoadWidth}
            showRoadLengths={showRoadLengths}
            showRoadNames={showRoadNames}
            showPolygons={showPolygons}
            scaleMetersPerPixel={scaleMetersPerPixel}
            selectedRoadId={selectedRoadId}
            selectedNodeId={selectedNodeId}
            selectedPolygonId={selectedPolygonId}
            selectedNodeData={selectedNodeData}
            connectingFromNodeId={connectingFromNodeId}
            selectedRoadForDisconnect={selectedRoadForDisconnect}
            panOffset={panOffset}
            zoom={zoom}
            mousePosition={mousePosition}
            isActivelyDrawingCurve={isActivelyDrawingCurve}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onCompleteBuildSession={handleCompleteBuildSession}
            onCancelBuildSession={handleCancelBuildSession}
            onCompletePolygonSession={handleCompletePolygonSession}
            onCancelPolygonSession={handleCancelPolygonSession}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onResetZoom={handleResetZoom}
            onUpdateRoadName={handleUpdateRoadName}
            onUpdatePolygonName={handleUpdatePolygonName}
          />

          {/* Right Sidebar - Show when background image tool is selected */}
          {drawingMode === "background-image" && (
            <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Background Images</h2>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4">
                <BackgroundImagePanel
                  backgroundImages={backgroundImages}
                  showBackgroundLayer={showBackgroundLayer}
                  selectedBackgroundImageId={selectedBackgroundImageId}
                  onAddBackgroundImage={handleAddBackgroundImage}
                  onUpdateBackgroundImage={handleUpdateBackgroundImage}
                  onRemoveBackgroundImage={handleRemoveBackgroundImage}
                  onToggleBackgroundLayer={handleToggleBackgroundLayer}
                  onSelectBackgroundImage={handleSelectBackgroundImage}
                />
              </div>
            </div>
          )}
        </div>

        {/* View Controls */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Toggle
                pressed={showRoadLengths}
                onPressedChange={setShowRoadLengths}
                aria-label="Show road lengths"
                size="sm"
              >
                <Ruler size={16} />
                <span className="ml-1">Lengths</span>
              </Toggle>
              
              <Toggle
                pressed={showRoadNames}
                onPressedChange={setShowRoadNames}
                aria-label="Show road names"
                size="sm"
              >
                <Type size={16} />
                <span className="ml-1">Names</span>
              </Toggle>
              
              <Toggle
                pressed={showPolygons}
                onPressedChange={setShowPolygons}
                aria-label="Show polygons"
                size="sm"
              >
                {showPolygons ? <Eye size={16} /> : <EyeOff size={16} />}
                <span className="ml-1">Polygons</span>
              </Toggle>

              <Toggle
                pressed={showBackgroundLayer}
                onPressedChange={setShowBackgroundLayer}
                aria-label="Show background images"
                size="sm"
              >
                {showBackgroundLayer ? <Eye size={16} /> : <EyeOff size={16} />}
                <span className="ml-1">Background</span>
              </Toggle>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}