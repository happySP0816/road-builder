"use client"

import { useState, useCallback, useRef, useEffect, type MouseEvent } from "react"
import { v4 as uuidv4 } from "uuid"
import RoadCanvas from "./road-canvas"
import DrawingTools from "./drawing-tools"
import RoadSettings from "./road-settings"
import PolygonSettings from "./polygon-settings"
import DisplayOptions from "./display-options"
import ActionsPanel from "./actions-panel"
import SelectedItemPanel from "./selected-item-panel"
import SelectedPolygonPanel from "./selected-polygon-panel"
import BackgroundImagePanel from "./background-image-panel"
import StatusBar from "./status-bar"
import { Button } from "@/components/ui/button"
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
  // Core state
  const [nodes, setNodes] = useState<Node[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [polygons, setPolygons] = useState<Polygon[]>([])
  const [backgroundImages, setBackgroundImages] = useState<BackgroundImage[]>([])
  
  // Drawing state
  const [drawingMode, setDrawingMode] = useState<"nodes" | "pan" | "select" | "connect" | "disconnect" | "add-node" | "polygon" | "background">("nodes")
  const [buildSession, setBuildSession] = useState<BuildSession>({
    nodes: [],
    isActive: false,
    roadType: RoadType.STRAIGHT,
    roadWidth: 15,
  })
  const [polygonSession, setPolygonSession] = useState<PolygonSession>({
    points: [],
    roadIds: [],
    isActive: false,
    fillColor: "#3b82f6",
    strokeColor: "#1e40af",
    opacity: 0.3,
  })

  // Selection state
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null)
  const [selectedBackgroundId, setSelectedBackgroundId] = useState<string | null>(null)
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null)
  const [selectedRoadForDisconnect, setSelectedRoadForDisconnect] = useState<string | null>(null)

  // Settings state
  const [snapEnabled] = useState(true)
  const [snapDistance, setSnapDistance] = useState(20)
  const [defaultRoadWidth, setDefaultRoadWidth] = useState(15)
  const [scaleMetersPerPixel, setScaleMetersPerPixel] = useState(0.1)
  const [curvedRoads, setCurvedRoads] = useState(false)
  const [showRoadLengths, setShowRoadLengths] = useState(true)
  const [showRoadNames, setShowRoadNames] = useState(true)
  const [showPolygons, setShowPolygons] = useState(true)
  const [showBackgrounds, setShowBackgrounds] = useState(true)

  // Polygon settings
  const [polygonFillColor, setPolygonFillColor] = useState("#3b82f6")
  const [polygonStrokeColor, setPolygonStrokeColor] = useState("#1e40af")
  const [polygonOpacity, setPolygonOpacity] = useState(0.3)

  // View state
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [isActivelyDrawingCurve, setIsActivelyDrawingCurve] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)

  // Refs
  const lastActionRef = useRef<string>("")

  // Get selected data
  const selectedNodeData = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) || null : null
  const selectedRoad = selectedRoadId ? roads.find(r => r.id === selectedRoadId) || null : null
  const selectedPolygon = selectedPolygonId ? polygons.find(p => p.id === selectedPolygonId) || null : null

  // Background image functions
  const handleAddBackgroundImage = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    
    img.onload = () => {
      const newImage: BackgroundImage = {
        id: uuidv4(),
        name: file.name.replace(/\.[^/.]+$/, ""), // Remove file extension
        url,
        x: 100, // Default position
        y: 100,
        width: img.naturalWidth,
        height: img.naturalHeight,
        opacity: 1,
        rotation: 0,
        visible: true,
        locked: false,
        originalWidth: img.naturalWidth,
        originalHeight: img.naturalHeight,
      }
      
      setBackgroundImages(prev => [...prev, newImage])
      setSelectedBackgroundId(newImage.id)
    }
    
    img.src = url
  }, [])

  const handleUpdateBackgroundImage = useCallback((id: string, updates: Partial<BackgroundImage>) => {
    setBackgroundImages(prev => 
      prev.map(img => img.id === id ? { ...img, ...updates } : img)
    )
  }, [])

  const handleDeleteBackgroundImage = useCallback((id: string) => {
    setBackgroundImages(prev => {
      const imageToDelete = prev.find(img => img.id === id)
      if (imageToDelete) {
        URL.revokeObjectURL(imageToDelete.url) // Clean up object URL
      }
      return prev.filter(img => img.id !== id)
    })
    
    if (selectedBackgroundId === id) {
      setSelectedBackgroundId(null)
    }
  }, [selectedBackgroundId])

  const handleSelectBackgroundImage = useCallback((id: string | null) => {
    setSelectedBackgroundId(id)
    if (id) {
      // Clear other selections when selecting background
      setSelectedRoadId(null)
      setSelectedNodeId(null)
      setSelectedPolygonId(null)
    }
  }, [])

  // Calculate road length
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

  // Calculate total length and area
  const totalLength = roads.reduce((sum, road) => sum + calculateRoadLength(road), 0)
  const totalArea = polygons.reduce((sum, polygon) => sum + (polygon.area || 0), 0)

  // Mouse event handlers
  const handleMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const canvasX = (x - panOffset.x) / zoom
    const canvasY = (y - panOffset.y) / zoom

    setMousePosition({ x: canvasX, y: canvasY })
    setIsDragging(true)
    setDragStart({ x, y })

    // Handle different drawing modes
    if (drawingMode === "pan") {
      // Pan mode - start dragging
      return
    }

    if (drawingMode === "background" || (drawingMode === "select" && e.target)) {
      // Try to select background image first
      // This will be handled in the canvas component
      return
    }

    // Other modes continue with existing logic...
    // (keeping existing mouse down logic for roads, nodes, polygons)
  }, [drawingMode, panOffset, zoom])

  const handleMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const canvasX = (x - panOffset.x) / zoom
    const canvasY = (y - panOffset.y) / zoom

    setMousePosition({ x: canvasX, y: canvasY })

    if (isDragging && dragStart) {
      if (drawingMode === "pan") {
        const deltaX = x - dragStart.x
        const deltaY = y - dragStart.y
        setPanOffset(prev => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY
        }))
        setDragStart({ x, y })
      }
    }
  }, [isDragging, dragStart, drawingMode, panOffset, zoom])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setDragStart(null)
  }, [])

  // Zoom functions
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

  // Session handlers
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

  // Action handlers
  const handleRemoveLastElement = useCallback(() => {
    if (roads.length > 0) {
      const lastRoad = roads[roads.length - 1]
      setRoads(prev => prev.slice(0, -1))
      lastActionRef.current = `Removed road ${lastRoad.id}`
    } else if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1]
      setNodes(prev => prev.slice(0, -1))
      lastActionRef.current = `Removed node ${lastNode.id}`
    }
  }, [roads, nodes])

  const handleClearCanvas = useCallback(() => {
    setNodes([])
    setRoads([])
    setPolygons([])
    setSelectedRoadId(null)
    setSelectedNodeId(null)
    setSelectedPolygonId(null)
    setSelectedBackgroundId(null)
    setBuildSession(prev => ({ ...prev, isActive: false, nodes: [] }))
    setPolygonSession(prev => ({ ...prev, isActive: false, points: [], roadIds: [] }))
    lastActionRef.current = "Cleared canvas"
  }, [])

  // Delete handlers
  const handleDeleteRoad = useCallback((roadId: string) => {
    setRoads(prev => prev.filter(r => r.id !== roadId))
    setNodes(prev => prev.map(node => ({
      ...node,
      connectedRoadIds: node.connectedRoadIds.filter(id => id !== roadId)
    })))
    setSelectedRoadId(null)
  }, [])

  const handleDeleteNode = useCallback((nodeId: string) => {
    const nodeToDelete = nodes.find(n => n.id === nodeId)
    if (!nodeToDelete) return

    // Remove all roads connected to this node
    const roadsToDelete = nodeToDelete.connectedRoadIds
    setRoads(prev => prev.filter(r => !roadsToDelete.includes(r.id)))
    
    // Remove the node
    setNodes(prev => prev.filter(n => n.id !== nodeId))
    setSelectedNodeId(null)
  }, [nodes])

  const handleDeletePolygon = useCallback((polygonId: string) => {
    setPolygons(prev => prev.filter(p => p.id !== polygonId))
    setSelectedPolygonId(null)
  }, [])

  // Update handlers
  const handleUpdateRoadWidth = useCallback((roadId: string, newWidth: number) => {
    setRoads(prev => prev.map(road => 
      road.id === roadId ? { ...road, width: newWidth } : road
    ))
  }, [])

  const handleUpdateRoadName = useCallback((roadId: string, newName: string) => {
    setRoads(prev => prev.map(road => 
      road.id === roadId ? { ...road, name: newName } : road
    ))
  }, [])

  const handleUpdatePolygonName = useCallback((polygonId: string, newName: string) => {
    setPolygons(prev => prev.map(polygon => 
      polygon.id === polygonId ? { ...polygon, name: newName } : polygon
    ))
  }, [])

  const handleUpdatePolygonFillColor = useCallback((polygonId: string, newColor: string) => {
    setPolygons(prev => prev.map(polygon => 
      polygon.id === polygonId ? { ...polygon, fillColor: newColor } : polygon
    ))
  }, [])

  const handleUpdatePolygonStrokeColor = useCallback((polygonId: string, newColor: string) => {
    setPolygons(prev => prev.map(polygon => 
      polygon.id === polygonId ? { ...polygon, strokeColor: newColor } : polygon
    ))
  }, [])

  const handleUpdatePolygonOpacity = useCallback((polygonId: string, newOpacity: number) => {
    setPolygons(prev => prev.map(polygon => 
      polygon.id === polygonId ? { ...polygon, opacity: newOpacity } : polygon
    ))
  }, [])

  // Drawing mode change handler
  const handleDrawingModeChange = useCallback((mode: typeof drawingMode) => {
    setDrawingMode(mode)
    // Clear selections when changing modes
    setSelectedRoadId(null)
    setSelectedNodeId(null)
    setSelectedPolygonId(null)
    setSelectedBackgroundId(null)
    setConnectingFromNodeId(null)
    setSelectedRoadForDisconnect(null)
    
    // Cancel active sessions
    setBuildSession(prev => ({ ...prev, isActive: false, nodes: [] }))
    setPolygonSession(prev => ({ ...prev, isActive: false, points: [], roadIds: [] }))
  }, [])

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      backgroundImages.forEach(img => {
        URL.revokeObjectURL(img.url)
      })
    }
  }, [])

  return (
    <div className="h-screen flex flex-col bg-gray-50">
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
        {/* Left Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 p-4 overflow-y-auto">
          <div className="space-y-6">
            <DrawingTools
              drawingMode={drawingMode}
              onDrawingModeChange={handleDrawingModeChange}
            />

            <DisplayOptions
              showRoadLengths={showRoadLengths}
              showRoadNames={showRoadNames}
              showPolygons={showPolygons}
              showBackgrounds={showBackgrounds}
              onToggleRoadLengths={setShowRoadLengths}
              onToggleRoadNames={setShowRoadNames}
              onTogglePolygons={setShowPolygons}
              onToggleBackgrounds={setShowBackgrounds}
            />

            <ActionsPanel
              onRemoveLastElement={handleRemoveLastElement}
              onClearCanvas={handleClearCanvas}
            />
          </div>
        </div>

        {/* Main Canvas */}
        <RoadCanvas
          nodes={nodes}
          roads={roads}
          polygons={polygons}
          backgroundImages={backgroundImages}
          buildSession={buildSession}
          polygonSession={polygonSession}
          drawingMode={drawingMode}
          snapEnabled={snapEnabled}
          snapDistance={snapDistance}
          defaultRoadWidth={defaultRoadWidth}
          showRoadLengths={showRoadLengths}
          showRoadNames={showRoadNames}
          showPolygons={showPolygons}
          showBackgrounds={showBackgrounds}
          scaleMetersPerPixel={scaleMetersPerPixel}
          selectedRoadId={selectedRoadId}
          selectedNodeId={selectedNodeId}
          selectedPolygonId={selectedPolygonId}
          selectedBackgroundId={selectedBackgroundId}
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
          onSelectBackgroundImage={handleSelectBackgroundImage}
          onUpdateBackgroundImage={handleUpdateBackgroundImage}
        />

        {/* Right Sidebar */}
        <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
          <div className="space-y-6">
            {/* Background Images Panel */}
            {(drawingMode === "background" || selectedBackgroundId) && (
              <BackgroundImagePanel
                backgroundImages={backgroundImages}
                selectedBackgroundId={selectedBackgroundId}
                showBackgrounds={showBackgrounds}
                onAddBackgroundImage={handleAddBackgroundImage}
                onUpdateBackgroundImage={handleUpdateBackgroundImage}
                onDeleteBackgroundImage={handleDeleteBackgroundImage}
                onSelectBackgroundImage={handleSelectBackgroundImage}
                onToggleBackgrounds={setShowBackgrounds}
              />
            )}

            {/* Polygon Settings Panel */}
            {drawingMode === "polygon" && (
              <PolygonSettings
                fillColor={polygonFillColor}
                strokeColor={polygonStrokeColor}
                opacity={polygonOpacity}
                onFillColorChange={setPolygonFillColor}
                onStrokeColorChange={setPolygonStrokeColor}
                onOpacityChange={setPolygonOpacity}
              />
            )}

            {/* Selected Polygon Panel */}
            {selectedPolygon && (
              <SelectedPolygonPanel
                selectedPolygon={selectedPolygon}
                onDeletePolygon={handleDeletePolygon}
                onUpdatePolygonName={handleUpdatePolygonName}
                onUpdatePolygonFillColor={handleUpdatePolygonFillColor}
                onUpdatePolygonStrokeColor={handleUpdatePolygonStrokeColor}
                onUpdatePolygonOpacity={handleUpdatePolygonOpacity}
              />
            )}

            {/* Selected Item Panel */}
            {(selectedRoad || selectedNodeData) && !selectedPolygon && !selectedBackgroundId && (
              <SelectedItemPanel
                selectedRoad={selectedRoad}
                selectedNode={selectedNodeData}
                onDeleteRoad={handleDeleteRoad}
                onDeleteNode={handleDeleteNode}
                calculateRoadLength={calculateRoadLength}
                onUpdateRoadWidth={handleUpdateRoadWidth}
                onUpdateRoadName={handleUpdateRoadName}
              />
            )}

            {/* Road Settings Panel */}
            {!selectedRoad && !selectedNodeData && !selectedPolygon && !selectedBackgroundId && drawingMode !== "polygon" && drawingMode !== "background" && (
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
            )}
          </div>
        </div>
      </div>
    </div>
  )
}