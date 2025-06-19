import { type Node, type Road, type Polygon, type BackgroundImage } from "./road-types"

export interface CanvasState {
  nodes: Node[]
  roads: Road[]
  polygons: Polygon[]
  backgroundImages: BackgroundImage[]
  panOffset: { x: number; y: number }
  zoom: number
}

export function saveCanvasState(state: CanvasState): string {
  // Convert background images to data URLs if they aren't already
  const processedState = {
    ...state,
    backgroundImages: state.backgroundImages.map(img => ({
      ...img,
      // Keep the data URL as is, but remove any file:// URLs for security
      src: img.src.startsWith('data:') ? img.src : ''
    }))
  }
  
  return JSON.stringify(processedState)
}

export function loadCanvasState(savedState: string): CanvasState {
  try {
    const state = JSON.parse(savedState) as CanvasState
    return state
  } catch (error) {
    console.error('Error loading canvas state:', error)
    throw new Error('Invalid canvas state file')
  }
}

export function downloadCanvasState(state: CanvasState, filename: string = 'canvas-state.json') {
  const jsonString = saveCanvasState(state)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function readCanvasStateFile(file: File): Promise<CanvasState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const state = loadCanvasState(e.target?.result as string)
        resolve(state)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(new Error('Error reading file'))
    reader.readAsText(file)
  })
} 