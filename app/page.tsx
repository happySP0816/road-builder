import RoadBuilder from "@/components/road-builder"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gray-100">
      <div className="w-full max-w-5xl space-y-4">
        <h1 className="text-3xl font-bold text-center">Road Builder</h1>
        <p className="text-center text-gray-600">
          Click to place nodes. Hold Shift while placing to enable snapping. Press 'C' to toggle curved roads. Press
          'Delete' to remove the last node.
        </p>
        <RoadBuilder />
      </div>
    </main>
  )
}
