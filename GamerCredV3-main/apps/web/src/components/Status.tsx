export function LoadingScreen({ label = 'LOADING DATA' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="neon text-2xl uppercase tracking-widest cursor">{label}</div>
    </div>
  );
}

export function ErrorScreen({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-2 text-center">
      <div className="neon-mag text-3xl uppercase tracking-widest">CRITICAL ERROR</div>
      <div className="neon text-lg uppercase">RETRIEVING DATA</div>
      <div className="text-base text-neonCyan/70 uppercase">RETRY CONNECTION</div>
      {message && <div className="mt-3 text-sm text-neonMagenta/70 max-w-md">{message}</div>}
    </div>
  );
}
