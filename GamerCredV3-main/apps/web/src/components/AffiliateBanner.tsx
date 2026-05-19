const TAG = 'ggr04-21';

interface Product {
  title: string;
  blurb: string;
  asin: string;
  badge: string;
}

const PRODUCTS: Product[] = [
  { title: 'GAMING HEADSETS', blurb: 'IMMERSIVE 7.1 SURROUND', asin: 'B07YHDD6BS', badge: 'AUDIO' },
  { title: 'GAMING MICE', blurb: 'TOURNAMENT-GRADE SENSORS', asin: 'B07GBZ4Q68', badge: 'PRECISION' },
  { title: 'MECH KEYBOARDS', blurb: 'CHERRY MX CLICKY ACTION', asin: 'B07DRDFJYC', badge: 'CLACK' },
  { title: 'GAMING CHAIRS', blurb: 'ALL-NIGHT COMFORT', asin: 'B07GBV1XR8', badge: 'POSTURE' },
  { title: 'CURVED MONITORS', blurb: '165HZ ULTRAWIDE PANELS', asin: 'B08HHQX1FZ', badge: 'DISPLAY' },
  { title: 'STEAM GIFT CARDS', blurb: 'TOP UP YOUR WALLET', asin: 'B0775KQHYM', badge: 'CREDIT' },
];

function link(asin: string) {
  return `https://www.amazon.in/dp/${asin}?tag=${TAG}`;
}

export default function AffiliateBanner({ variant = 'wide' }: { variant?: 'wide' | 'compact' }) {
  if (variant === 'compact') {
    const three = PRODUCTS.slice(0, 3);
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {three.map((p) => (
          <a
            key={p.asin}
            href={link(p.asin)}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="panel block p-3 hover:border-neonMagenta/70 transition"
          >
            <span className="corner-tl" /><span className="corner-tr" />
            <span className="corner-bl" /><span className="corner-br" />
            <div className="text-xs text-neonMagenta mb-1">// {p.badge}</div>
            <div className="neon text-base">{p.title}</div>
            <div className="text-sm text-neonCyan/60">{p.blurb}</div>
          </a>
        ))}
      </div>
    );
  }

  const first = PRODUCTS[0];
  return (
    <a
      href={link(first.asin)}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className="panel panel-mag block px-6 py-4 hover:border-neonMagenta/80 transition"
    >
      <span className="corner-tl" /><span className="corner-tr" />
      <span className="corner-bl" /><span className="corner-br" />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-neonMagenta">// SPONSORED · AMAZON.IN</div>
          <div className="neon-mag text-2xl uppercase">LEVEL UP YOUR RIG</div>
          <div className="text-base text-neonCyan/80">CURATED GEAR FOR SERIOUS GAMERS</div>
        </div>
        <span className="btn-mag">SHOP NOW &rarr;</span>
      </div>
    </a>
  );
}

export function AffiliateRowFull() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
      {PRODUCTS.map((p) => (
        <a
          key={p.asin}
          href={link(p.asin)}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className="panel block p-2 text-center hover:border-neonMagenta/70 transition"
        >
          <span className="corner-tl" /><span className="corner-tr" />
          <span className="corner-bl" /><span className="corner-br" />
          <div className="text-xs text-neonMagenta">// {p.badge}</div>
          <div className="neon text-sm">{p.title}</div>
        </a>
      ))}
    </div>
  );
}
