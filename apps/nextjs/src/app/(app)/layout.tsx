export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
      <div className="h-screen w-screen p-2">
        <div className="w-full h-full bg-card/80 rounded-4xl">
          {children}
        </div>
      </div>
    );
}