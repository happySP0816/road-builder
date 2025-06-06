"use client"

import { useState, type MouseEvent, useEffect, useRef, useCallback } from "react"
import { type Road, type Node, type BuildSession, RoadType, type NodePoint } from "@/lib/road-types"
import RoadCanvas from "./road-canvas"
import StatusBar from "./status-bar"
import DrawingTools from "./drawing-tools"
import RoadSettings from "./road-settings"
import SelectedItemPanel from "./selected-item-panel"
import ActionsPanel from "./actions-panel"

// Helper function for distance from point to line segment
function distToSegmentSquared(p: { x: number; y: number }, v: { x: number; y: number }, w: { x: number; y: number }) {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2
  if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2
  t = Math.max(0, Math.min(1, t))
  return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2
}

function distToSegment(p: { x: number; y: number }, v: { x: number; y: number }, w: { x: number; y: number }) {
  return Math.sqrt(distToSegmentSquared(p, v, w))
}

export default function RoadBuilder() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [buildSession, setBuildSession] = useState<BuildSession>({
    nodes: [],
    isActive: false,
    roadType: RoadType.STRAIGHT,
    roadWidth: 10,
    isDraggingControlPoint: null,
    currentSegmentStartNodeIndex: null,
  })

  const buildSessionRef = useRef(buildSession)
  buildSessionRef.current = buildSession

  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snapDistance, setSnapDistance] = useState(20)
  const [defaultRoadWidth, setDefaultRoadWidth] = useState(10)
  const [drawingMode, setDrawingMode] = useState<"nodes" | "pan" | "move" | "select-node">("nodes")
  const [showRoadLengths, setShowRoadLengths] = useState(false)
  const [scaleMetersPerPixel, setScaleMetersPerPixel] = useState(0.1)
  const [selectedRoadId, setSelectedRoadId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)

  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 })
  const [isDraggingNode, setIsDraggingNode] = useState(false)
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
  const [isDraggingNewPointHandle, setIsDraggingNewPointHandle] = useState(false)
  const [draggedControlPointInfo, setDraggedControlPointInfo] = useState<{
    roadId: string
    pointIndex: 0 | 1
  } | null>(null)

  const completeBuildSession = useCallback(() => {
    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: RoadType.STRAIGHT,
      roadWidth: defaultRoadWidth,
      currentSegmentStartNodeIndex: null,
      isDraggingControlPoint: null,
    })
    setIsDraggingNewPointHandle(false)
  }, [defaultRoadWidth])

  const cancelBuildSession = useCallback(() => {
    setBuildSession({
      nodes: [],
      isActive: false,
      roadType: RoadType.STRAIGHT,
      roadWidth: defaultRoadWidth,
      currentSegmentStartNodeIndex: null,
      isDraggingControlPoint: null,
    })
    setIsDraggingNewPointHandle(false)
  }, [defaultRoadWidth])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (buildSessionRef.current.isActive) {
        if (event.key === "Enter") {
          event.preventDefault()
          completeBuildSession()
        } else if (event.key === "Escape") {
          event.preventDefault()
          cancelBuildSession()
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [completeBuildSession, cancelBuildSession])

  const getWorldCoordinates = (e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent): { x: number; y: number } => {
    const canvas = document.querySelector("canvas")
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - panOffset.x) / zoom
    const y = (e.clientY - rect.top - panOffset.y) / zoom
    return { x, y }
  }

  const findNearbyNode = (x: number, y: number, excludeIds: string[] = []): Node | null => {
    for (const node of nodes) {
      if (excludeIds.includes(node.id)) continue
      const distance = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2)
      if (distance <= snapDistance / zoom) {
        return node
      }
    }
    return null
  }

  const findNearbyControlPoint = (worldCoords: { x: number; y: number }): {
    roadId: string
    pointIndex: 0 | 1
  } | null => {
    if (!selectedNodeId) return null
    const selectedNode = nodes.find((n) => n.id === selectedNodeId)
    if (!selectedNode) return null

    for (const roadId of selectedNode.connectedRoadIds) {
      const road = roads.find((r) => r.id === roadId)
      if (!road || road.type !== RoadType.BEZIER || !road.controlPoints) continue

      if (road.startNodeId === selectedNodeId) {
        const cp = road.controlPoints[0]
        const distance = Math.sqrt((cp.x - worldCoords.x) ** 2 + (cp.y - worldCoords.y) ** 2)
        if (distance < 10 / zoom) {
          return { roadId: road.id, pointIndex: 0 }
        }
      }
      if (road.endNodeId === selectedNodeId) {
        const cp = road.controlPoints[1]
        const distance = Math.sqrt((cp.x - worldCoords.x) ** 2 + (cp.y - worldCoords.y) ** 2)
        if (distance < 10 / zoom) {
          return { roadId: road.id, pointIndex: 1 }
        }
      }
    }
    return null
  }

  const findRoadAtPosition = (worldCoords: { x: number; y: number }): Road | null => {
    const clickTolerance = 5 / zoom
    for (const road of roads) {
      const roadHalfWidth = road.width / 2 / zoom
      const effectiveTolerance = roadHalfWidth + clickTolerance

      if (road.type === RoadType.STRAIGHT) {
        if (distToSegment(worldCoords, road.start, road.end) < effectiveTolerance) {
          return road
        }
      } else if (road.type === RoadType.BEZIER && road.controlPoints) {
        const samples = 20
        let p0 = road.start
        for (let i = 1; i <= samples; i++) {
          const t = i / samples
          const mt = 1 - t
          const p1x =
            mt * mt * mt * road.start.x +
            3 * mt * mt * t * road.controlPoints[0].x +
            3 * mt * t * t * road.controlPoints[1].x +
            t * t * t * road.end.x
          const p1y =
            mt * mt * mt * road.start.y +
            3 * mt * mt * t * road.controlPoints[0].y +
            3 * mt * t * t * road.controlPoints[1].y +
            t * t * t * road.end.y
          const p1 = { x: p1x, y: p1y }
          if (distToSegment(worldCoords, p0, p1) < effectiveTolerance) {
            return road
          }
          p0 = p1
        }
      }
    }
    return null
  }

  const getSnappedPosition = (x: number, y: number, excludeNodeIds: string[] = []) => {
    const nearbyNode = findNearbyNode(x, y, excludeNodeIds)
    if (nearbyNode) {
      return { x: nearbyNode.x, y: nearbyNode.y, snappedToNodeId: nearbyNode.id }
    }
    if (snapEnabled) {
      const gridSize = snapDistance
      return {
        x: Math.round(x / gridSize) * gridSize,
        y: Math.round(y / gridSize) * gridSize,
        snappedToNodeId: null,
      }
    }
    return { x, y, snappedToNodeId: null }
  }

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const worldCoords = getWorldCoordinates(e)
    setMousePosition(worldCoords)

    if (drawingMode === "pan") {
      setIsPanning(true)
      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    if (drawingMode === "select-node") {
      const clickedControlPoint = findNearbyControlPoint(worldCoords)
      if (clickedControlPoint) {
        setIsDraggingNode(false)
        setDraggedControlPointInfo(clickedControlPoint)
        return
      }
      const clickedNode = findNearbyNode(worldCoords.x, worldCoords.y)
      if (clickedNode) {
        setSelectedNodeId(clickedNode.id)
        setSelectedRoadId(null)
        setIsDraggingNode(true)
        setDraggedNodeId(clickedNode.id)
      } else {
        setSelectedNodeId(null)
        setSelectedRoadId(null)
      }
      return
    }

    if (drawingMode === "move") {
      const clickedRoad = findRoadAtPosition(worldCoords)
      if (clickedRoad) {
        setSelectedRoadId(clickedRoad.id)
        setSelectedNodeId(null)
      } else {
        setSelectedRoadId(null)
      }
      return
    }

    if (drawingMode === "nodes") {
      const snappedPos = getSnappedPosition(worldCoords.x, worldCoords.y)
      const currentSession = buildSessionRef.current

      if (currentSession.isActive) {
        const firstNodeInSession = currentSession.nodes[0]
        
        // Check for closing the path by clicking on the first node
        if (
          snappedPos.snappedToNodeId &&
          snappedPos.snappedToNodeId === firstNodeInSession.id &&
          currentSession.nodes.length > 2
        ) {
          const lastPointInSession = currentSession.nodes[currentSession.nodes.length - 1]
          const roadId = `road-${Date.now()}`
          let closingRoad: Road

          const isLastSegmentBezier = buildSessionRef.current.roadType === RoadType.BEZIER

          if (isLastSegmentBezier && lastPointInSession.cp2) {
            const cp2ForStartOfClosingRoad = lastPointInSession.cp2
            const cp1ForEndOfClosingRoad = {
              x: firstNodeInSession.x - (lastPointInSession.cp2.x - lastPointInSession.x),
              y: firstNodeInSession.y - (lastPointInSession.cp2.y - lastPointInSession.y),
            }
            closingRoad = {
              id: roadId,
              start: { x: lastPointInSession.x, y: lastPointInSession.y },
              end: { x: firstNodeInSession.x, y: firstNodeInSession.y },
              startNodeId: lastPointInSession.id,
              endNodeId: firstNodeInSession.id,
              type: RoadType.BEZIER,
              width: currentSession.roadWidth,
              controlPoints: [cp2ForStartOfClosingRoad, cp1ForEndOfClosingRoad],
            }
          } else {
            closingRoad = {
              id: roadId,
              start: { x: lastPointInSession.x, y: lastPointInSession.y },
              end: { x: firstNodeInSession.x, y: firstNodeInSession.y },
              startNodeId: lastPointInSession.id,
              endNodeId: firstNodeInSession.id,
              type: RoadType.STRAIGHT,
              width: currentSession.roadWidth,
            }
          }
          setRoads((prev) => [...prev, closingRoad])
          setNodes((prevNodes) =>
            prevNodes.map((n) => {
              if (n.id === lastPointInSession.id || n.id === firstNodeInSession.id) {
                return { ...n, connectedRoadIds: [...n.connectedRoadIds, roadId] }
              }
              return n
            }),
          )
          completeBuildSession()
          return
        }

        // Add new point to existing session
        const existingNodeInfo = snappedPos.snappedToNodeId
          ? nodes.find((n) => n.id === snappedPos.snappedToNodeId)
          : null
        const newNodeId =
          snappedPos.snappedToNodeId || `node-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`

        const newPoint: NodePoint = {
          id: newNodeId,
          x: snappedPos.x,
          y: snappedPos.y,
          connectedRoadIds: existingNodeInfo ? existingNodeInfo.connectedRoadIds : [],
          cp1: { x: snappedPos.x, y: snappedPos.y },
          cp2: { x: snappedPos.x, y: snappedPos.y },
        }

        setBuildSession((prev) => ({
          ...prev,
          nodes: [...prev.nodes, newPoint],
          roadType: RoadType.STRAIGHT,
        }))
        setIsDraggingNewPointHandle(true)
      } else {
        // Start new session
        let startNodePoint: NodePoint
        const existingNode = snappedPos.snappedToNodeId ? nodes.find((n) => n.id === snappedPos.snappedToNodeId) : null

        if (existingNode) {
          startNodePoint = {
            ...existingNode,
            cp1: existingNode.cp1 || { x: existingNode.x, y: existingNode.y },
            cp2: existingNode.cp2 || { x: existingNode.x, y: existingNode.y },
          }
        } else {
          const newNodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
          startNodePoint = {
            id: newNodeId,
            x: snappedPos.x,
            y: snappedPos.y,
            connectedRoadIds: [],
            cp1: { x: snappedPos.x, y: snappedPos.y },
            cp2: { x: snappedPos.x, y: snappedPos.y },
          }
          setNodes((prev) => [
            ...prev,
            {
              id: startNodePoint.id,
              x: startNodePoint.x,
              y: startNodePoint.y,
              connectedRoadIds: [],
              cp1: startNodePoint.cp1,
              cp2: startNodePoint.cp2,
            },
          ])
        }

        setBuildSession({
          nodes: [startNodePoint],
          isActive: true,
          roadType: RoadType.STRAIGHT,
          roadWidth: defaultRoadWidth,
          currentSegmentStartNodeIndex: 0,
        })
        setIsDraggingNewPointHandle(true)
      }
    }
  }

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    const worldCoords = getWorldCoordinates(e)
    setMousePosition(worldCoords)

    if (isPanning) {
      const deltaX = e.clientX - lastPanPoint.x
      const deltaY = e.clientY - lastPanPoint.y
      setPanOffset((prev) => ({ x: prev.x + deltaX, y: prev.y + deltaY }))
      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    if (draggedControlPointInfo) {
      const { roadId, pointIndex } = draggedControlPointInfo
      setRoads((prevRoads) =>
        prevRoads.map((r) => {
          if (r.id === roadId && r.controlPoints) {
            const newControlPoints = [...r.controlPoints] as [{ x: number; y: number }, { x: number; y: number }]
            newControlPoints[pointIndex] = { x: worldCoords.x, y: worldCoords.y }
            return { ...r, controlPoints: newControlPoints }
          }
          return r
        }),
      )
      return
    }

    if (isDraggingNode && draggedNodeId) {
      const node = nodes.find((n) => n.id === draggedNodeId)
      if (node) {
        const snappedPos = getSnappedPosition(worldCoords.x, worldCoords.y, [draggedNodeId])
        setNodes((prev) => prev.map((n) => (n.id === draggedNodeId ? { ...n, ...snappedPos } : n)))
        setRoads((prevRoads) =>
          prevRoads.map((r) => {
            if (r.startNodeId === draggedNodeId) return { ...r, start: { x: snappedPos.x, y: snappedPos.y } }
            if (r.endNodeId === draggedNodeId) return { ...r, end: { x: snappedPos.x, y: snappedPos.y } }
            return r
          }),
        )
      }
      return
    }

    const currentSession = buildSessionRef.current
    if (
      drawingMode === "nodes" &&
      currentSession.isActive &&
      isDraggingNewPointHandle &&
      currentSession.nodes.length > 0
    ) {
      const currentPointIndex = currentSession.nodes.length - 1
      const currentPoint = currentSession.nodes[currentPointIndex]

      const dx = worldCoords.x - currentPoint.x
      const dy = worldCoords.y - currentPoint.y

      const newCp2 = { x: currentPoint.x + dx, y: currentPoint.y + dy }
      const newCp1ForCurrent = { x: currentPoint.x - dx, y: currentPoint.y - dy }

      setBuildSession((prev) => {
        const updatedNodes = [...prev.nodes]
        updatedNodes[currentPointIndex] = {
          ...updatedNodes[currentPointIndex],
          cp1: newCp1ForCurrent,
          cp2: newCp2,
        }
        return {
          ...prev,
          nodes: updatedNodes,
          roadType: RoadType.BEZIER,
        }
      })
    }
  }

  const handleMouseUp = (e: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
    setIsPanning(false)
    setIsDraggingNode(false)
    setDraggedNodeId(null)
    setDraggedControlPointInfo(null)

    const currentSession = buildSessionRef.current
    const wasDraggingHandle = isDraggingNewPointHandle
    setIsDraggingNewPointHandle(false)

    if (drawingMode === "nodes" && currentSession.isActive) {
      if (currentSession.nodes.length >= 2) {
        const lastPoint = currentSession.nodes[currentSession.nodes.length - 1]
        const secondLastPoint = currentSession.nodes[currentSession.nodes.length - 2]

        const newNodesToAdd: Node[] = []
        if (!nodes.find((n) => n.id === secondLastPoint.id)) {
          newNodesToAdd.push({
            id: secondLastPoint.id,
            x: secondLastPoint.x,
            y: secondLastPoint.y,
            connectedRoadIds: secondLastPoint.connectedRoadIds || [],
            cp1: secondLastPoint.cp1,
            cp2: secondLastPoint.cp2,
          })
        }
        if (!nodes.find((n) => n.id === lastPoint.id)) {
          newNodesToAdd.push({
            id: lastPoint.id,
            x: lastPoint.x,
            y: lastPoint.y,
            connectedRoadIds: lastPoint.connectedRoadIds || [],
            cp1: lastPoint.cp1,
            cp2: lastPoint.cp2,
          })
        }
        if (newNodesToAdd.length > 0) {
          setNodes((prev) => [...prev, ...newNodesToAdd])
        }

        const roadId = `road-${Date.now()}`
        let newRoad: Road

        if (currentSession.roadType === RoadType.BEZIER && wasDraggingHandle) {
          const cp2_start = secondLastPoint.cp2 || { x: secondLastPoint.x, y: secondLastPoint.y }
          const cp1_end = lastPoint.cp1 || { x: lastPoint.x, y: lastPoint.y }
          newRoad = {
            id: roadId,
            start: { x: secondLastPoint.x, y: secondLastPoint.y },
            end: { x: lastPoint.x, y: lastPoint.y },
            startNodeId: secondLastPoint.id,
            endNodeId: lastPoint.id,
            type: RoadType.BEZIER,
            width: currentSession.roadWidth,
            controlPoints: [cp2_start, cp1_end],
          }
        } else {
          newRoad = {
            id: roadId,
            start: { x: secondLastPoint.x, y: secondLastPoint.y },
            end: { x: lastPoint.x, y: lastPoint.y },
            startNodeId: secondLastPoint.id,
            endNodeId: lastPoint.id,
            type: RoadType.STRAIGHT,
            width: currentSession.roadWidth,
            controlPoints: [
              { x: secondLastPoint.x, y: secondLastPoint.y },
              { x: lastPoint.x, y: lastPoint.y },
            ],
          }
        }
        setRoads((prev) => [...prev, newRoad])

        setNodes((prevNodes) =>
          prevNodes.map((n) => {
            if (n.id === secondLastPoint.id || n.id === lastPoint.id) {
              const updatedNode = { ...n, connectedRoadIds: [...new Set([...n.connectedRoadIds, roadId])] }
              if (n.id === secondLastPoint.id && newRoad.type === RoadType.BEZIER && newRoad.controlPoints) {
                updatedNode.cp2 = newRoad.controlPoints[0]
              } else if (n.id === secondLastPoint.id && newRoad.type === RoadType.STRAIGHT) {
                updatedNode.cp2 = { x: n.x, y: n.y }
              }
              if (n.id === lastPoint.id && newRoad.type === RoadType.BEZIER && newRoad.controlPoints) {
                updatedNode.cp1 = newRoad.controlPoints[1]
              } else if (n.id === lastPoint.id && newRoad.type === RoadType.STRAIGHT) {
                updatedNode.cp1 = { x: n.x, y: n.y }
              }
              return updatedNode
            }
            return n
          }),
        )

        setBuildSession((prevSession) => {
          const updatedSessionNodes = prevSession.nodes.map((node, index) => {
            if (index === prevSession.nodes.length - 1) {
              return {
                ...node,
                cp2: { x: node.x, y: node.y },
                cp1: prevSession.nodes.length === 1 ? { x: node.x, y: node.y } : node.cp1,
              }
            }
            return node
          })

          return {
            ...prevSession,
            nodes: updatedSessionNodes,
            currentSegmentStartNodeIndex: updatedSessionNodes.length - 1,
            roadType: RoadType.STRAIGHT,
            isDraggingControlPoint: null,
          }
        })
      }
    }
  }

  useEffect(() => {
    const handleGlobalMouseMove = (event: globalThis.MouseEvent) => {
      if (
        isPanning ||
        draggedControlPointInfo ||
        (drawingMode === "nodes" && buildSessionRef.current.isActive && isDraggingNewPointHandle) ||
        isDraggingNode
      ) {
        handleMouseMove(event as any)
      }
    }
    const handleGlobalMouseUp = (event: globalThis.MouseEvent) => {
      if (
        isPanning ||
        draggedControlPointInfo ||
        (drawingMode === "nodes" && buildSessionRef.current.isActive && isDraggingNewPointHandle) ||
        isDraggingNode
      ) {
        handleMouseUp(event as any)
      }
    }

    if (
      isPanning ||
      draggedControlPointInfo ||
      (drawingMode === "nodes" && buildSessionRef.current.isActive && isDraggingNewPointHandle) ||
      isDraggingNode
    ) {
      window.addEventListener("mousemove", handleGlobalMouseMove)
      window.addEventListener("mouseup", handleGlobalMouseUp)
    }
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove)
      window.removeEventListener("mouseup", handleGlobalMouseUp)
    }
  }, [isPanning, draggedControlPointInfo, drawingMode, isDraggingNewPointHandle, isDraggingNode, panOffset, zoom])

  const calculateRoadLength = (road: Road): number => {
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
  }

  const deleteNode = (nodeId: string) => {
    const nodeToDelete = nodes.find((n) => n.id === nodeId)
    if (!nodeToDelete) return

    const roadsToRemove = roads.filter((r) => r.startNodeId === nodeId || r.endNodeId === nodeId)
    const roadIdsToRemove = roadsToRemove.map((r) => r.id)

    setRoads((prev) => prev.filter((r) => !roadIdsToRemove.includes(r.id)))
    setNodes((prev) =>
      prev
        .filter((n) => n.id !== nodeId)
        .map((n) => ({
          ...n,
          connectedRoadIds: n.connectedRoadIds.filter((id) => !roadIdsToRemove.includes(id)),
        })),
    )
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    if (buildSessionRef.current.isActive && buildSessionRef.current.nodes.some((n) => n.id === nodeId)) {
      cancelBuildSession()
    }
  }

  const deleteRoad = (roadId: string) => {
    const roadToDelete = roads.find((r) => r.id === roadId)
    if (!roadToDelete) return

    setRoads((prev) => prev.filter((r) => r.id !== roadId))
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        connectedRoadIds: n.connectedRoadIds.filter((id) => id !== roadId),
      })),
    )
    if (selectedRoadId === roadId) setSelectedRoadId(null)
  }

  const clearCanvas = () => {
    setNodes([])
    setRoads([])
    cancelBuildSession()
    setSelectedNodeId(null)
    setSelectedRoadId(null)
  }

  const removeLastElement = () => {
    const currentSession = buildSessionRef.current
    if (currentSession.isActive && currentSession.nodes.length > 0) {
      if (currentSession.nodes.length === 1) {
        const startNodeId = currentSession.nodes[0].id
        cancelBuildSession()
        const nodeToRemove = nodes.find((n) => n.id === startNodeId && n.connectedRoadIds.length === 0)
        if (nodeToRemove && !roads.some((r) => r.startNodeId === startNodeId || r.endNodeId === startNodeId)) {
          setNodes((prev) => prev.filter((n) => n.id !== startNodeId))
        }
        return
      }

      const roadToRemove = roads.find(
        (r) =>
          r.endNodeId === currentSession.nodes[currentSession.nodes.length - 1].id &&
          r.startNodeId === currentSession.nodes[currentSession.nodes.length - 2]?.id,
      )
      if (roadToRemove) {
        deleteRoad(roadToRemove.id)
      }

      const lastPointRemoved = currentSession.nodes[currentSession.nodes.length - 1]
      const remainingNodesInSession = currentSession.nodes.slice(0, -1)

      setBuildSession((prev) => ({
        ...prev,
        nodes: remainingNodesInSession,
        roadType: remainingNodesInSession.length > 1 ? prev.roadType : RoadType.STRAIGHT,
      }))

      const nodeInMainList = nodes.find((n) => n.id === lastPointRemoved.id)
      if (
        nodeInMainList &&
        nodeInMainList.connectedRoadIds.length === 0 &&
        !roads.some((r) => r.startNodeId === lastPointRemoved.id || r.endNodeId === lastPointRemoved.id)
      ) {
        const updatedNode = nodes.find((n) => n.id === lastPointRemoved.id)
        if (updatedNode && updatedNode.connectedRoadIds.length === 0) {
          setNodes((prev) => prev.filter((n) => n.id !== lastPointRemoved.id))
        }
      }
    } else if (roads.length > 0) {
      const lastRoad = roads[roads.length - 1]
      deleteRoad(lastRoad.id)
    }
  }

  const zoomIn = () => setZoom((prev) => Math.min(prev * 1.2, 5))
  const zoomOut = () => setZoom((prev) => Math.max(prev / 1.2, 0.1))
  const resetZoom = () => {
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
  }

  const onUpdateRoadWidth = (roadId: string, newWidth: number) => {
    setRoads((prevRoads) => prevRoads.map((r) => (r.id === roadId ? { ...r, width: newWidth } : r)))
  }

  const selectedRoadData = roads.find((r) => r.id === selectedRoadId) || null
  const selectedNodeData = nodes.find((n) => n.id === selectedNodeId) || null
  const totalLength = roads.reduce((sum, road) => sum + calculateRoadLength(road), 0)

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex-1 flex flex-col">
        <StatusBar
          roadCount={roads.length}
          nodeCount={nodes.length}
          totalLength={totalLength}
          zoom={zoom}
          buildSession={buildSession}
        />
        <RoadCanvas
          nodes={nodes}
          roads={roads}
          buildSession={buildSession}
          drawingMode={drawingMode}
          snapEnabled={snapEnabled}
          snapDistance={snapDistance}
          defaultRoadWidth={defaultRoadWidth}
          showRoadLengths={showRoadLengths}
          scaleMetersPerPixel={scaleMetersPerPixel}
          selectedRoadId={selectedRoadId}
          selectedNodeId={selectedNodeId}
          selectedNodeData={selectedNodeData}
          panOffset={panOffset}
          zoom={zoom}
          mousePosition={mousePosition}
          isActivelyDrawingCurve={isDraggingNewPointHandle && buildSession.roadType === RoadType.BEZIER}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onCompleteBuildSession={completeBuildSession}
          onCancelBuildSession={cancelBuildSession}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetZoom={resetZoom}
        />
      </div>
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <DrawingTools drawingMode={drawingMode} onDrawingModeChange={setDrawingMode} />
          <RoadSettings
            defaultRoadWidth={defaultRoadWidth}
            scaleMetersPerPixel={scaleMetersPerPixel}
            snapDistance={snapDistance}
            curvedRoads={false}
            snapEnabled={snapEnabled}
            showRoadLengths={showRoadLengths}
            onDefaultRoadWidthChange={setDefaultRoadWidth}
            onScaleChange={setScaleMetersPerPixel}
            onSnapDistanceChange={setSnapDistance}
            onCurvedRoadsChange={() => {}}
            onSnapEnabledChange={setSnapEnabled}
            onShowRoadLengthsChange={setShowRoadLengths}
          />
          <SelectedItemPanel
            selectedRoad={selectedRoadData}
            selectedNode={selectedNodeData}
            onDeleteRoad={deleteRoad}
            onDeleteNode={deleteNode}
            calculateRoadLength={calculateRoadLength}
            onUpdateRoadWidth={onUpdateRoadWidth}
          />
          <ActionsPanel onRemoveLastElement={removeLastElement} onClearCanvas={clearCanvas} />
        </div>
      </div>
    </div>
  )
}