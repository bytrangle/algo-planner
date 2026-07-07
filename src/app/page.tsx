import AlgoMap from "../components/AlgoMap/AlgoMap";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 sm:items-start">
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            AlgoMap
          </h1>
          <p>Practice algorithm problems smarter with the power of visualization and AI.</p>
        </div>
        {/* First div escapes the `max-w-3xl` constraint by the main layout */}
        <div className="w-screen relative left-1/2 -translate-x-1/2">
          {/* Second div prevents svg from getting too wide on huge screen */}
          <div className="max-w-7xl mx-auto px-4 pb-16">
            <AlgoMap />
          </div>
        </div>
      </main>
    </div>
  );
}
